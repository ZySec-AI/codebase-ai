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
    success(`Created issue: ${url}`);
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
    success(`Closed issue #${number}`);
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

export async function commentIssue(root: string, number: string, body: string): Promise<void> {
  try {
    await ghExec(root, ["issue", "comment", number, "--body", body]);
    success(`Comment added to issue #${number}`);
  } catch (e) {
    error(`Failed to comment on issue: ${(e as Error).message}`);
  }
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
