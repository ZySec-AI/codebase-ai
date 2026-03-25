import { resolve, dirname, join } from "node:path";
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  chmodSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { execFile } from "node:child_process";
import type { CLIOptions, Manifest } from "../types.js";
import { runScan } from "./scan.js";
import { claudeIntegration } from "../integrations/claude.js";
import { updateGitignore } from "../integrations/gitignore.js";
import { installHooks } from "../integrations/githook.js";
import { log, success, info, warn, heading } from "../utils/output.js";

// ─── Vibekit labels ──────────────────────────────────────────────
const VIBEKIT_LABELS = [
  { name: "bug", color: "d73a4a", description: "Something isn't working" },
  { name: "arch", color: "0075ca", description: "Architectural change needed" },
  { name: "sim", color: "e4e669", description: "Found by simulation" },
  { name: "carry", color: "ff6b35", description: "Bug surviving 2+ cycles" },
  { name: "cycle", color: "c5def5", description: "Simulation cycle summary" },
  { name: "critical", color: "b60205", description: "Critical severity" },
  { name: "high", color: "d93f0b", description: "High severity" },
  { name: "medium", color: "e99695", description: "Medium severity" },
  { name: "low", color: "fef2c0", description: "Low severity" },
  { name: "highlight", color: "0e8a16", description: "Positive product signal" },
  { name: "vibekit", color: "7057ff", description: "Queued for autonomous build" },
  { name: "performance", color: "ff8c00", description: "Performance issue" },
  { name: "review", color: "1d76db", description: "Found by code review" },
];

