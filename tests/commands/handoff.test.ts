import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runHandoff } from "../../src/commands/handoff.js";

function makeOpts(root: string, message?: string) {
  return {
    path: root,
    message,
    quiet: true,
    slim: false,
    categories: [],
    depth: 4,
    format: "text",
    verbose: false,
  };
}

describe("runHandoff", () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `handoff-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    execSync("git init", { cwd: dir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: dir, stdio: "pipe" });
    execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });
    // Create initial commit
    writeFileSync(join(dir, "README.md"), "# test");
    execSync("git add README.md && git commit -m 'feat: initial'", { cwd: dir, stdio: "pipe" });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes HANDOFF.md to project root", async () => {
    await runHandoff(makeOpts(dir));
    expect(existsSync(join(dir, "HANDOFF.md"))).toBe(true);
  });

  it("HANDOFF.md includes expected sections", async () => {
    await runHandoff(makeOpts(dir));
    const content = readFileSync(join(dir, "HANDOFF.md"), "utf-8");
    expect(content).toContain("# HANDOFF.md");
    expect(content).toContain("## What Happened");
    expect(content).toContain("## Current State");
    expect(content).toContain("## For Next Session");
  });

  it("includes recent commits in What Happened", async () => {
    await runHandoff(makeOpts(dir));
    const content = readFileSync(join(dir, "HANDOFF.md"), "utf-8");
    expect(content).toContain("feat: initial");
  });

  it("includes --message content as Session Notes", async () => {
    await runHandoff(makeOpts(dir, "Finished auth module, next is billing"));
    const content = readFileSync(join(dir, "HANDOFF.md"), "utf-8");
    expect(content).toContain("## Session Notes");
    expect(content).toContain("Finished auth module");
  });

  it("omits Session Notes when no --message provided", async () => {
    await runHandoff(makeOpts(dir));
    const content = readFileSync(join(dir, "HANDOFF.md"), "utf-8");
    expect(content).not.toContain("## Session Notes");
  });

  it("shows 'none' for stashed work when no stashes", async () => {
    await runHandoff(makeOpts(dir));
    const content = readFileSync(join(dir, "HANDOFF.md"), "utf-8");
    expect(content).toContain("Stashed work:** none");
  });

  it("includes PLAN.md snippet when present", async () => {
    writeFileSync(join(dir, "PLAN.md"), "# Plan\n\nDo stuff.");
    await runHandoff(makeOpts(dir));
    const content = readFileSync(join(dir, "HANDOFF.md"), "utf-8");
    expect(content).toContain("## Active Plan");
    expect(content).toContain("Do stuff.");
  });

  it("skips Active Plan section when PLAN.md absent", async () => {
    await runHandoff(makeOpts(dir));
    const content = readFileSync(join(dir, "HANDOFF.md"), "utf-8");
    expect(content).not.toContain("## Active Plan");
  });

  it("instructs next session to run codebase brief", async () => {
    await runHandoff(makeOpts(dir));
    const content = readFileSync(join(dir, "HANDOFF.md"), "utf-8");
    expect(content).toContain("codebase brief");
  });
});
