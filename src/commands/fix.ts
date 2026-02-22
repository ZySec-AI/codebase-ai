import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import type { CLIOptions } from "../types.js";
import { scan } from "../scanner/engine.js";
import { detectTools } from "../integrations/index.js";
import { checkGhDetailed, detectGlobalTools, autoConfigureMcp } from "./init.js";
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
        if (srcStat.mtimeMs > generatedAt) needsScan = true;
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

  // ─── 3. Re-inject into tools with missing injection ────────
  let tools = detectTools(root);
  const globalTools = detectGlobalTools();
  const toolNames = new Set(tools.map(t => t.name));
  for (const gt of globalTools) {
    if (!toolNames.has(gt.name)) {
      tools.push(gt);
      toolNames.add(gt.name);
    }
  }

  for (const tool of tools) {
    if (!checkInjection(root, tool.name)) {
      tool.inject(root);
      fixed(`Re-injected ${tool.name} instructions`);
      fixCount++;
    }
  }

  // ─── 4. Fix missing MCP configs ───────────────────────────
  const mcpConfigured = autoConfigureMcp(root, toolNames);
  for (const entry of mcpConfigured) {
    fixed(`Added MCP entry to ${entry}`);
    fixCount++;
  }

  // ─── 5 & 7. Git hooks ─────────────────────────────────────
  if (existsSync(join(root, ".git"))) {
    const postCommitOk = checkHook(root, "post-commit");
    const postCheckoutOk = checkHook(root, "post-checkout");
    const hookHasSync = checkHookSync(root);
    const needsReinstall = !postCommitOk || !postCheckoutOk || (ghAvailable && !hookHasSync);

    if (needsReinstall) {
      installHooks(root, ghAvailable);
      const fixes: string[] = [];
      if (!postCommitOk) fixes.push("post-commit");
      if (!postCheckoutOk) fixes.push("post-checkout");
      if (ghAvailable && !hookHasSync) fixes.push("--sync flag");
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

function checkInjection(root: string, toolName: string): boolean {
  const fileMap: Record<string, string> = {
    claude: "CLAUDE.md",
    cursor: ".cursorrules",
    windsurf: ".windsurfrules",
    copilot: ".github/copilot-instructions.md",
    cline: ".clinerules",
    aider: ".aider.conf.yml",
    continue: ".continuerc.json",
  };

  const file = fileMap[toolName];
  if (!file) return false;

  const filePath = join(root, file);
  if (!existsSync(filePath)) return false;

  const content = readFileSync(filePath, "utf-8");

  if (toolName === "claude" || toolName === "copilot") {
    return content.includes("<!-- codebase:start -->");
  }
  if (toolName === "continue") {
    try {
      const config = JSON.parse(content);
      return config.docs?.some((d: { path?: string }) => d.path === ".codebase.json") ?? false;
    } catch { return false; }
  }
  if (toolName === "aider") {
    return content.includes(".codebase.json");
  }
  return content.includes("# codebase:start");
}

function checkHook(root: string, hookName: string): boolean {
  const hookPath = join(root, ".git", "hooks", hookName);
  if (!existsSync(hookPath)) return false;
  const content = readFileSync(hookPath, "utf-8");
  return content.includes(HOOK_MARKER);
}

function checkHookSync(root: string): boolean {
  const hookPath = join(root, ".git", "hooks", "post-commit");
  if (!existsSync(hookPath)) return false;
  const content = readFileSync(hookPath, "utf-8");
  return content.includes("--sync");
}
