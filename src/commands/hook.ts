import { resolve } from "node:path";
import type { CLIOptions } from "../types.js";
import { installHook, uninstallHook } from "../integrations/githook.js";
import { success, error } from "../utils/output.js";

export async function runHook(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  switch (options.subcommand) {
    case "install": {
      const ok = installHook(root);
      if (ok) success("Git post-commit hook installed.");
      else error("Not a git repository.");
      break;
    }
    case "uninstall": {
      const ok = uninstallHook(root);
      if (ok) success("Git post-commit hook removed.");
      else error("No hook found to remove.");
      break;
    }
    default:
      error("Usage: codebase hook install|uninstall");
      process.exit(1);
  }
}
