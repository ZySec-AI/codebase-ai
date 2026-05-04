import { describe, it, expect } from "vitest";
import { buildCloseBody, isCommentKind, withTraceFooter } from "../../src/github/issues.js";

describe("isCommentKind", () => {
  it("accepts known kinds", () => {
    expect(isCommentKind("status")).toBe(true);
    expect(isCommentKind("evidence")).toBe(true);
    expect(isCommentKind("decision")).toBe(true);
    expect(isCommentKind("close-reason")).toBe(true);
    expect(isCommentKind("note")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isCommentKind("random")).toBe(false);
    expect(isCommentKind("")).toBe(false);
  });
});

describe("withTraceFooter", () => {
  it("appends standard footer with required parts", () => {
    const body = withTraceFooter("hello", {
      kind: "status",
      ts: "2026-05-04T12:00:00.000Z",
    });
    expect(body).toContain("hello");
    expect(body).toContain("---");
    expect(body).toContain("status via codebase MCP @ 2026-05-04T12:00:00.000Z");
  });

  it("includes branch and prompt id when provided", () => {
    const body = withTraceFooter("x", {
      kind: "evidence",
      branch: "feature/foo",
      promptId: "abc123",
      ts: "2026-05-04T12:00:00.000Z",
    });
    expect(body).toContain("branch feature/foo");
    expect(body).toContain("prompt abc123");
  });

  it("omits branch and prompt cleanly when missing", () => {
    const body = withTraceFooter("x", { kind: "note", ts: "2026-05-04T12:00:00.000Z" });
    expect(body).not.toContain("branch ");
    expect(body).not.toContain("prompt ");
  });
});

describe("buildCloseBody", () => {
  it("produces a structured body with reason, comment, evidence, commits, footer", () => {
    const body = buildCloseBody({
      number: 42,
      reason: "fixed",
      comment: "patched the auth flow",
      evidence: "all tests pass\nnpm run test → 142 ok",
      commits: ["abc1234", "def5678"],
      branch: "fix/auth",
      promptId: "p1",
    });
    expect(body).toMatch(/^\*\*Closed: Fixed\*\*/);
    expect(body).toContain("patched the auth flow");
    expect(body).toContain("**Evidence**");
    expect(body).toContain("all tests pass");
    expect(body).toContain("**Commits**");
    expect(body).toContain("- abc1234");
    expect(body).toContain("- def5678");
    expect(body).toContain("close-reason via codebase MCP @");
    expect(body).toContain("branch fix/auth");
    expect(body).toContain("prompt p1");
  });

  it("renders 'wont-fix' label", () => {
    const body = buildCloseBody({
      number: 1,
      reason: "wont-fix",
      comment: "out of scope",
    });
    expect(body).toContain("Closed: Won't fix");
  });

  it("omits empty evidence and commits sections", () => {
    const body = buildCloseBody({
      number: 1,
      reason: "duplicate",
      comment: "see #99",
      commits: [],
    });
    expect(body).not.toContain("**Evidence**");
    expect(body).not.toContain("**Commits**");
    expect(body).toContain("see #99");
  });

  it("trims commit SHAs and skips blanks", () => {
    const body = buildCloseBody({
      number: 1,
      reason: "fixed",
      comment: "done",
      commits: ["  abc  ", "", "def"],
    });
    expect(body).toContain("- abc");
    expect(body).toContain("- def");
    expect(body.match(/^- /gm)?.length).toBe(2);
  });
});