export async function runSetup(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  // ── Step 1: Full scan ──────────────────────────────────────────
  await runScan({ ...options, sync: true });

  // ── Step 2: Claude Code integration ──────────────────────────
  heading("Claude Code Integration");
  if (!existsSync(join(root, "CLAUDE.md"))) {
    writeFileSync(join(root, "CLAUDE.md"), "# Project Rules\n", "utf-8");
  }
  claudeIntegration.inject(root);
  success("CLAUDE.md - added .codebase.json reference");

  // ── Step 3: Git hooks ─────────────────────────────────────────
  heading("Git Hooks");
  const hookInstalled = installHooks(root, false);
  if (hookInstalled) {
    success("post-commit hook (auto-updates .codebase.json)");
    success("pre-commit hook (runs typecheck + lint before every commit)");
    installBranchHook(root);
    success("commit-msg hook (blocks direct commits to main/master)");
  } else {
    info("Not a git repository - skipping hooks");
  }

  // ── Step 3b: Claude Code hooks ────────────────────────────────
  heading("Claude Code Hooks");
  installClaudeHooks(root);

  // ── Step 3c: agent-browser ────────────────────────────────────
  heading("Browser Automation");
  await installAgentBrowser();

  // ── Step 4: Claude commands ───────────────────────────────────
  heading("Claude Commands");
  installClaudeCommands(root);

  // ── Step 4b: Claude skills ──────────────────────────────────
  heading("Claude Skills");
  installClaudeSkills(root);

  // ── Step 5: Gitignore ─────────────────────────────────────────
  updateGitignore(root);
  appendToGitignore(root, [
    ".vibekit/daemon.lock",
    ".vibekit/daemon.log",
    ".vibekit/build.lock",
    ".vibekit/milestone.env",
    ".mcp.json",
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

  // ── Step 8: docs/PRODUCT.md ───────────────────────────────────
  heading("Product Brief");
  const docsDir = join(root, "docs");
  if (!existsSync(docsDir)) {
    mkdirSync(docsDir, { recursive: true });
  }

  const productPath = join(docsDir, "PRODUCT.md");
  if (!existsSync(productPath)) {
    generateProductMd(root, productPath);
    success("docs/PRODUCT.md generated — review and fill in [INFERRED] sections");
  } else {
    info("docs/PRODUCT.md already exists — skipping (delete to regenerate)");
  }

  log("\nDone! Your project is wired for AI + autonomous loop.");
  log("\n  0. codebase brief    — load project context (AI agents: call this first)");
  log("  1. Review docs/PRODUCT.md and fill in any [INFERRED] sections");
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

  const files = readdirSync(commandsSource).filter((f) => f.endsWith(".md"));

  // Install to both project-local (.claude/commands/) and user-global (~/.claude/commands/)
  const destinations: Array<{ dir: string; label: string }> = [
    { dir: join(root, ".claude", "commands"), label: ".claude/commands/" },
    { dir: join(process.env["HOME"] ?? "~", ".claude", "commands"), label: "~/.claude/commands/" },
  ];

  let totalInstalled = 0;
  let totalUpdated = 0;

  for (const { dir, label } of destinations) {
    mkdirSync(dir, { recursive: true });

    let installed = 0;
    let updated = 0;
    let skipped = 0;

    for (const file of files) {
      const src = join(commandsSource, file);
      const dest = join(dir, file);
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
    if (installed > 0) {
      parts.push(`${installed} new`);
    }
    if (updated > 0) {
      parts.push(`${updated} updated`);
    }
    if (skipped > 0) {
      parts.push(`${skipped} unchanged`);
    }

    if (installed > 0 || updated > 0) {
      success(`Claude commands → ${label} (${parts.join(", ")})`);
    } else {
      info(`Claude commands up to date → ${label}`);
    }

    totalInstalled += installed;
    totalUpdated += updated;
  }

  if (totalInstalled > 0 || totalUpdated > 0) {
    info("Available: /setup /simulate /build /launch /review /vibeloop");
    info("Tip: commit .claude/commands/ to share these with your team");
  }
}

// ─── Claude skills installation ──────────────────────────────────

export function installClaudeSkillsForFix(root: string): void {
  installClaudeSkills(root);
}

function installClaudeSkills(root: string): void {
  // skills/ is always a sibling of dist/ in the npm package
  const skillsSource = join(dirname(new URL(import.meta.url).pathname), "..", "skills");

  if (!existsSync(skillsSource)) {
    warn("Skills not found in package — skipping");
    return;
  }

  const files = readdirSync(skillsSource).filter((f) => f.endsWith(".skill"));
  if (files.length === 0) {
    info("No skill files found in package");
    return;
  }

  // Install to both project-local (.claude/skills/) and user-global (~/.claude/skills/)
  const destinations: Array<{ dir: string; label: string }> = [
    { dir: join(root, ".claude", "skills"), label: ".claude/skills/" },
    { dir: join(process.env["HOME"] ?? "~", ".claude", "skills"), label: "~/.claude/skills/" },
  ];

  let totalInstalled = 0;
  let totalUpdated = 0;

  for (const { dir, label } of destinations) {
    mkdirSync(dir, { recursive: true });

    let installed = 0;
    let updated = 0;
    let skipped = 0;

    for (const file of files) {
      const src = join(skillsSource, file);
      const dest = join(dir, file);
      if (existsSync(dest)) {
        const srcBuf = readFileSync(src);
        const destBuf = readFileSync(dest);
        if (!srcBuf.equals(destBuf)) {
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
    if (installed > 0) {
      parts.push(`${installed} new`);
    }
    if (updated > 0) {
      parts.push(`${updated} updated`);
    }
    if (skipped > 0) {
      parts.push(`${skipped} unchanged`);
    }

    if (installed > 0 || updated > 0) {
      success(`Skills → ${label} (${parts.join(", ")})`);
    } else {
      info(`Skills up to date → ${label}`);
    }

    totalInstalled += installed;
    totalUpdated += updated;
  }

  const names = files.map((f) => f.replace(/\.skill$/, "")).join(", ");

  if (totalInstalled > 0 || totalUpdated > 0) {
    info(`Available: ${names}`);
    info("Tip: commit .claude/skills/ to share these with your team");
  } else {
    info(`Available: ${names}`);
  }
}

// ─── Claude Code hooks ────────────────────────────────────────────

export function installClaudeHooksForFix(root: string): void {
  installClaudeHooks(root);
}

function installClaudeHooks(root: string): void {
  const hooksDir = join(root, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  // ── git-guard.sh (PreToolUse) ──────────────────────────────────
  const guardPath = join(hooksDir, "git-guard.sh");
  const guardScript = `#!/bin/bash
# codebase git-guard — PreToolUse hook
# Reads Claude tool input JSON from stdin, enforces git safety rules.

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null || echo "")

if [ -z "$CMD" ]; then exit 0; fi

# ── Rule 1: No commits to protected branches ──────────────────
if echo "$CMD" | grep -qE "^git commit|&& git commit| git commit"; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [[ "$BRANCH" == "main" || "$BRANCH" == "master" || "$BRANCH" == "prod" || "$BRANCH" == "production" ]]; then
    echo ""
    echo "  BLOCKED: Direct commits to '$BRANCH' are not allowed."
    echo ""
    echo "  Branch naming convention:"
    echo "    feat/<slug>     new features"
    echo "    fix/<slug>      bug fixes"
    echo "    chore/<slug>    maintenance"
    echo "    hotfix/<slug>   urgent prod fixes"
    echo "    docs/<slug>     documentation"
    echo "    test/<slug>     test additions"
    echo ""
    echo "  Switch to develop first:"
    echo "    git checkout develop && git pull origin develop"
    echo "    git checkout -b feat/<your-feature>"
    echo ""
    exit 2
  fi
fi

# ── Rule 2: No direct push to protected branches ──────────────
if echo "$CMD" | grep -qE "git push.*(origin )?(main|master|prod|production)(\s|$|\"|\')"; then
  echo ""
  echo "  BLOCKED: Direct push to protected branch is not allowed."
  echo "  Use /launch to release to main."
  echo ""
  exit 2
fi

# ── Rule 3: No force push ever ────────────────────────────────
if echo "$CMD" | grep -qE "git push.*(--force|-f)( |$)"; then
  echo ""
  echo "  BLOCKED: Force push is not allowed."
  echo "  If you need to undo a commit, use: git revert <sha>"
  echo ""
  exit 2
fi

# ── Rule 4: Pull before commit if behind remote ───────────────
if echo "$CMD" | grep -qE "^git commit|&& git commit| git commit"; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ -n "$BRANCH" ] && [ "$BRANCH" != "HEAD" ]; then
    git fetch origin "$BRANCH" --quiet 2>/dev/null || true
    BEHIND=$(git rev-list HEAD..origin/"$BRANCH" --count 2>/dev/null || echo "0")
    if [[ "$BEHIND" -gt 0 ]]; then
      echo ""
      echo "  BLOCKED: Branch '$BRANCH' is $BEHIND commit(s) behind origin/$BRANCH."
      echo "  Pull first:  git pull origin $BRANCH"
      echo ""
      exit 2
    fi
  fi
fi

exit 0
`;

  writeFileSync(guardPath, guardScript, "utf-8");
  chmodSync(guardPath, 0o755);
  success(".claude/hooks/git-guard.sh (PreToolUse — blocks unsafe git ops)");

  // ── git-post.sh (PostToolUse) ──────────────────────────────────
  const postPath = join(hooksDir, "git-post.sh");
  const postScript = `#!/bin/bash
# codebase git-post — PostToolUse hook
# Reads Claude tool input JSON from stdin. Reminds to raise PR after branch push.

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null || echo "")

if [ -z "$CMD" ]; then exit 0; fi

# ── Remind to raise PR after pushing a non-develop/main branch ──
if echo "$CMD" | grep -qE "git push origin [a-zA-Z0-9/_-]+"; then
  PUSHED_BRANCH=$(echo "$CMD" | grep -oE "git push origin [a-zA-Z0-9/_-]+" | awk '{print $4}')
  if [[ -n "$PUSHED_BRANCH" ]] && \
     [[ "$PUSHED_BRANCH" != "main" ]] && \
     [[ "$PUSHED_BRANCH" != "master" ]] && \
     [[ "$PUSHED_BRANCH" != "develop" ]] && \
     [[ "$PUSHED_BRANCH" != "prod" ]]; then
    echo ""
    echo "  Branch '$PUSHED_BRANCH' pushed."
    echo "  Raise a PR to develop:"
    echo "    gh pr create --base develop --head $PUSHED_BRANCH --title 'feat: <description>' --body 'Closes #<N>'"
    echo ""
  fi
fi

exit 0
`;

  writeFileSync(postPath, postScript, "utf-8");
  chmodSync(postPath, 0o755);
  success(".claude/hooks/git-post.sh (PostToolUse — PR reminder after branch push)");

  // ── .claude/settings.json ─────────────────────────────────────
  const settingsPath = join(root, ".claude", "settings.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      /* ignore */
    }
  }

  const hooks = (settings.hooks as Record<string, unknown[]> | undefined) ?? {};

  const guardCmd = `bash .claude/hooks/git-guard.sh`;
  const postCmd = `bash .claude/hooks/git-post.sh`;

  // PreToolUse — add guard if not already present
  const preHooks = (hooks["PreToolUse"] as unknown[]) ?? [];
  const hasGuard = JSON.stringify(preHooks).includes("git-guard");
  if (!hasGuard) {
    preHooks.push({
      matcher: "Bash",
      hooks: [{ type: "command", command: guardCmd }],
    });
  }
  hooks["PreToolUse"] = preHooks;

  // PostToolUse — add post if not already present
  const postHooks = (hooks["PostToolUse"] as unknown[]) ?? [];
  const hasPost = JSON.stringify(postHooks).includes("git-post");
  if (!hasPost) {
    postHooks.push({
      matcher: "Bash",
      hooks: [{ type: "command", command: postCmd }],
    });
  }
  hooks["PostToolUse"] = postHooks;

  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  success(".claude/settings.json (PreToolUse + PostToolUse hooks registered)");
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
  const toAdd = lines.filter((l) => !existing.includes(l)).join("\n");
  if (toAdd) {
    writeFileSync(p, existing.trimEnd() + "\n" + toAdd + "\n", "utf-8");
  }
}

// ─── gh helpers ──────────────────────────────────────────────────

function execGh(root: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile("gh", args, { cwd: root, timeout: 15_000 }, (err, stdout) => {
      resolve({ ok: !err, stdout: (stdout || "").trim() });
    });
  });
}

async function installAgentBrowser(): Promise<void> {
  const installed = await new Promise<boolean>((resolve) => {
    execFile("agent-browser", ["--version"], { timeout: 5_000 }, (err) => resolve(!err));
  });
  if (installed) {
    info("agent-browser already installed");
    return;
  }

  log("Installing agent-browser...");
  const ok = await new Promise<boolean>((resolve) => {
    execFile("npm", ["install", "-g", "agent-browser"], { timeout: 120_000 }, (err) =>
      resolve(!err)
    );
  });
  if (!ok) {
    warn("agent-browser install failed — run: npm install -g agent-browser");
    return;
  }

  const chrome = await new Promise<boolean>((resolve) => {
    execFile("agent-browser", ["install"], { timeout: 300_000 }, (err) => resolve(!err));
  });
  if (chrome) {
    success("agent-browser installed (Chrome for Testing downloaded)");
  } else {
    warn("agent-browser installed but Chrome download failed — run: agent-browser install");
  }

  // Post-install validation
  const valid = await new Promise<boolean>((resolve) => {
    execFile("agent-browser", ["--version"], { timeout: 5_000 }, (err) => resolve(!err));
  });
  if (!valid) {
    warn(
      "agent-browser validation failed — it may not be on PATH. Try: npm install -g agent-browser"
    );
  }
}

async function checkGh(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("gh", ["auth", "status"], { timeout: 5_000 }, (err) => resolve(!err));
  });
}

async function installLabels(root: string): Promise<void> {
  const { stdout } = await execGh(root, [
    "label",
    "list",
    "--limit",
    "100",
    "--json",
    "name",
    "--jq",
    ".[].name",
  ]);
  const existing = new Set(stdout.split("\n").filter(Boolean));

  let created = 0;
  for (const label of VIBEKIT_LABELS) {
    if (existing.has(label.name)) {
      continue;
    }
    const { ok } = await execGh(root, [
      "label",
      "create",
      label.name,
      "--color",
      label.color,
      "--description",
      label.description,
    ]);
    if (ok) {
      created++;
    }
  }

  const skipped = VIBEKIT_LABELS.length - created;
  if (created > 0) {
    success(`${created} GitHub labels created (${skipped} already existed)`);
  } else {
    info(`All ${VIBEKIT_LABELS.length} labels already exist`);
  }
}

async function ensureHighlightsIndex(root: string): Promise<void> {
  const { stdout } = await execGh(root, [
    "issue",
    "list",
    "--search",
    "Highlights Index",
    "--state",
    "all",
    "--limit",
    "1",
    "--json",
    "number",
    "--jq",
    ".[0].number // empty",
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
    "issue",
    "create",
    "--title",
    "Highlights Index",
    "--label",
    "highlight",
    "--body",
    body,
  ]);
  if (ok) {
    success("Highlights Index issue created on GitHub");
  } else {
    warn("Could not create Highlights Index issue");
  }
}

// ─── PRODUCT.md skeleton from manifest ───────────────────────────

function generateProductMd(root: string, outputPath: string): void {
  const manifestPath = join(root, ".codebase.json");
  let manifest: Manifest | null = null;
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
    } catch {
      /* ignore */
    }
  }

  const name = manifest?.project?.name ?? "[INFERRED: project name]";
  const description = manifest?.project?.description ?? "[INFERRED: one-line description]";
  const langs = (manifest?.stack?.languages ?? []).join(", ") || "[INFERRED]";
  const frameworks = (manifest?.stack?.frameworks ?? []).join(", ") || "[INFERRED]";
  const devCmd = manifest?.commands?.dev ?? "[INFERRED]";
  const buildCmd = manifest?.commands?.build ?? "[INFERRED]";
  const testCmd = manifest?.commands?.test ?? "[INFERRED]";

  writeFileSync(
    outputPath,
    `# PRODUCT.md — ${name}

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
`,
    "utf-8"
  );
}
