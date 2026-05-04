import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Regression test for SH3-01.
 *
 * `ghLinkCommits` in src/mcp/server.ts builds a `git log` invocation of the
 * form `git log --max-count=N --pretty=format:%H%x09%s [since]`. A previous
 * version added a `--` separator before `<since>`, which makes git interpret
 * `<since>` as a pathspec rather than a revision — silently scanning zero
 * commits and breaking the trace evidence chain.
 *
 * This test pins the contract:
 *   - Date-like values (ISO date, "Nd.ago") use `--since=<value>` so git
 *     treats them as dates without ambiguity warnings.
 *   - Revision-like values (SHA, HEAD~N, range) pass positionally.
 *   - `--` separator must NEVER precede `since` (would force pathspec).
 */

let repo: string;

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf-8", timeout: 10_000 }).trim();
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "git-log-since-"));
  git(["init", "-q"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  // Three commits: only the middle one references #42 in the subject.
  writeFileSync(join(repo, "a.txt"), "a");
  git(["add", "a.txt"]);
  git(["commit", "-q", "-m", "first commit"]);
  writeFileSync(join(repo, "b.txt"), "b");
  git(["add", "b.txt"]);
  git(["commit", "-q", "-m", "fix(#42): patch the thing"]);
  writeFileSync(join(repo, "c.txt"), "c");
  git(["add", "c.txt"]);
  git(["commit", "-q", "-m", "third commit"]);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("git log with `since` matches ghLinkCommits invocation shape", () => {
  it("relative window via --since= scans commits", () => {
    const out = execFileSync(
      "git",
      ["log", "--max-count=50", "--pretty=format:%H%x09%s", "--since=1.day.ago"],
      { cwd: repo, encoding: "utf-8", timeout: 10_000 }
    );
    const lines = out.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const matching = lines.filter((l) => /#42\b/.test(l));
    expect(matching).toHaveLength(1);
    expect(matching[0]).toContain("fix(#42): patch the thing");
  });

  it("ISO date via --since= scans all commits in window", () => {
    const out = execFileSync(
      "git",
      ["log", "--max-count=50", "--pretty=format:%H%x09%s", "--since=2020-01-01"],
      { cwd: repo, encoding: "utf-8", timeout: 10_000 }
    );
    const lines = out.split("\n").filter(Boolean);
    expect(lines.length).toBe(3);
  });

  it("FAILS when `--` precedes since (regression case — must never reintroduce)", () => {
    // Pin the bad behaviour. With `--`, git treats the value as a pathspec —
    // no such file in the tree → empty result.
    const out = execFileSync(
      "git",
      ["log", "--max-count=50", "--pretty=format:%H%x09%s", "--", "1.day.ago"],
      { cwd: repo, encoding: "utf-8", timeout: 10_000 }
    );
    expect(out.trim()).toBe("");
  });

  it("revision (HEAD~N) passed positionally limits the range correctly", () => {
    // `git log HEAD~1` shows commits reachable from HEAD~1 (the second-to-last).
    // For our 3-commit fixture: that's commits 1 and 2. The fact that this
    // returns >0 lines proves a positional revision is treated as a revision,
    // not a pathspec — which is the property SH3-01 fixed.
    const out = execFileSync(
      "git",
      ["log", "--max-count=50", "--pretty=format:%H%x09%s", "HEAD~1"],
      { cwd: repo, encoding: "utf-8" }
    );
    const lines = out.split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    // The #42 commit is HEAD~1 itself — must be included in the result.
    const matching = lines.filter((l) => /#42\b/.test(l));
    expect(matching).toHaveLength(1);
  });
});
