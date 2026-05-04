import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  capturePrompt,
  findPrompt,
  parseSince,
  readPrompts,
  type PromptRecord,
} from "../prompts/store.js";
import { error, log } from "../utils/output.js";
import type { CLIOptions } from "../types.js";

const exec = promisify(execFile);

// The shared arg parser strips unknown --flag <value> pairs entirely, so we
// re-scan process.argv here to recover prompt-specific flags (--issue, --branch,
// --since, --limit) without forcing every flag to be globally known.
function findFlagValue(_positionals: string[], flag: string): string | undefined {
  const argv = process.argv;
  const i = argv.indexOf(flag);
  if (i < 0) {
    return undefined;
  }
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : undefined;
}

function flagPresent(_positionals: string[], flag: string): boolean {
  return process.argv.includes(flag);
}

function summarize(rec: PromptRecord): string {
  const first = rec.prompt.split("\n").find((l) => l.trim()) ?? "";
  const trimmed = first.length > 90 ? first.slice(0, 87) + "..." : first;
  const issues = rec.issue_refs.length > 0 ? ` issues=${rec.issue_refs.join(",")}` : "";
  const branch = rec.branch ? ` branch=${rec.branch}` : "";
  const redacted = rec.redacted ? " [redacted]" : "";
  return `${rec.ts} ${rec.id}${branch}${issues}${redacted}\n  ${trimmed}`;
}

async function detectBranch(root: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: root,
      timeout: 5_000,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function ghAvailable(root: string): Promise<boolean> {
  try {
    await exec("gh", ["auth", "status"], { cwd: root, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function postIssueComment(root: string, number: number, body: string): Promise<boolean> {
  try {
    await exec("gh", ["issue", "comment", String(number), "--body", body], {
      cwd: root,
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function runPrompts(options: CLIOptions): Promise<void> {
  const root = options.path;
  const sub = options.subcommand;
  const positionals = options.positionals;

  if (sub === "list" || sub === "" || sub === undefined) {
    const issueFlag = findFlagValue(positionals, "--issue");
    const branchFlag = findFlagValue(positionals, "--branch");
    const sinceFlag = findFlagValue(positionals, "--since");
    const limitFlag = findFlagValue(positionals, "--limit");
    const json = flagPresent(positionals, "--json");

    const filter: Parameters<typeof readPrompts>[1] = {};
    if (issueFlag) {
      filter.issue = parseInt(issueFlag, 10);
    }
    if (branchFlag) {
      filter.branch = branchFlag;
    }
    if (sinceFlag) {
      filter.since = parseSince(sinceFlag);
    }
    if (limitFlag) {
      filter.limit = parseInt(limitFlag, 10) || undefined;
    }
    const records = readPrompts(root, filter);
    if (json) {
      log(JSON.stringify(records, null, 2));
      return;
    }
    if (records.length === 0) {
      log("No prompts captured yet.");
      return;
    }
    for (const rec of records) {
      log(summarize(rec));
    }
    log(`\n${records.length} prompt(s).`);
    return;
  }

  if (sub === "show") {
    const id = positionals.find((p) => !p.startsWith("--"));
    if (!id) {
      error("Usage: codebase prompts show <id>");
      process.exit(1);
    }
    const rec = findPrompt(root, id);
    if (!rec) {
      error(`No prompt with id ${id}`);
      process.exit(1);
    }
    log(JSON.stringify(rec, null, 2));
    return;
  }

  if (sub === "capture") {
    // Internal subcommand used by the prompt-capture hook.
    // Reads the prompt body from stdin (Claude Code hook contract: JSON or raw).
    const sessionId =
      findFlagValue(positionals, "--session") ?? process.env.CLAUDE_SESSION_ID ?? "";
    // Mirror is OPT-IN for safety. Default behaviour: capture locally only.
    // Enable by setting CODEBASE_PROMPT_MIRROR=1 OR passing --mirror.
    // Backwards-compat: --no-mirror still works (was the previous escape hatch).
    const explicitMirror = flagPresent(positionals, "--mirror");
    const explicitNoMirror = flagPresent(positionals, "--no-mirror");
    const envMirror = process.env.CODEBASE_PROMPT_MIRROR === "1";
    const shouldMirror = !explicitNoMirror && (explicitMirror || envMirror);

    const stdin = await readStdin();
    let promptText = stdin;
    let parsedSession = sessionId;
    if (stdin.trim().startsWith("{")) {
      try {
        const data = JSON.parse(stdin) as { prompt?: string; session_id?: string };
        if (typeof data.prompt === "string") {
          promptText = data.prompt;
        }
        if (!parsedSession && typeof data.session_id === "string") {
          parsedSession = data.session_id;
        }
      } catch {
        /* fall back to raw */
      }
    }

    if (!promptText.trim()) {
      return;
    }

    const branch = await detectBranch(root);
    const record = capturePrompt(root, {
      session_id: parsedSession,
      branch,
      cwd: root,
      prompt: promptText,
    });

    if (shouldMirror && record.issue_refs.length > 0 && (await ghAvailable(root))) {
      // If anything was redacted, do NOT mirror partial content — replace with a
      // generic placeholder so a missed pattern can never leak via the snippet.
      let snippet: string;
      if (record.redacted) {
        snippet = `_prompt contained credentials — full body suppressed_`;
      } else {
        snippet = record.prompt.length > 500 ? record.prompt.slice(0, 500) + "..." : record.prompt;
        snippet = `> ${snippet.replace(/\n/g, "\n> ")}`;
      }
      const body = `**Prompt @ ${record.ts}** (id \`${record.id}\`${branch ? `, branch \`${branch}\`` : ""})\n\n${snippet}\n\n---\n_captured by codebase prompts hook_`;
      // Parallel comment posts — no point serialising; failures are independent.
      await Promise.all(
        record.issue_refs.map((issue) => postIssueComment(root, issue, body).catch(() => false))
      );
    }

    if (!options.quiet) {
      const mirroredNote = shouldMirror && record.issue_refs.length > 0 ? " [mirrored]" : "";
      log(
        `captured prompt ${record.id}${record.issue_refs.length ? ` → #${record.issue_refs.join(", #")}` : ""}${mirroredNote}`
      );
    }
    return;
  }

  error(`Unknown prompts subcommand: ${sub}`);
  log("Usage: codebase prompts [list|show|capture] [options]");
  process.exit(1);
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
    // Safety timeout: hooks must never block.
    setTimeout(() => resolve(data), 4_000).unref();
  });
}
