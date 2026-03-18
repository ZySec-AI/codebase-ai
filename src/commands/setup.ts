import { resolve, dirname } from "node:path";
import { writeFileSync, existsSync, mkdirSync, readFileSync, chmodSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import type { CLIOptions, Manifest } from "../types.js";
import { runScan } from "./scan.js";
import { detectTools } from "../integrations/index.js";
import { claudeIntegration } from "../integrations/claude.js";
import { updateGitignore } from "../integrations/gitignore.js";
import { installHooks } from "../integrations/githook.js";
import { log, success, info, warn, heading } from "../utils/output.js";

// ─── Vibekit labels ──────────────────────────────────────────────
const VIBEKIT_LABELS = [
  { name: "bug",         color: "d73a4a", description: "Something isn't working" },
  { name: "arch",        color: "0075ca", description: "Architectural change needed" },
  { name: "sim",         color: "e4e669", description: "Found by simulation" },
  { name: "carry",       color: "ff6b35", description: "Bug surviving 2+ cycles" },
  { name: "cycle",       color: "c5def5", description: "Simulation cycle summary" },
  { name: "critical",    color: "b60205", description: "Critical severity" },
  { name: "high",        color: "d93f0b", description: "High severity" },
  { name: "medium",      color: "e99695", description: "Medium severity" },
  { name: "low",         color: "fef2c0", description: "Low severity" },
  { name: "highlight",   color: "0e8a16", description: "Positive product signal" },
  { name: "vibekit",     color: "7057ff", description: "Queued for autonomous build" },
  { name: "performance", color: "ff8c00", description: "Performance issue" },
  { name: "review",      color: "1d76db", description: "Found by code review" },
];

export async function runSetup(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  // ── Step 1: Full scan ──────────────────────────────────────────
  await runScan({ ...options, sync: true });

  // ── Step 2: AI tool integration ───────────────────────────────
  heading("AI Tool Integration");
  let tools = detectTools(root);
  if (options.tools.length) {
    tools = tools.filter(t => options.tools.includes(t.name));
  }
  if (tools.length === 0 && !options.tools.length) {
    info("No AI tool configs detected. Creating CLAUDE.md...");
    writeFileSync(join(root, "CLAUDE.md"), "# Project Rules\n", "utf-8");
    tools = [claudeIntegration];
  }

  if (options.dryRun) {
    log("\nDry run - would configure:");
    tools.forEach(t => info(t.name));
    log("\nDone (dry run).");
    return;
  }

  for (const tool of tools) {
    tool.inject(root);
    success(`${tool.name} - added .codebase.json reference`);
  }

  // ── Step 3: Git hooks ─────────────────────────────────────────
  heading("Git Hooks");
  const hookInstalled = installHooks(root, false);
  if (hookInstalled) {
    success("post-commit hook (auto-updates .codebase.json)");
    installBranchHook(root);
    success("commit-msg hook (blocks direct commits to main/master)");
  } else {
    info("Not a git repository - skipping hooks");
  }

  // ── Step 4: Claude commands ───────────────────────────────────
  heading("Claude Commands");
  const claudeAvailable = await checkClaude();
  if (!claudeAvailable) {
    warn("Claude Code CLI not detected — skipping slash commands");
    warn("Install Claude Code then re-run: codebase setup");
  } else {
    installClaudeCommands(root);
  }

  // ── Step 5: Gitignore ─────────────────────────────────────────
  updateGitignore(root);
  appendToGitignore(root, [
    ".vibekit/daemon.lock",
    ".vibekit/daemon.log",
    ".vibekit/build.lock",
    ".vibekit/_pw_*",
  ]);
  success(".gitignore updated");

  // ── Step 6: .vibekit/ dir ─────────────────────────────────────
  heading("Vibekit Bootstrap");
  const vibedir = join(root, ".vibekit");
  if (!existsSync(vibedir)) {
    mkdirSync(vibedir, { recursive: true });
    success(".vibekit/ directory created");
  } else {
    info(".vibekit/ already exists");
  }

  // ── Step 7: GitHub labels ─────────────────────────────────────
  heading("GitHub Labels");
  const ghAvailable = await checkGh();
  if (!ghAvailable) {
    warn("gh CLI not authenticated — skipping label/issue setup");
    warn("Run: gh auth login  then  codebase setup");
  } else {
    await installLabels(root);
    await ensureHighlightsIndex(root);
  }

  // ── Step 8: GitHub Actions ────────────────────────────────────
  heading("GitHub Actions");
  if (ghAvailable) {
    installGitHubActions(root);
  } else {
    info("Skipping GitHub Actions (gh not authenticated)");
  }

  // ── Step 9: docs/PRODUCT.md ───────────────────────────────────
  heading("Product Brief");
  const docsDir = join(root, "docs");
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });

  const productPath = join(docsDir, "PRODUCT.md");
  if (!existsSync(productPath)) {
    generateProductMd(root, productPath);
    success("docs/PRODUCT.md generated — review and fill in [INFERRED] sections");
  } else {
    info("docs/PRODUCT.md already exists — skipping (delete to regenerate)");
  }

  log("\nDone! Your project is wired for AI + autonomous loop.");
  log("\n  1. Review docs/PRODUCT.md and fill in any [INFERRED] sections");
  log("  2. /simulate   — AI customer journeys find & fix bugs");
  log("  3. /build      — implement architectural issues autonomously");
  log("  4. /launch     — gate check, release, merge to main");
}

