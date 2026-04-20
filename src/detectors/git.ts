import type { Detector, ScanContext } from "../types.js";

export const gitDetector: Detector = {
  name: "git",
  category: "git",

  async detect(ctx: ScanContext) {
    const [commits, committers, uncommitted] = await Promise.all([
      getRecentCommits(ctx),
      getLastCommitters(ctx),
      getUncommittedChanges(ctx),
    ]);

    return {
      recent_commits: commits,
      last_committers: committers,
      uncommitted_changes: uncommitted,
    };
  },
};

async function getRecentCommits(ctx: ScanContext): Promise<string[]> {
  const output = await ctx.exec("git", ["log", "--oneline", "-5", "--format=%s"]);
  if (!output) {
    return [];
  }
  return output.split("\n").filter(Boolean);
}

async function getLastCommitters(ctx: ScanContext): Promise<string[]> {
  const output = await ctx.exec("git", ["shortlog", "-sn", "--no-merges", "-5"]);
  if (!output) {
    return [];
  }
  return output
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\s+/, "").trim())
    .filter(Boolean);
}

async function getUncommittedChanges(ctx: ScanContext): Promise<boolean | string[]> {
  const output = await ctx.exec("git", ["status", "--porcelain"]);
  if (!output || output.trim().length === 0) {
    return false;
  }
  const files = output
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  // If too many changed files, just return true to keep the manifest compact
  if (files.length > 20) {
    return true;
  }
  return files;
}
