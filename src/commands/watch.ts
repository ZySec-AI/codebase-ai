import { resolve, join } from "node:path";
import { watch } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { CLIOptions } from "../types.js";
import { runScan } from "./scan.js";
import { log, info, success, warn } from "../utils/output.js";

const IGNORE_PATTERNS = [
  "node_modules", ".git", "dist", "build", ".next",
  ".codebase.json", ".codebase.cache.json",
];

export async function runWatch(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const incremental = options.incremental;

  // Initial scan
  await runScan(options);

  log("\nWatching for changes..." + (incremental ? " (incremental mode)" : ""));

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let scanning = false;
  let pendingRescan = false;
  const changedFiles = new Set<string>();

  const triggerScan = async () => {
    if (scanning) {
      pendingRescan = true;
      return;
    }

    scanning = true;
    const filesChanged = Array.from(changedFiles);
    changedFiles.clear();

    try {
      if (incremental && filesChanged.length > 0) {
        await incrementalScan(root, options, filesChanged);
      } else {
        await runScan({ ...options, incremental });
      }
      info("Watching for changes...");
    } finally {
      scanning = false;
      if (pendingRescan) {
        pendingRescan = false;
        triggerScan();
      }
    }
  };

  try {
    const watcher = watch(root, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      if (IGNORE_PATTERNS.some(p => filename.includes(p))) return;

      changedFiles.add(filename);

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        const fileList = Array.from(changedFiles).slice(0, 5);
        const fileListStr = fileList.length > 5 ? `${fileList.join(", ")}...` : fileList.join(", ");
        info(`Change${changedFiles.size > 1 ? "s" : ""}: ${fileListStr}`);
        triggerScan();
      }, options.debounce);
    });

    process.on("SIGINT", () => {
      watcher.close();
      log("\nStopped watching.");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      watcher.close();
      process.exit(0);
    });
  } catch {
    log("Warning: recursive watch not supported. Watching top-level only.");
  }
}

/**
 * Incremental scan - only updates affected parts of the manifest
 */
async function incrementalScan(
  root: string,
  options: CLIOptions,
  changedFiles: string[]
): Promise<void> {
  const manifestPath = join(root, ".codebase.json");

  // Read existing manifest
  let manifest: Record<string, unknown>;
  try {
    const content = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(content);
  } catch {
    // If manifest doesn't exist or is corrupted, do a full scan
    warn("Manifest not found or corrupted, doing full scan...");
    await runScan({ ...options, incremental: false });
    return;
  }

  // Determine which categories need re-scanning based on changed files
  const categoriesToRescan = determineAffectedCategories(changedFiles);

  if (categoriesToRescan.length === 0) {
    log("No relevant categories affected, skipping update.");
    return;
  }

  log(`Updating: ${categoriesToRescan.join(", ")}...`);

  // Import scanner dynamically to avoid circular deps
  const { scan } = await import("../scanner/engine.js");

  // Re-scan only affected categories
  const updates = await scan(root, {
    depth: options.depth,
    categories: categoriesToRescan,
    incremental: true,
    quiet: true,
    sync: options.sync,
  });

  // Patch the manifest with updated categories
  let updateCount = 0;
  for (const category of categoriesToRescan) {
    if ((updates as Record<string, unknown>)[category]) {
      const oldData = (manifest as Record<string, unknown>)[category];
      const newData = (updates as Record<string, unknown>)[category];

      // Check if data actually changed
      if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
        (manifest as Record<string, unknown>)[category] = newData;
        updateCount++;
        success(`${capitalize(category)} (updated)`);
      }
    }
  }

  // Always update timestamp
  manifest.generated_at = new Date().toISOString();

  // Write updated manifest
  const content = JSON.stringify(manifest, null, 2);
  await writeFile(manifestPath, content, "utf-8");

  const sizeKB = (Buffer.byteLength(content) / 1024).toFixed(1);
  log(`Updated: .codebase.json (${sizeKB} KB, ${updateCount} categories changed)`);
}

function determineAffectedCategories(changedFiles: string[]): string[] {
  const categories = new Set<string>();

  for (const file of changedFiles) {
    // Lowercase for comparison
    const lower = file.toLowerCase();

    // Structure and repo are affected by almost any file change
    if (!file.includes("node_modules/") && !file.includes(".git/")) {
      categories.add("structure");
    }

    // Config files
    if (
      lower.includes("package.json") ||
      lower.includes("tsconfig.json") ||
      lower.includes(".eslintrc") ||
      lower.includes("prettier.config") ||
      lower.includes("vite.config") ||
      lower.includes("webpack.config") ||
      lower.includes("rollup.config") ||
      lower.includes("tailwind.config") ||
      lower.includes("pyproject.toml") ||
      lower.includes("setup.py") ||
      lower.includes("requirements.txt") ||
      lower.includes("cargo.toml") ||
      lower.includes("go.mod") ||
      lower.includes("pom.xml") ||
      lower.includes("build.gradle") ||
      lower.includes("gemfile") ||
      lower.includes("composer.json")
    ) {
      categories.add("stack");
      categories.add("commands");
      categories.add("dependencies");
      categories.add("config");
    }

    // Test files
    if (
      lower.includes("test") ||
      lower.includes("spec") ||
      lower.endsWith(".test.ts") ||
      lower.endsWith(".test.js") ||
      lower.endsWith(".spec.ts") ||
      lower.endsWith(".spec.js") ||
      lower.includes("__tests__") ||
      lower.includes("tests/")
    ) {
      categories.add("quality");
    }

    // README and docs
    if (
      lower.includes("readme") ||
      lower.endsWith(".md") &&
      !lower.includes("node_modules/")
    ) {
      categories.add("project");
    }

    // CI/CD files
    if (
      lower.includes(".github") ||
      lower.includes(".gitlab-ci") ||
      lower.includes("jenkinsfile") ||
      lower.includes(".circleci") ||
      lower.includes("travis.yml")
    ) {
      categories.add("quality");
    }
  }

  return Array.from(categories);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
