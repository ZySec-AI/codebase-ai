import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import type { CLIOptions, Manifest } from "../types.js";
import { generateBrief } from "../mcp/brief.js";
import { error } from "../utils/output.js";

/**
 * `codebase brief` — outputs a complete project briefing for AI consumption.
 *
 * This is THE interface for AI tools. They run this command and get back
 * everything they need to start working: project identity, stack, commands,
 * current status, next task, blockers, decisions, and available actions.
 *
 * No file reading. No JSON parsing. Just run the command, get the answer.
 */
export async function runBrief(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const manifestPath = join(root, ".codebase.json");

  let manifest: Manifest;
  try {
    const content = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(content);
  } catch {
    error("No .codebase.json found (or it's corrupted). Run `npx codebase` first.");
    process.exit(1);
  }

  process.stdout.write(generateBrief(manifest) + "\n");
}