// ─── Claude commands installation ────────────────────────────────

export function installClaudeCommandsForFix(root: string): void {
  installClaudeCommands(root);
}

function installClaudeCommands(root: string): void {
  // commands/ is always a sibling of dist/ in the npm package
  // (dist/commands/setup.js → ../commands/ OR dist/index.js → ../commands/)
  const commandsSource = join(dirname(new URL(import.meta.url).pathname), "..", "commands");

  if (!existsSync(commandsSource)) {
    warn("Claude commands not found in package — skipping");
    return;
  }

  const destDir = join(root, ".claude", "commands");
  mkdirSync(destDir, { recursive: true });

  const files = readdirSync(commandsSource).filter(f => f.endsWith(".md"));
  let installed = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const src = join(commandsSource, file);
    const dest = join(destDir, file);
    if (existsSync(dest)) {
      // Update if source content differs (package upgrade)
      const srcContent = readFileSync(src, "utf-8");
      const destContent = readFileSync(dest, "utf-8");
      if (srcContent !== destContent) {
        copyFileSync(src, dest);
        updated++;
      } else {
        skipped++;
      }
    } else {
      copyFileSync(src, dest);
      installed++;
    }
  }

  const parts: string[] = [];
  if (installed > 0) parts.push(`${installed} new`);
  if (updated > 0) parts.push(`${updated} updated`);
  if (skipped > 0) parts.push(`${skipped} unchanged`);

  if (installed > 0 || updated > 0) {
    success(`Claude commands installed → .claude/commands/ (${parts.join(", ")})`);
    info("Available: /setup /simulate /build /launch /review /pitch /daemon");
    info("Tip: commit .claude/commands/ to share these with your team");
  } else {
    info(`All ${skipped} Claude commands up to date`);
  }
}

// ─── commit-msg hook: block commits directly to main/master ─────

function installBranchHook(root: string): void {
  const hooksDir = join(root, ".git", "hooks");
  const hookPath = join(hooksDir, "commit-msg");
  const marker = "# codebase-branch-check";

  const script = `#!/bin/sh
${marker}
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo ""
  echo "  Direct commits to $BRANCH are not allowed."
  echo "  Switch to develop:  git checkout develop"
  echo "  Release via:        codebase release"
  echo ""
  exit 1
fi
`;

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8");
    if (!existing.includes(marker)) {
      writeFileSync(hookPath, existing.trimEnd() + "\n\n" + script, "utf-8");
    }
  } else {
    writeFileSync(hookPath, script, "utf-8");
  }
  chmodSync(hookPath, 0o755);
}

// ─── .gitignore helper ───────────────────────────────────────────

function appendToGitignore(root: string, lines: string[]): void {
  const p = join(root, ".gitignore");
  const existing = existsSync(p) ? readFileSync(p, "utf-8") : "";
  const toAdd = lines.filter(l => !existing.includes(l)).join("\n");
  if (toAdd) writeFileSync(p, existing.trimEnd() + "\n" + toAdd + "\n", "utf-8");
}

// ─── gh helpers ──────────────────────────────────────────────────

function execGh(root: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise(resolve => {
    execFile("gh", args, { cwd: root, timeout: 15_000 }, (err, stdout) => {
      resolve({ ok: !err, stdout: (stdout || "").trim() });
    });
  });
}

async function checkClaude(): Promise<boolean> {
  return new Promise(resolve => {
    execFile("claude", ["--version"], { timeout: 5_000 }, err => resolve(!err));
  });
}

async function checkGh(): Promise<boolean> {
  return new Promise(resolve => {
    execFile("gh", ["auth", "status"], { timeout: 5_000 }, err => resolve(!err));
  });
}

async function installLabels(root: string): Promise<void> {
  const { stdout } = await execGh(root, [
    "label", "list", "--limit", "100", "--json", "name", "--jq", ".[].name",
  ]);
  const existing = new Set(stdout.split("\n").filter(Boolean));

  let created = 0;
  for (const label of VIBEKIT_LABELS) {
    if (existing.has(label.name)) continue;
    const { ok } = await execGh(root, [
      "label", "create", label.name,
      "--color", label.color,
      "--description", label.description,
    ]);
    if (ok) created++;
  }

  const skipped = VIBEKIT_LABELS.length - created;
  if (created > 0) success(`${created} GitHub labels created (${skipped} already existed)`);
  else info(`All ${VIBEKIT_LABELS.length} labels already exist`);
}

