import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import type { CLIOptions } from "../types.js";
import { startServer } from "../server/index.js";
import { runScan } from "./scan.js";

export async function runServe(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  // Ensure manifest exists
  if (!existsSync(join(root, ".codebase.json"))) {
    await runScan({ ...options, quiet: true });
  }

  startServer(root, options.port);
}
