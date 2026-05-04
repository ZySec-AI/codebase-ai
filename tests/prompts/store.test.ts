import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  capturePrompt,
  extractIssueRefs,
  findPrompt,
  latestPromptId,
  latestPromptIdFast,
  parseSince,
  readPrompts,
  redactSecrets,
} from "../../src/prompts/store.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "prompts-store-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("extractIssueRefs", () => {
  it("extracts #N", () => {
    expect(extractIssueRefs("fix #42 and #7 too")).toEqual([7, 42]);
  });

  it("ignores hash inside identifiers", () => {
    expect(extractIssueRefs("color: #abc123 and revision a#42")).toEqual([]);
  });

  it("matches GH-N", () => {
    expect(extractIssueRefs("see GH-101")).toEqual([101]);
  });

  it("matches issue URL", () => {
    expect(extractIssueRefs("https://github.com/foo/bar/issues/9001 needs review")).toEqual([9001]);
  });

  it("matches 'issue 12'", () => {
    expect(extractIssueRefs("close issue 12")).toEqual([12]);
  });

  it("dedupes across patterns", () => {
    expect(extractIssueRefs("#42 and GH-42 and issues/42")).toEqual([42]);
  });
});

describe("redactSecrets", () => {
  it("passes through clean text", () => {
    const out = redactSecrets("just some prompt text");
    expect(out.redacted).toBe(false);
    expect(out.text).toBe("just some prompt text");
  });

  it("redacts AWS access key tokens (preserves surrounding context)", () => {
    const key = "AKIA" + "IOSFODNN7EXAMPLE";
    const out = redactSecrets(`leaked ${key} here on issue #42`);
    expect(out.redacted).toBe(true);
    expect(out.text).not.toContain(key);
    expect(out.text).toContain("[REDACTED:aws-access-key-id]");
    // Token-precise — issue ref must survive.
    expect(out.text).toContain("#42");
    expect(out.text).toContain("leaked");
    expect(out.text).toContain("here on issue");
  });

  it("redacts a JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const out = redactSecrets(`token: ${jwt}`);
    expect(out.redacted).toBe(true);
    expect(out.text).not.toContain(jwt);
    // Bearer/keyword pattern catches the prefix; JWT pattern catches the body.
    // Either ends with [REDACTED:...]. Just confirm redaction happened.
    expect(out.text).toMatch(/\[REDACTED:/);
  });

  it("redacts a ghp_ token", () => {
    const tok = "ghp_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    const out = redactSecrets(`my token is ${tok} now`);
    expect(out.redacted).toBe(true);
    expect(out.text).not.toContain(tok);
    expect(out.text).toContain("[REDACTED:github-pat]");
  });

  it("redacts bearer-prefixed tokens", () => {
    const out = redactSecrets("Authorization: Bearer abcdefghijklmnop1234567890");
    expect(out.redacted).toBe(true);
    expect(out.text).toContain("[REDACTED:bearer-or-keyword-token]");
  });

  it("redacts a PEM private key block", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\nfakebody\n-----END RSA PRIVATE KEY-----";
    const out = redactSecrets(`see attached: ${pem} thanks`);
    expect(out.redacted).toBe(true);
    expect(out.text).not.toContain("MIIEpAIBAAKCAQEA");
    expect(out.text).toContain("[REDACTED:private-key-block]");
  });

  it("truncates input over 256 KB and marks as redacted", () => {
    const huge = "x".repeat(300_000);
    const out = redactSecrets(huge);
    expect(out.redacted).toBe(true);
    expect(out.text).toContain("[TRUNCATED:");
    expect(out.text.length).toBeLessThanOrEqual(256 * 1024 + 200);
  });

  it("does not catastrophic-backtrack on colon-rich input without @", () => {
    // Crafted to trigger the OLD a+:b+@ pattern's worst case.
    const adversarial = "a:b:c:d:e:f:g:h:i:j:k:l:m:n:o:p:q:r:s:t".repeat(200);
    const start = Date.now();
    const out = redactSecrets(`postgres://${adversarial}`);
    const ms = Date.now() - start;
    // Should finish in well under 500 ms; the bounded pattern is linear.
    expect(ms).toBeLessThan(500);
    // No false positive for db-url-with-credentials (no @).
    expect(out.text).not.toContain("[REDACTED:database-url-with-credentials]");
  });
});

