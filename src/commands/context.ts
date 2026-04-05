import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import type { CLIOptions, Manifest } from "../types.js";
import { generateSlimBrief } from "../mcp/brief.js";
import { error } from "../utils/output.js";

/**
 * `codebase context` — lightweight session context management.
 *
 * Subcommands:
 *   (none)   Output slim brief — same as `brief --slim` but faster to type
 *   reset    Force re-scan and output fresh slim brief; clears hook sentinels
 *   age      Print manifest age in seconds (useful for scripts and hooks)
 *
 * Primarily used by the UserPromptSubmit hook (context-inject.sh) and by
 * Claude mid-session when context may have gone stale.
 */
export async function runContext(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const sub = options.subcommand || options.positionals[0] || "";

  if (sub === "age") {
    await runContextAge(root);
    return;
  }

  if (sub === "reset") {
    await runContextReset(root, options);
    return;
  }

  // Default: output slim brief
  await runContextBrief(root, options.quiet);
}

async function runContextBrief(root: string, quiet: boolean): Promise<void> {
  const manifestPath = join(root, ".codebase.json");

  if (!existsSync(manifestPath)) {
    if (!quiet) {
      error("No manifest found. Run 'codebase init' first.");
    }
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    const content = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(content);
  } catch {
    if (!quiet) {
      error("Manifest corrupted. Run `codebase fix` to repair.");
    }
    process.exit(1);
  }

  process.stdout.write(generateSlimBrief(manifest) + "\n");
}

async function runContextReset(root: string, options: CLIOptions): Promise<void> {
  const manifestPath = join(root, ".codebase.json");

  // Force re-scan
  try {
    execSync("npx --yes codebase scan-only --quiet", {
      cwd: root,
      stdio: options.verbose ? "inherit" : "ignore",
    });
  } catch {
    // Scan failure is non-fatal — output stale manifest if available
  }

  // Clear sentinel files for this project so the hook re-injects on next prompt.
  // Sentinels match /tmp/.codebase-ctx-<hash>-* where hash is based on cwd.
  try {
    const { readdirSync } = await import("node:fs");
    const tmpDir = "/tmp";
    const prefix = `.codebase-ctx-`;
    const files = readdirSync(tmpDir).filter((f) => f.startsWith(prefix));
    for (const f of files) {
      try {
        unlinkSync(join(tmpDir, f));
      } catch {
        /* ignore — may belong to another session */
      }
    }
  } catch {
    /* /tmp not accessible — skip */
  }

  if (!existsSync(manifestPath)) {
    if (!options.quiet) {
      error("Scan failed: no manifest produced. Check project setup.");
    }
    process.exit(1);
  }

  await runContextBrief(root, options.quiet);
}

async function runContextAge(root: string): Promise<void> {
  const manifestPath = join(root, ".codebase.json");

  if (!existsSync(manifestPath)) {
    process.stdout.write("-1\n");
    return;
  }

  try {
    const stat = statSync(manifestPath);
    const ageSeconds = Math.floor((Date.now() - stat.mtimeMs) / 1000);
    process.stdout.write(`${ageSeconds}\n`);
  } catch {
    process.stdout.write("-1\n");
  }
}
