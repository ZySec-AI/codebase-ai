import { resolve } from "node:path";
import type { CLIOptions } from "../types.js";
import {
  createIssue,
  closeIssue,
  commentIssue,
  listIssues,
  mapIssueToFiles,
} from "../github/issues.js";
import { error } from "../utils/output.js";

export async function runIssue(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  switch (options.subcommand) {
    case "create": {
      const title = options.positionals[0];
      if (!title) {
        error('Usage: codebase issue create "Issue title" [--message "body"]');
        process.exit(1);
      }
      await createIssue(root, title, options.message || undefined);
      break;
    }
    case "close": {
      const number = options.positionals[0];
      if (!number) {
        error('Usage: codebase issue close <number> [--reason "reason"]');
        process.exit(1);
      }
      await closeIssue(root, number, options.reason || undefined);
      break;
    }
    case "comment": {
      const number = options.positionals[0];
      const body = options.message;
      if (!number || !body) {
        error('Usage: codebase issue comment <number> --message "text"');
        process.exit(1);
      }
      await commentIssue(root, number, body);
      break;
    }
    case "list": {
      const filter = options.positionals[0]; // "mine" from --mine flag
      await listIssues(root, filter);
      break;
    }
    case "map": {
      const number = options.positionals[0];
      const files = options.positionals.slice(1);
      if (!number || files.length === 0) {
        error("Usage: codebase issue map <number> <file1> <file2> ...");
        process.exit(1);
      }
      await mapIssueToFiles(root, number, files);
      break;
    }
    default:
      error("Usage: codebase issue create|close|comment|list|map");
      process.exit(1);
  }
}
