import { resolve } from "node:path";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CLIOptions } from "../types.js";
import { runScan } from "./scan.js";
import { detectTools } from "../integrations/index.js";
import { claudeIntegration } from "../integrations/claude.js";
import { updateGitignore } from "../integrations/gitignore.js";
import { installHook } from "../integrations/githook.js";
import { log, success, info, heading } from "../utils/output.js";

export async function runSetup(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  // Step 1: Full scan (with --sync if available)
  await runScan({ ...options, sync: true });

  // Step 2: Detect AI tools
  heading("AI Tool Integration");

  let tools = detectTools(root);

  if (options.tools.length) {
    tools = tools.filter(t => options.tools.includes(t.name));
  }

  // If no tools detected, create CLAUDE.md as default
  if (tools.length === 0 && !options.tools.length) {
    info("No AI tool configs detected. Creating CLAUDE.md...");
    writeFileSync(join(root, "CLAUDE.md"), "# Project Rules\n", "utf-8");
    tools = [claudeIntegration];
  }

  if (options.dryRun) {
    log("\nDry run - would configure:");
    tools.forEach(t => info(t.name));
    return;
  }

  for (const tool of tools) {
    tool.inject(root);
    success(`${tool.name} - added .codebase.json reference`);
  }

  // Step 3: Git hook
  heading("Auto-Update");
  const hookInstalled = installHook(root);
  if (hookInstalled) {
    success("Git post-commit hook (auto-updates .codebase.json)");
  } else {
    info("Not a git repository - skipping hook");
  }

  // Step 4: Gitignore
  updateGitignore(root);
  success(".gitignore updated");

  log("\nDone! Your project is now wired for AI.");
}
