import { describe, it, expect, vi } from "vitest";
import { parseArgs } from "../src/utils/args.js";

// Mock process.exit to prevent test termination
vi.spyOn(process, "exit").mockImplementation(() => {
  throw new Error("exit");
});

describe("parseArgs", () => {
  it("parses default command as scan", () => {
    const opts = parseArgs([]);
    expect(opts.command).toBe("scan");
  });

  it("parses brief command", () => {
    const opts = parseArgs(["brief"]);
    expect(opts.command).toBe("brief");
  });

  it("parses next command", () => {
    const opts = parseArgs(["next"]);
    expect(opts.command).toBe("next");
  });

  it("parses --path flag", () => {
    const opts = parseArgs(["--path", "/some/dir"]);
    expect(opts.path).toBe("/some/dir");
  });

  it("parses --mine flag into positionals for issue list", () => {
    const opts = parseArgs(["issue", "list", "--mine"]);
    expect(opts.command).toBe("issue");
    expect(opts.subcommand).toBe("list");
    expect(opts.positionals).toContain("mine");
  });

  it("parses issue create with title", () => {
    const opts = parseArgs(["issue", "create", "Fix login bug"]);
    expect(opts.command).toBe("issue");
    expect(opts.subcommand).toBe("create");
    expect(opts.positionals[0]).toBe("Fix login bug");
  });

  it("parses issue close with reason", () => {
    const opts = parseArgs(["issue", "close", "42", "--reason", "Fixed in PR #5"]);
    expect(opts.command).toBe("issue");
    expect(opts.subcommand).toBe("close");
    expect(opts.positionals[0]).toBe("42");
    expect(opts.reason).toBe("Fixed in PR #5");
  });

  it("parses --sync flag", () => {
    const opts = parseArgs(["--sync"]);
    expect(opts.sync).toBe(true);
  });

  it("parses --quiet flag", () => {
    const opts = parseArgs(["--quiet"]);
    expect(opts.quiet).toBe(true);
  });

  it("parses --depth with value", () => {
    const opts = parseArgs(["--depth", "8"]);
    expect(opts.depth).toBe(8);
  });

  it("parses query with path positional", () => {
    const opts = parseArgs(["query", "stack.languages"]);
    expect(opts.command).toBe("query");
    expect(opts.positionals[0]).toBe("stack.languages");
  });

  it("parses --force flag", () => {
    const opts = parseArgs(["query", "commands.test", "--force"]);
    expect(opts.command).toBe("query");
    expect(opts.force).toBe(true);
  });
});
