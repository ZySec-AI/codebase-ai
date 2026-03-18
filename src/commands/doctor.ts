import { resolve, join } from "node:path";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import type { CLIOptions, Manifest } from "../types.js";
import { checkGhDetailed } from "./init.js";
import { setQuiet, log, heading } from "../utils/output.js";

const HOOK_MARKER = "# codebase-auto-update";

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * `codebase doctor` — health check for project intelligence setup.
 *
 * Runs all checks and prints a diagnostic report. No mutations.
 * Exit code 0 if all pass, 1 if any issues.
 */
export async function runDoctor(options: CLIOptions): Promise<void> {
  setQuiet(options.quiet);
  const root = resolve(options.path);
  const results: CheckResult[] = [];

  heading("codebase doctor\n");

  // ─── 1. Manifest exists ──────────────────────────────────────
  const manifestPath = join(root, ".codebase.json");
  let manifest: Manifest | null = null;

  if (existsSync(manifestPath)) {
    try {
      const raw = readFileSync(manifestPath, "utf-8");
      manifest = JSON.parse(raw) as Manifest;
      const stat = statSync(manifestPath);
      const sizeKB = (stat.size / 1024).toFixed(1);
      const ageMs = Date.now() - stat.mtimeMs;
      const age = formatAge(ageMs);
      results.push({ label: "Manifest", ok: true, detail: `.codebase.json (${sizeKB} KB, ${age})` });
    } catch {
      results.push({ label: "Manifest", ok: false, detail: "Corrupted — run `codebase fix`" });
    }
  } else {
    results.push({ label: "Manifest", ok: false, detail: "Missing — run `codebase fix`" });
  }

  // ─── 2. Manifest freshness ──────────────────────────────────
  if (manifest) {
    const generatedAt = manifest.generated_at ? new Date(manifest.generated_at).getTime() : 0;
    const ageHours = (Date.now() - generatedAt) / (1000 * 60 * 60);

    // Check if src/ files are newer than manifest
    let stale = false;
    if (existsSync(join(root, "src"))) {
      try {
        const srcStat = statSync(join(root, "src"));
        if (srcStat.mtimeMs > generatedAt) {stale = true;}
      } catch { /* ignore */ }
    }

    if (stale) {
      results.push({ label: "Freshness", ok: false, detail: `Stale (${Math.round(ageHours)} hours old)` });
    } else {
      results.push({ label: "Freshness", ok: true, detail: "Up to date" });
    }

    // ─── 3. Detector categories ──────────────────────────────
    const expectedCategories = [
      "project", "repo", "structure", "stack", "commands",
      "dependencies", "config", "git", "quality", "patterns",
    ];
    const presentCategories = expectedCategories.filter(c => c in manifest!);
    if (presentCategories.length === expectedCategories.length) {
      results.push({ label: "Detectors", ok: true, detail: "10/10 categories present" });
    } else {
      const missing = expectedCategories.filter(c => !presentCategories.includes(c));
      results.push({ label: "Detectors", ok: false, detail: `Missing: ${missing.join(", ")}` });
    }
  }

  // ─── 4. GitHub CLI ──────────────────────────────────────────
  const ghStatus = await checkGhDetailed();
  const ghAvailable = ghStatus === "authenticated";

  if (ghStatus === "authenticated") {
    results.push({ label: "GitHub CLI", ok: true, detail: "Authenticated" });
  } else if (ghStatus === "not-authenticated") {
    results.push({ label: "GitHub CLI", ok: false, detail: "Not authenticated — run `gh auth login`" });
  } else {
    results.push({ label: "GitHub CLI", ok: false, detail: "Not installed — brew install gh" });
  }

  // ─── 5. GitHub consistency ─────────────────────────────────
  if (manifest) {
    const repoUrl = manifest.repo?.url;
    const githubAvailable = manifest.status?.github_available;
    const hasGithubRemote = repoUrl?.includes("github.com");

    if (hasGithubRemote && githubAvailable === false) {
      results.push({ label: "GitHub Sync", ok: false, detail: "Repo has GitHub remote but github_available is false" });
    } else if (!hasGithubRemote && githubAvailable === true) {
      results.push({ label: "GitHub Sync", ok: false, detail: "No GitHub remote but github_available is true" });
    } else {
      results.push({ label: "GitHub Sync", ok: true, detail: "Consistent" });
    }
  }

  // ─── 6. Claude Code injection ──────────────────────────────
  const claudeInjected = checkInjection(root);
  results.push({
    label: "Claude Code",
    ok: claudeInjected,
    detail: claudeInjected ? "CLAUDE.md injected" : "CLAUDE.md injection missing — run `codebase fix`",
  });

  // ─── 7. MCP ────────────────────────────────────────────────
  const mcpOk = checkMcpConfig(root);
  results.push({
    label: "MCP",
    ok: mcpOk,
    detail: mcpOk ? ".mcp.json configured" : ".mcp.json missing — run `codebase fix`",
  });

  // ─── 9. Git hooks ─────────────────────────────────────────
  if (existsSync(join(root, ".git"))) {
    const postCommitOk = checkHook(root, "post-commit");
    const postCheckoutOk = checkHook(root, "post-checkout");
    const hookHasSync = checkHookSync(root);

    if (postCommitOk && postCheckoutOk) {
      const syncDetail = ghAvailable
        ? (hookHasSync ? " (with --sync)" : "")
        : "";
      results.push({ label: "Git Hooks", ok: true, detail: `post-commit + post-checkout${syncDetail}` });
    } else {
      const missing: string[] = [];
      if (!postCommitOk) {missing.push("post-commit");}
      if (!postCheckoutOk) {missing.push("post-checkout");}
      results.push({ label: "Git Hooks", ok: false, detail: `${missing.join(" + ")} missing` });
    }

    // ─── 10. Hook sync flag ─────────────────────────────────
    if (ghAvailable && postCommitOk && !hookHasSync) {
      results.push({ label: "Hook Sync", ok: false, detail: "Missing --sync flag" });
    }
  } else {
    results.push({ label: "Git Hooks", ok: true, detail: "Not a git repo — skipped" });
  }

  // ─── 10b. commit-msg hook (branch enforcement) ────────────
  if (existsSync(join(root, ".git"))) {
    const commitMsgOk = checkCommitMsgHook(root);
    if (commitMsgOk) {
      results.push({ label: "Branch Hook", ok: true, detail: "commit-msg blocks direct commits to main/master" });
    } else {
      results.push({ label: "Branch Hook", ok: false, detail: "commit-msg hook missing — run `codebase fix`" });
    }
  }

  // ─── 10e. pre-commit hook (lint + typecheck) ───────────────
  if (existsSync(join(root, ".git"))) {
    const preCommitOk = checkPreCommitHook(root);
    const hasPkgScripts = (() => {
      try {
        const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
        return !!(pkg.scripts?.check || pkg.scripts?.typecheck || pkg.scripts?.lint);
      } catch { return false; }
    })();
    if (!hasPkgScripts) {
      results.push({ label: "Pre-commit", ok: true, detail: "No lint/typecheck scripts — skipped" });
    } else if (preCommitOk) {
      results.push({ label: "Pre-commit", ok: true, detail: "Runs lint + typecheck before every commit" });
    } else {
      results.push({ label: "Pre-commit", ok: false, detail: "pre-commit hook missing — run `codebase fix`" });
    }
  }

  // ─── 10c. Claude commands ──────────────────────────────────
  const claudeCommandsDir = join(root, ".claude", "commands");
  if (existsSync(claudeCommandsDir)) {
    const cmdFiles = readdirSync(claudeCommandsDir).filter(f => f.endsWith(".md"));
    results.push({ label: "Claude Commands", ok: cmdFiles.length > 0, detail: `${cmdFiles.length} commands in .claude/commands/` });
  } else {
    results.push({ label: "Claude Commands", ok: false, detail: ".claude/commands/ missing — run `codebase setup`" });
  }

  // ─── 10d. Claude Code hooks ────────────────────────────────
  const guardHook = join(root, ".claude", "hooks", "git-guard.sh");
  const postHook  = join(root, ".claude", "hooks", "git-post.sh");
  const settingsFile = join(root, ".claude", "settings.json");
  const hooksInstalled = existsSync(guardHook) && existsSync(postHook);
  const settingsOk = (() => {
    if (!existsSync(settingsFile)) {return false;}
    try {
      const s = JSON.parse(readFileSync(settingsFile, "utf-8"));
      const pre  = JSON.stringify(s.hooks?.PreToolUse  ?? "");
      const post = JSON.stringify(s.hooks?.PostToolUse ?? "");
      return pre.includes("git-guard") && post.includes("git-post");
    } catch { return false; }
  })();
  if (hooksInstalled && settingsOk) {
    results.push({ label: "Claude Hooks", ok: true, detail: "git-guard + git-post wired in settings.json" });
  } else {
    const missing: string[] = [];
    if (!hooksInstalled) {missing.push("hook scripts");}
    if (!settingsOk) {missing.push("settings.json wiring");}
    results.push({ label: "Claude Hooks", ok: false, detail: `Missing: ${missing.join(", ")} — run \`codebase setup\`` });
  }

  // ─── 11. Gitignore ────────────────────────────────────────
  const gitignorePath = join(root, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.includes(".codebase.json")) {
      results.push({ label: "Gitignore", ok: true, detail: ".codebase.json in .gitignore" });
    } else {
      results.push({ label: "Gitignore", ok: false, detail: ".codebase.json not in .gitignore" });
    }
  } else {
    results.push({ label: "Gitignore", ok: false, detail: ".gitignore missing" });
  }

  // ─── Print results ────────────────────────────────────────
  const NO_COLOR = !!process.env.NO_COLOR;
  const green = NO_COLOR ? "" : "\x1b[32m";
  const red = NO_COLOR ? "" : "\x1b[31m";
  const reset = NO_COLOR ? "" : "\x1b[0m";

  const issues = results.filter(r => !r.ok);

  for (const r of results) {
    const icon = r.ok ? `${green}\u2713${reset}` : `${red}\u2717${reset}`;
    const indent = r.label.startsWith("  ") ? "  " : "  ";
    const labelWidth = r.label.startsWith("  ") ? 18 : 16;
    log(`${indent}${r.label.trimStart().padEnd(labelWidth)} ${icon} ${r.detail}`);
  }

  log("");
  if (issues.length === 0) {
    log("  All checks passed. Your project is healthy.");
  } else {
    log(`  ${issues.length} issue${issues.length > 1 ? "s" : ""} found. Run \`codebase fix\` to repair.`);
  }
  log("");

  if (issues.length > 0) {process.exit(1);}
}