async function ensureHighlightsIndex(root: string): Promise<void> {
  const { stdout } = await execGh(root, [
    "issue", "list", "--search", "Highlights Index",
    "--state", "all", "--limit", "1",
    "--json", "number", "--jq", ".[0].number // empty",
  ]);
  if (stdout) {
    info("Highlights Index issue already exists");
    return;
  }

  const body = `# Product Highlights Index

Tracks positive signals from /simulate cycles. Updated automatically — do not edit manually.

## Index
<!-- /simulate appends here -->`;

  const { ok } = await execGh(root, [
    "issue", "create",
    "--title", "Highlights Index",
    "--label", "highlight",
    "--body", body,
  ]);
  if (ok) success("Highlights Index issue created on GitHub");
  else warn("Could not create Highlights Index issue");
}

// ─── GitHub Actions workflow ─────────────────────────────────────

export function installGitHubActionsForFix(root: string): void {
  installGitHubActions(root);
}

function installGitHubActions(root: string): void {
  const workflowsDir = join(root, ".github", "workflows");
  mkdirSync(workflowsDir, { recursive: true });

  const workflowPath = join(workflowsDir, "codebase.yml");
  if (existsSync(workflowPath)) {
    info(".github/workflows/codebase.yml already exists — skipping");
    return;
  }

  const workflow = `# Codebase autonomous build workflow
# Runs on every push to develop + scheduled every 15 minutes
# Replaces the local daemon — GitHub runs the build loop in the cloud

name: codebase

on:
  push:
    branches: [develop]
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:
    inputs:
      command:
        description: 'Slash command to run (default: /build --once)'
        required: false
        default: '/build --once'

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: \${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install codebase
        run: npm install -g codebase

      - name: Project brief
        run: npx codebase brief
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Run autonomous build
        run: |
          CMD="\${{ github.event.inputs.command || '/build --once' }}"
          claude --print "\$CMD"
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

  writeFileSync(workflowPath, workflow, "utf-8");
  success(".github/workflows/codebase.yml created");
  info("Add ANTHROPIC_API_KEY to GitHub repo secrets to activate");
  info("Go to: Settings → Secrets → Actions → New repository secret");
}

// ─── PRODUCT.md skeleton from manifest ───────────────────────────

function generateProductMd(root: string, outputPath: string): void {
  const manifestPath = join(root, ".codebase.json");
  let manifest: Manifest | null = null;
  if (existsSync(manifestPath)) {
    try { manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest; } catch { /* ignore */ }
  }

  const name = manifest?.project?.name ?? "[INFERRED: project name]";
  const description = manifest?.project?.description ?? "[INFERRED: one-line description]";
  const langs = (manifest?.stack?.languages ?? []).join(", ") || "[INFERRED]";
  const frameworks = (manifest?.stack?.frameworks ?? []).join(", ") || "[INFERRED]";
  const devCmd = manifest?.commands?.dev ?? "[INFERRED]";
  const buildCmd = manifest?.commands?.build ?? "[INFERRED]";
  const testCmd = manifest?.commands?.test ?? "[INFERRED]";

  writeFileSync(outputPath, `# PRODUCT.md — ${name}

> Auto-generated by \`codebase setup\`. Fill in any [INFERRED] sections.

## Summary

${description}

## ICP (Ideal Customer Profile)

- **Company size:** [INFERRED: e.g. 10–500 employees]
- **Industry:** [INFERRED: e.g. SaaS, FinTech, DevTools]
- **Geography:** [INFERRED: e.g. North America, Europe]
- **Buyer role:** [INFERRED: e.g. CTO, Engineering Manager]

## User Roles

| Role | Description | Primary Use Cases |
|------|-------------|------------------|
| [Role 1] | [INFERRED] | [INFERRED] |
| [Role 2] | [INFERRED] | [INFERRED] |

## Pain Points

1. [INFERRED: primary pain point]
2. [INFERRED: secondary pain point]
3. [INFERRED: tertiary pain point]

## Competitive Context

- **Alternatives:** [INFERRED: what users do without this product]
- **Key differentiators:** [INFERRED: why we win]

## Tech Stack (auto-detected)

- **Languages:** ${langs}
- **Frameworks:** ${frameworks}
- **Dev command:** \`${devCmd}\`
- **Build command:** \`${buildCmd}\`
- **Test command:** \`${testCmd}\`

## Dev Credentials

- **Default seed creds:** \`{role}@dev.local\` / \`dev123456\`
- **Dev login path:** [INFERRED: e.g. /dev-login or /auth/login]

## Known Constraints

- [INFERRED: e.g. multi-tenant, RBAC, GDPR]
`, "utf-8");
}
