import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { CLIOptions } from "../types.js";
import { queryPath } from "../utils/json-path.js";
import { error } from "../utils/output.js";

export async function runQuery(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const manifestPath = join(root, ".codebase.json");

  if (!existsSync(manifestPath)) {
    console.error("No manifest found. Run 'codebase init' to set up this project first.");
    process.exit(1);
  }

  let manifest: Record<string, unknown>;
  try {
    const content = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(content);
  } catch {
    error("No .codebase.json found (or it's corrupted). Run `npx codebase` first.");
    process.exit(1);
  }
  const path = options.positionals[0];

  if (!path) {
    // No path = full manifest
    process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
    return;
  }

  const value = queryPath(manifest, path);

  if (value === undefined) {
    error(`Path "${path}" not found in manifest.`);
    process.exit(1);
  }

  if (options.force) {
    if (typeof value === "string") {
      process.stdout.write(value + "\n");
    } else if (Array.isArray(value)) {
      process.stdout.write(value.join("\n") + "\n");
    } else {
      process.stdout.write(JSON.stringify(value) + "\n");
    }
  } else {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  }
}
