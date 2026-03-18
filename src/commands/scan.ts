import { resolve, join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { CLIOptions } from "../types.js";
import { scan, summarizeCategory } from "../scanner/engine.js";
import { log, success, setQuiet } from "../utils/output.js";

export async function runScan(options: CLIOptions): Promise<void> {
  setQuiet(options.quiet);
  const root = resolve(options.path);

  log(`Scanning ${root}...`);

  const manifest = await scan(root, {
    depth: options.depth,
    categories: options.categories.length ? options.categories : undefined,
    incremental: options.incremental,
    quiet: options.quiet,
    sync: options.sync,
  });

  // Print summary per category
  for (const [category, data] of Object.entries(manifest)) {
    if (category === "version" || category === "generated_at") {
      continue;
    }
    if (typeof data !== "object" || data === null) {
      continue;
    }
    success(
      `${capitalize(category)} (${summarizeCategory(category, data as Record<string, unknown>)})`
    );
  }

  // Write to disk
  const outputPath = join(root, ".codebase.json");
  const content = JSON.stringify(manifest, null, 2);
  await writeFile(outputPath, content, "utf-8");

  const sizeKB = (Buffer.byteLength(content) / 1024).toFixed(1);
  log(`\nWritten: .codebase.json (${sizeKB} KB)`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
