import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import type { CLIOptions } from "../types.js";
import { scan } from "../scanner/engine.js";
import { deepDiff } from "../utils/json-path.js";
import { log, error } from "../utils/output.js";

export async function runDiff(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const manifestPath = join(root, ".codebase.json");

  let existing: Record<string, unknown>;
  try {
    const content = await readFile(manifestPath, "utf-8");
    existing = JSON.parse(content);
  } catch {
    error("No .codebase.json found. Run `codebase scan` first.");
    process.exit(1);
  }

  // Fresh scan
  const current = await scan(root, { quiet: true }) as Record<string, unknown>;

  // Remove timestamps for comparison
  delete existing.generated_at;
  delete current.generated_at;

  const diffs = deepDiff(existing, current);

  if (diffs.length === 0) {
    log("No changes detected.");
    return;
  }

  log(`Found ${diffs.length} changes:\n`);

  for (const diff of diffs) {
    switch (diff.type) {
      case "added":
        log(`  + ${diff.path}: ${format(diff.newValue)}`);
        break;
      case "removed":
        log(`  - ${diff.path}: ${format(diff.oldValue)}`);
        break;
      case "changed":
        log(`  ~ ${diff.path}: ${format(diff.oldValue)} → ${format(diff.newValue)}`);
        break;
    }
  }
}

function format(val: unknown): string {
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}
