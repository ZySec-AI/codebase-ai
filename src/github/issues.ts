import { execFile } from "node:child_process";
import { log, success, error } from "../utils/output.js";

/**
 * Execute gh CLI with proper argument passing (no shell interpolation).
 */
function ghExec(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gh", args, { cwd, timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function createIssue(
  root: string,
  title: string,
  body?: string,
  labels?: string[]
): Promise<void> {
  const issueBody =
    body ||
    `## Summary\n\n${title}\n\n## Steps to Reproduce\n\n1. \n\n## Expected\n\n\n\n## Actual\n\n`;
  const args = ["issue", "create", "--title", title, "--body", issueBody];
  if (labels?.length) {
    args.push("--label", labels.join(","));
  }

  try {
    const url = await ghExec(root, args);
    const number = url.split("/").pop() ?? "";
    success(`Created #${number} — ${url}`);
  } catch (e) {
    error(`Failed to create issue: ${(e as Error).message}`);
  }
}

export async function closeIssue(root: string, number: string, reason?: string): Promise<void> {
  try {
    const args = ["issue", "close", number];
    if (reason) {
      args.push("--comment", reason);
    }
    await ghExec(root, args);

    // Fetch issue title and URL for richer output
    try {
      const json = await ghExec(root, ["issue", "view", number, "--json", "title,url"]);
      const { title, url } = JSON.parse(json) as { title: string; url: string };
      success(`Closed #${number}: ${title}`);
      log(`     ${url}`);
    } catch {
      success(`Closed issue #${number}`);
    }
  } catch (e) {
    error(`Failed to close issue: ${(e as Error).message}`);
  }
}

export async function listIssues(root: string, filter?: string): Promise<void> {
  try {
    const args = ["issue", "list", "--limit", "30"];
    if (filter === "mine") {
      args.push("--assignee", "@me");
    }

    const output = await ghExec(root, args);
    if (output) {
      log(output);
    } else {
      log("No issues found.");
    }
  } catch (e) {
    error(`Failed to list issues: ${(e as Error).message}`);
  }
}

/** Allowed comment kinds — surfaced in MCP `comment_issue` and the standard footer. */
export type CommentKind = "status" | "evidence" | "decision" | "close-reason" | "note";

const VALID_KINDS: ReadonlySet<CommentKind> = new Set([
  "status",
  "evidence",
  "decision",
  "close-reason",
  "note",
]);

export function isCommentKind(value: string): value is CommentKind {
  return VALID_KINDS.has(value as CommentKind);
}

export interface TraceFooter {
  kind: CommentKind;
  branch?: string;
  promptId?: string;
  ts?: string;
}

/**
 * Append the standard codebase trace footer to a comment body.
 * Format is intentionally stable so external tooling can grep for it.
 */
export function withTraceFooter(body: string, trace: TraceFooter): string {
  const ts = trace.ts ?? new Date().toISOString();
  const parts = [`${trace.kind} via codebase MCP @ ${ts}`];
  if (trace.branch) {
    parts.push(`branch ${trace.branch}`);
  }
  if (trace.promptId) {
    parts.push(`prompt ${trace.promptId}`);
  }
  return `${body.trimEnd()}\n\n---\n_${parts.join(" · ")}_`;
}

export async function commentIssue(root: string, number: string, body: string): Promise<void> {
  try {
    const url = await ghExec(root, ["issue", "comment", number, "--body", body]);
    if (url) {
      success(`Comment added to #${number} — ${url}`);
    } else {
      success(`Comment added to #${number}`);
    }
  } catch (e) {
    error(`Failed to comment on issue: ${(e as Error).message}`);
  }
}

/**
 * Lower-level helper: post a comment and return gh's stdout (the comment URL on success).
 * Throws on failure rather than logging — for MCP use where the caller decides how to surface errors.
 */
export async function postIssueComment(
  root: string,
  number: number | string,
  body: string
): Promise<string> {
  return ghExec(root, ["issue", "comment", String(number), "--body", body]);
}

export interface StructuredCloseInput {
  number: number;
  reason: "fixed" | "wont-fix" | "duplicate" | "not-reproducible" | "obsolete";
  comment: string;
  evidence?: string;
  commits?: string[];
  branch?: string;
  promptId?: string;
}

const REASON_LABELS: Record<StructuredCloseInput["reason"], string> = {
  fixed: "Fixed",
  "wont-fix": "Won't fix",
  duplicate: "Duplicate",
  "not-reproducible": "Not reproducible",
  obsolete: "Obsolete",
};

/**
 * Build the markdown body for a structured close comment.
 * Pure function — can be unit-tested without hitting gh.
 */
export function buildCloseBody(input: StructuredCloseInput): string {
  const lines: string[] = [];
  lines.push(`**Closed: ${REASON_LABELS[input.reason]}**`);
  lines.push("");
  lines.push(input.comment.trim());
  if (input.evidence?.trim()) {
    lines.push("");
    lines.push("**Evidence**");
    lines.push("");
    lines.push(input.evidence.trim());
  }
  if (input.commits?.length) {
    const cleaned = input.commits.map((c) => c.trim()).filter(Boolean);
    if (cleaned.length > 0) {
      lines.push("");
      lines.push("**Commits**");
      lines.push("");
      for (const sha of cleaned) {
        lines.push(`- ${sha}`);
      }
    }
  }
  return withTraceFooter(lines.join("\n"), {
    kind: "close-reason",
    branch: input.branch,
    promptId: input.promptId,
  });
}

/**
 * Close the issue then post a structured comment.
 * Order matters: if the close fails, we throw before posting the comment,
 * so the issue timeline never contains "Closed: …" comments on issues that
 * are still open. The recoverable failure mode is "closed without comment"
 * (callers can repair via `commentIssue`).
 *
 * Returns the body that was posted so callers can surface it to the user/AI.
 */
export async function closeWithStructuredComment(
  root: string,
  input: StructuredCloseInput
): Promise<{ body: string; commentUrl: string }> {
  const body = buildCloseBody(input);
  await ghExec(root, ["issue", "close", String(input.number)]);
  const commentUrl = await postIssueComment(root, input.number, body);
  return { body, commentUrl };
}

export async function mapIssueToFiles(
  root: string,
  issueNumber: string,
  files: string[]
): Promise<void> {
  try {
    const body = `**Mapped files:**\n${files.map((f) => `- \`${f}\``).join("\n")}`;
    await ghExec(root, ["issue", "comment", issueNumber, "--body", body]);
    success(`Mapped issue #${issueNumber} to ${files.length} files`);
  } catch (e) {
    error(`Failed to map issue: ${(e as Error).message}`);
  }
}
