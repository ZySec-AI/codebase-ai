import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import type { CLIOptions } from "../types.js";
import { scan } from "../scanner/engine.js";
import { checkGhDetailed, autoConfigureMcp } from "./init.js";
import { installHooks } from "../integrations/githook.js";
import { updateGitignore } from "../integrations/gitignore.js";
import { setQuiet, log, heading, info } from "../utils/output.js";

const HOOK_MARKER = "# codebase-auto-update";

const NO_COLOR = !!process.env.NO_COLOR;
const green = NO_COLOR ? "" : "\x1b[32m";
const reset = NO_COLOR ? "" : "\x1b[0m";

function fixed(msg: string): void {
  console.log(`  ${green}\u2713${reset} ${msg}`);
}

/**
 * `codebase fix` — auto-repair everything `doctor` would flag.
 *
 * Re-runs relevant parts of init for anything broken or missing.
 * Shows what it fixed.
 */
export async function runFix(options: CLIOptions): Promise<void> {
  setQuiet(options.quiet);
  const root = resolve(options.path);
  let fixCount = 0;

  heading("codebase fix\n");

  // ─── Check GitHub CLI (won't auto-fix) ─────────────────────
  const ghStatus = await checkGhDetailed();
  const ghAvailable = ghStatus === "authenticated";

  if (ghStatus === "not-installed") {
    info("GitHub CLI not installed — install with: brew install gh");
    info("(Cannot auto-fix — requires manual installation)\n");
  } else if (ghStatus === "not-authenticated") {
    info("GitHub CLI not authenticated — run: gh auth login");
    info("(Cannot auto-fix — requires manual login)\n");
  }

  // ─── 1 & 2. Manifest missing, corrupted, or stale → rescan ─
  const manifestPath = join(root, ".codebase.json");
  let needsScan = false;

  if (!existsSync(manifestPath)) {
    needsScan = true;
  } else {
    try {
      const raw = readFileSync(manifestPath, "utf-8");
      JSON.parse(raw); // validate JSON
    } catch {
      needsScan = true;
    }
  }

  // Check freshness if manifest exists
  if (!needsScan && existsSync(manifestPath)) {
    try {
      const raw = readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);
      const generatedAt = manifest.generated_at ? new Date(manifest.generated_at).getTime() : 0;
      if (existsSync(join(root, "src"))) {
        const { statSync } = await import("node:fs");
        const srcStat = statSync(join(root, "src"));
        if (srcStat.mtimeMs > generatedAt) {
          needsScan = true;
        }
      }
    } catch {
      needsScan = true;
    }
  }

  if (needsScan) {
    const manifest = await scan(root, {
      depth: options.depth,
      quiet: true,
      sync: ghAvailable,
    });
    const content = JSON.stringify(manifest, null, 2);
    await writeFile(manifestPath, content, "utf-8");
    const sizeKB = (Buffer.byteLength(content) / 1024).toFixed(1);
    fixed(`Re-scanned project \u2192 .codebase.json (${sizeKB} KB)`);
    fixCount++;
  }

  // ─── 3. Re-inject CLAUDE.md if missing ────────────────────
  const { claudeIntegration } = await import("../integrations/claude.js");
  if (!checkInjection(root)) {
    claudeIntegration.inject(root);
    fixed("Re-injected Claude Code instructions into CLAUDE.md");
    fixCount++;
  }

  // ─── 4. Fix missing MCP config ────────────────────────────
  const toolNames = new Set(["claude"]);
  const mcpConfigured = await autoConfigureMcp(root, toolNames);
  for (const entry of mcpConfigured) {
    fixed(`Added MCP entry to ${entry}`);
    fixCount++;
  }

  // ─── 5 & 7. Git hooks ─────────────────────────────────────
  if (existsSync(join(root, ".git"))) {
    const postCommitOk = checkHook(root, "post-commit");
    const postCheckoutOk = checkHook(root, "post-checkout");
    const hookHasSync = checkHookSync(root);
    const preCommitOk = checkPreCommitHook(root);
    const needsReinstall =
      !postCommitOk || !postCheckoutOk || (ghAvailable && !hookHasSync) || !preCommitOk;

    if (needsReinstall) {
      installHooks(root, ghAvailable);
      const fixes: string[] = [];
      if (!postCommitOk) {
        fixes.push("post-commit");
      }
      if (!postCheckoutOk) {
        fixes.push("post-checkout");
      }
      if (ghAvailable && !hookHasSync) {
        fixes.push("--sync flag");
      }
      if (!preCommitOk) {
        fixes.push("pre-commit");
      }
      fixed(`Installed ${fixes.join(" + ")} hook${fixes.length > 1 ? "s" : ""}`);
      fixCount++;
    }
  }

  // ─── 6. Gitignore ─────────────────────────────────────────
  const gitignorePath = join(root, ".gitignore");
  const gitignoreContent = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
  if (!gitignoreContent.includes(".codebase.json")) {
    updateGitignore(root);
    fixed("Added .codebase.json to .gitignore");
    fixCount++;
  }

  // ─── 7. Claude commands ───────────────────────────────────
  const claudeCommandsDir = join(root, ".claude", "commands");
  if (!existsSync(claudeCommandsDir)) {
    const { installClaudeCommandsForFix } = await import("./setup.js");
    installClaudeCommandsForFix(root);
    fixed("Installed Claude commands → .claude/commands/");
    fixCount++;
  }

  // ─── 7b. Claude skills ────────────────────────────────────
  const skillsDir = join(homedir(), ".claude", "skills");
  const hasSkills =
    existsSync(skillsDir) && readdirSync(skillsDir).some((f) => f.endsWith(".skill"));
  if (!hasSkills) {
    const { installClaudeSkillsForFix } = await import("./setup.js");
    installClaudeSkillsForFix(root);
    fixed("Installed Claude skills → ~/.claude/skills/");
    fixCount++;
  }

  // ─── 8. Claude Code hooks ─────────────────────────────────
  const guardHook = join(root, ".claude", "hooks", "git-guard.sh");
  const postHook = join(root, ".claude", "hooks", "git-post.sh");
  const settingsFile = join(root, ".claude", "settings.json");
  const hooksOk = existsSync(guardHook) && existsSync(postHook);
  const settingsOk = (() => {
    if (!existsSync(settingsFile)) {
      return false;
    }
    try {
      const s = JSON.parse(readFileSync(settingsFile, "utf-8"));
      const pre = JSON.stringify(s.hooks?.PreToolUse ?? "");
      const post = JSON.stringify(s.hooks?.PostToolUse ?? "");
      return pre.includes("git-guard") && post.includes("git-post");
    } catch {
      return false;
    }
  })();
  if (!hooksOk || !settingsOk) {
    const { installClaudeHooksForFix } = await import("./setup.js");
    installClaudeHooksForFix(root);
    fixed("Installed Claude Code hooks → .claude/hooks/ + settings.json");
    fixCount++;
  }

  // ─── Summary ──────────────────────────────────────────────
  log("");
  if (fixCount === 0) {
    log("  Nothing to fix. Your project is healthy.");
  } else {
    log(`  Fixed ${fixCount} issue${fixCount > 1 ? "s" : ""}. Run \`codebase doctor\` to verify.`);
  }
  log("");
}

// ─── Check helpers (duplicated from doctor for independence) ──

function checkInjection(root: string): boolean {
  const filePath = join(root, "CLAUDE.md");
  if (!existsSync(filePath)) {
    return false;
  }
  const content = readFileSync(filePath, "utf-8");
  return content.includes("<!-- codebase:start -->");
}

function checkHook(root: string, hookName: string): boolean {
  const hookPath = join(root, ".git", "hooks", hookName);
  if (!existsSync(hookPath)) {
    return false;
  }
  const content = readFileSync(hookPath, "utf-8");
  return content.includes(HOOK_MARKER);
}

function checkHookSync(root: string): boolean {
  const hookPath = join(root, ".git", "hooks", "post-commit");
  if (!existsSync(hookPath)) {
    return false;
  }
  const content = readFileSync(hookPath, "utf-8");
  return content.includes("--sync");
}

function checkPreCommitHook(root: string): boolean {
  const hookPath = join(root, ".git", "hooks", "pre-commit");
  if (!existsSync(hookPath)) {
    return false;
  }
  const content = readFileSync(hookPath, "utf-8");
  return content.includes("codebase-pre-commit");
}
