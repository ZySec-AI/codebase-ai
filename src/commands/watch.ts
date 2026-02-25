import { resolve } from "node:path";
import { watch } from "node:fs";
import type { CLIOptions } from "../types.js";
import { runScan } from "./scan.js";
import { log, info } from "../utils/output.js";

const IGNORE_PATTERNS = [
  "node_modules", ".git", "dist", "build", ".next",
  ".codebase.json", ".codebase.cache.json",
];

export async function runWatch(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  // Initial scan
  await runScan(options);

  log("\nWatching for changes...");

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let scanning = false;
  let pendingRescan = false;

  const triggerScan = async () => {
    if (scanning) {
      pendingRescan = true;
      return;
    }

    scanning = true;
    try {
      await runScan({ ...options, incremental: true });
      info("Watching for changes...");
    } finally {
      scanning = false;
      if (pendingRescan) {
        pendingRescan = false;
        triggerScan();
      }
    }
  };

  let cleanup: () => void;

  try {
    const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      if (IGNORE_PATTERNS.some(p => filename.includes(p))) return;

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        info(`Change: ${filename}`);
        triggerScan();
      }, options.debounce);
    });

    cleanup = () => watcher.close();
  } catch {
    // recursive watch not supported (Linux without inotify) — fall back to polling
    const pollInterval = Math.max(options.debounce * 5, 10_000);
    log(`Warning: recursive watch not supported. Polling every ${Math.round(pollInterval / 1000)}s.`);
    const interval = setInterval(() => {
      triggerScan();
    }, pollInterval);

    cleanup = () => clearInterval(interval);
  }

  process.on("SIGINT", () => {
    cleanup();
    log("\nStopped watching.");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}
