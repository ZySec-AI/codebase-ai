import { resolve } from "node:path";
import type { CLIOptions } from "../types.js";
import { startMcpServer } from "../mcp/server.js";

export async function runMcp(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  await startMcpServer(root);
}
