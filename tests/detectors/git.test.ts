import { describe, it, expect } from "vitest";
import { gitDetector } from "../../src/detectors/git.js";
import { createMockContext } from "../helpers.js";

describe("gitDetector", () => {
  describe("recent commits detection", () => {
    it("detects recent commit messages", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git log": "Add feature A\nFix bug B\nRefactor code C\nUpdate docs\nAdd tests",
        },
      });
      const result = await gitDetector.detect(ctx);
      expect(result.recent_commits).toEqual([
        "Add feature A",
        "Fix bug B",
        "Refactor code C",
        "Update docs",
        "Add tests",
      ]);
    });

    it("handles empty git log output", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git log": "",
        },
      });
      const result = await gitDetector.detect(ctx);
      expect(result.recent_commits).toEqual([]);
    });

    it("filters blank lines from commit messages", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git log": "Commit 1\n\nCommit 2\n\n\nCommit 3",
        },
      });
      const result = await gitDetector.detect(ctx);
      expect(result.recent_commits).toEqual(["Commit 1", "Commit 2", "Commit 3"]);
    });

    it("handles git command failure", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {},
      });
      const result = await gitDetector.detect(ctx);
      expect(result.recent_commits).toEqual([]);
    });
  });

  describe("last committers detection", () => {
    it("detects top committers with commit counts", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git shortlog": "   42\tJohn Doe\n   28\tJane Smith\n   15\tBob Johnson",
        },
      });
      const result = await gitDetector.detect(ctx);
      expect(result.last_committers).toEqual(["John Doe", "Jane Smith", "Bob Johnson"]);
    });

    it("handles empty shortlog output", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git shortlog": "",
        },
      });
      const result = await gitDetector.detect(ctx);
      expect(result.last_committers).toEqual([]);
    });

    it("handles irregular whitespace in shortlog", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git shortlog": "  10  User One\n\t5  User Two\n     3  User Three",
        },
      });
      const result = await gitDetector.detect(ctx);
      expect(result.last_committers).toEqual(["User One", "User Two", "User Three"]);
    });

    it("handles git command failure", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {},
      });
      const result = await gitDetector.detect(ctx);
      expect(result.last_committers).toEqual([]);
    });
  });

  describe("uncommitted changes detection", () => {
    it("detects no uncommitted changes", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git status": "",
        },
      });
      const result = await gitDetector.detect(ctx);
      expect(result.uncommitted_changes).toBe(false);
    });

    it("detects uncommitted changes", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git status": " M src/index.ts\n?? new-file.ts",
        },
      });
      const result = await gitDetector.detect(ctx);
      expect(result.uncommitted_changes).toBe(true);
    });

    it("detects staged changes as uncommitted", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git status": "M  src/index.ts",
        },
      });
      const result = await gitDetector.detect(ctx);
      expect(result.uncommitted_changes).toBe(true);
    });

    it("handles git command failure", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {},
      });
      const result = await gitDetector.detect(ctx);
      expect(result.uncommitted_changes).toBe(false);
    });
  });

  describe("comprehensive git detection", () => {
    it("combines all git information", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git log": "Initial commit\nAdd auth\nFix bug\n",
          "git shortlog": "  15\tAlice\n  10\tBob\n  5\tCharlie\n",
          "git status": "M src/app.ts",
        },
      });
      const result = await gitDetector.detect(ctx);

      expect(result.recent_commits).toEqual(["Initial commit", "Add auth", "Fix bug"]);
      expect(result.last_committers).toEqual(["Alice", "Bob", "Charlie"]);
      expect(result.uncommitted_changes).toBe(true);
    });

    it("handles empty git repository", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git log": "",
          "git shortlog": "",
          "git status": "",
        },
      });
      const result = await gitDetector.detect(ctx);

      expect(result.recent_commits).toEqual([]);
      expect(result.last_committers).toEqual([]);
      expect(result.uncommitted_changes).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles commits only without committers", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git log": "Commit 1\nCommit 2",
          "git shortlog": "",
          "git status": "",
        },
      });
      const result = await gitDetector.detect(ctx);

      expect(result.recent_commits).toEqual(["Commit 1", "Commit 2"]);
      expect(result.last_committers).toEqual([]);
      expect(result.uncommitted_changes).toBe(false);
    });

    it("handles whitespace-only git output", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git log": "\n\n",
          "git shortlog": "\n",
        },
      });
      const result = await gitDetector.detect(ctx);

      expect(result.recent_commits).toEqual([]);
      expect(result.last_committers).toEqual([]);
    });
  });
});