describe("capturePrompt + readPrompts", () => {
  it("appends a record and reads it back", () => {
    const rec = capturePrompt(root, {
      session_id: "s1",
      branch: "main",
      prompt: "fix #42 please",
    });
    expect(rec.id).toBeTruthy();
    expect(rec.issue_refs).toEqual([42]);

    const all = readPrompts(root);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(rec.id);
    expect(all[0].prompt).toBe("fix #42 please");
  });

  it("redacts secrets in stored body", () => {
    const key = "AKIA" + "IOSFODNN7EXAMPLE";
    const rec = capturePrompt(root, { prompt: `oops ${key}` });
    expect(rec.redacted).toBe(true);
    expect(rec.prompt).not.toContain(key);
    const file = join(root, ".codebase", "prompts.jsonl");
    expect(readFileSync(file, "utf-8")).not.toContain(key);
  });

  it("filters by issue", () => {
    capturePrompt(root, { prompt: "unrelated" });
    capturePrompt(root, { prompt: "fix #5" });
    capturePrompt(root, { prompt: "do #5 again" });
    capturePrompt(root, { prompt: "do #6" });
    const five = readPrompts(root, { issue: 5 });
    expect(five).toHaveLength(2);
    const six = readPrompts(root, { issue: 6 });
    expect(six).toHaveLength(1);
  });

  it("filters by branch and respects limit", () => {
    capturePrompt(root, { prompt: "a", branch: "main" });
    capturePrompt(root, { prompt: "b", branch: "feat" });
    capturePrompt(root, { prompt: "c", branch: "feat" });
    const feat = readPrompts(root, { branch: "feat", limit: 1 });
    expect(feat).toHaveLength(1);
    expect(feat[0].prompt).toBe("c");
  });

  it("filters by since", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    capturePrompt(root, { prompt: "old", ts: past });
    capturePrompt(root, { prompt: "new" });
    const recent = readPrompts(root, { since: new Date(Date.now() - 60_000) });
    expect(recent).toHaveLength(1);
    expect(recent[0].prompt).toBe("new");
  });

  it("findPrompt returns by id", () => {
    const a = capturePrompt(root, { prompt: "a" });
    const b = capturePrompt(root, { prompt: "b" });
    expect(findPrompt(root, b.id)?.prompt).toBe("b");
    expect(findPrompt(root, "missing")).toBeUndefined();
    expect(findPrompt(root, a.id)?.prompt).toBe("a");
  });

  it("latestPromptId scopes by session", () => {
    capturePrompt(root, { prompt: "x", session_id: "A" });
    capturePrompt(root, { prompt: "y", session_id: "B" });
    const lastA = latestPromptId(root, "A");
    const lastB = latestPromptId(root, "B");
    expect(lastA).toBeTruthy();
    expect(lastB).toBeTruthy();
    expect(lastA).not.toBe(lastB);
  });

  it("latestPromptIdFast tail-reads correctly without falling back to undefined", () => {
    // Regression: this used `require("node:fs")` inside an ESM module which
    // threw silently and made every call return undefined — breaking prompt-id
    // traceability across all MCP tool calls.
    const a = capturePrompt(root, { prompt: "first", session_id: "S1" });
    const b = capturePrompt(root, { prompt: "second", session_id: "S1" });
    expect(latestPromptIdFast(root)).toBe(b.id);
    expect(latestPromptIdFast(root, "S1")).toBe(b.id);
    expect(latestPromptIdFast(root, "missing-session")).toBeUndefined();
    expect(a.id).not.toBe(b.id);
  });

  it("latestPromptIdFast handles missing file", () => {
    expect(latestPromptIdFast(root)).toBeUndefined();
  });

  it("readPrompts on missing file is empty", () => {
    expect(readPrompts(root)).toEqual([]);
    expect(existsSync(join(root, ".codebase", "prompts.jsonl"))).toBe(false);
  });
});

describe("parseSince", () => {
  it("parses common windows", () => {
    expect(parseSince("30m")).toBeInstanceOf(Date);
    expect(parseSince("24h")).toBeInstanceOf(Date);
    expect(parseSince("7d")).toBeInstanceOf(Date);
    expect(parseSince("1w")).toBeInstanceOf(Date);
  });
  it("rejects garbage", () => {
    expect(parseSince("nope")).toBeUndefined();
    expect(parseSince("0h")).toBeUndefined();
  });
});