// ─── Check helpers ──────────────────────────────────────────────

function checkInjection(root: string): boolean {
  const filePath = join(root, "CLAUDE.md");
  if (!existsSync(filePath)) {return false;}
  const content = readFileSync(filePath, "utf-8");
  return content.includes("<!-- codebase:start -->");
}

function checkMcpConfig(root: string): boolean {
  const mcpPath = join(root, ".mcp.json");
  if (!existsSync(mcpPath)) {return false;}
  try {
    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    return !!(config.mcpServers?.codebase);
  } catch {
    return false;
  }
}

function checkHook(root: string, hookName: string): boolean {
  const hookPath = join(root, ".git", "hooks", hookName);
  if (!existsSync(hookPath)) {return false;}
  const content = readFileSync(hookPath, "utf-8");
  return content.includes(HOOK_MARKER);
}

function checkCommitMsgHook(root: string): boolean {
  const hookPath = join(root, ".git", "hooks", "commit-msg");
  if (!existsSync(hookPath)) {return false;}
  const content = readFileSync(hookPath, "utf-8");
  return content.includes("codebase-branch-check");
}

function checkPreCommitHook(root: string): boolean {
  const hookPath = join(root, ".git", "hooks", "pre-commit");
  if (!existsSync(hookPath)) {return false;}
  const content = readFileSync(hookPath, "utf-8");
  return content.includes("codebase-pre-commit");
}

function checkHookSync(root: string): boolean {
  const hookPath = join(root, ".git", "hooks", "post-commit");
  if (!existsSync(hookPath)) {return false;}
  const content = readFileSync(hookPath, "utf-8");
  return content.includes("--sync");
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {return `${seconds} sec ago`;}
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {return `${minutes} min ago`;}
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {return `${hours} hr ago`;}
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
