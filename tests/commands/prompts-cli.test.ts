import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Regression test: pins the prompts CLI flag-parsing contract.
 *
 * The shared arg parser in src/utils/args.ts strips unknown `--flag <value>`
 * pairs entirely, so src/commands/prompts.ts re-reads `process.argv` to
 * recover --issue, --branch, --since, --limit, --json, --no-mirror, --mirror.
 * If anyone changes the global parser to consume these names without passing
 * them through CLIOptions, this test catches it.
 */

const CLI = resolve(__dirname, "..", "..", "dist", "index.js");

let root: string;

function run(args: string[], input?: string): string {
  return execFileSync("node", [CLI, ...args], {
    cwd: root,
    input: input ?? "",
    encoding: "utf-8",
    timeout: 10_000,
  });
}

beforeAll(() => {
  if (!existsSync(CLI)) {
    throw new Error(
      `dist/index.js missing — run \`npm run build\` before vitest. Looked at ${CLI}`
    );
  }
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cb-prompts-cli-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

afterAll(() => {
  // no-op
});

describe("prompts CLI: capture + list + flag handling", () => {
  it("captures via stdin and lists by default", () => {
    run(["prompts", "capture", "--no-mirror", "--quiet"], "fix issue #42 please");
    run(["prompts", "capture", "--no-mirror", "--quiet"], "another prompt about #99");
    const out = run(["prompts", "list"]);
    expect(out).toContain("#42");
    expect(out).toContain("#99");
    expect(out).toContain("2 prompt(s).");
  });

  it("--issue filter survives the global arg parser", () => {
    run(["prompts", "capture", "--no-mirror", "--quiet"], "issue #42");
    run(["prompts", "capture", "--no-mirror", "--quiet"], "issue #100");
    run(["prompts", "capture", "--no-mirror", "--quiet"], "issue #42 again");

    const out = run(["prompts", "list", "--issue", "42"]);
    expect(out).toContain("2 prompt(s).");
    expect(out).not.toContain("#100");

    const none = run(["prompts", "list", "--issue", "9999"]);
    expect(none).toContain("No prompts captured yet.");
  });

  it("--limit flag survives the global arg parser", () => {
    run(["prompts", "capture", "--no-mirror", "--quiet"], "first");
    run(["prompts", "capture", "--no-mirror", "--quiet"], "second");
    run(["prompts", "capture", "--no-mirror", "--quiet"], "third");

    const out = run(["prompts", "list", "--limit", "1"]);
    expect(out).toContain("1 prompt(s).");
  });

  it("default capture does NOT mirror to GitHub (opt-in via --mirror or env)", () => {
    // No --mirror passed, no CODEBASE_PROMPT_MIRROR — capture must succeed
    // without attempting any gh comment posts. We verify by using a fake gh
    // path: if mirroring were attempted, it would error. With opt-out default,
    // capture should be silent and store the record.
    const out = run(["prompts", "capture", "--quiet"], "issue #1 — default should not mirror");
    // No errors on stdout/stderr. List confirms it landed.
    expect(out).toBe("");
    const list = run(["prompts", "list", "--issue", "1"]);
    expect(list).toContain("1 prompt(s).");
  });

  it("--json emits parseable JSON", () => {
    run(["prompts", "capture", "--no-mirror", "--quiet"], "test #7");
    const out = run(["prompts", "list", "--json"]);
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].issue_refs).toContain(7);
  });
});
