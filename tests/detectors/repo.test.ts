import { describe, it, expect } from "vitest";
import { repoDetector } from "../../src/detectors/repo.js";
import { createMockContext } from "../helpers.js";

describe("repoDetector", () => {
  describe("remote URL detection", () => {
    it("detects HTTPS remote URL", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git remote get-url": "https://github.com/user/repo.git",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.url).toBe("https://github.com/user/repo.git");
    });

    it("detects SSH remote URL", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git remote get-url": "git@github.com:user/repo.git",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.url).toBe("git@github.com:user/repo.git");
    });

    it("returns null when no remote", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git remote get-url": "",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.url).toBeNull();
    });
  });

  describe("default branch detection", () => {
    it("detects main branch from symbolic ref", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git symbolic-ref": "refs/remotes/origin/main",
          "git branch --list": "",
          "git branch --show-current": "feature-branch",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.default_branch).toBe("main");
    });

    it("detects master branch from symbolic ref", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git symbolic-ref": "refs/remotes/origin/master",
          "git branch --list": "",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.default_branch).toBe("master");
    });

    it("falls back to checking main/master branch existence", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git symbolic-ref": "",
          "git branch --list": "main",
          "git branch --show-current": "",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.default_branch).toBe("main");
    });

    it("prefers main over master when both exist", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git symbolic-ref": "",
          "git branch --list": "  main\n  master",
          "git branch --show-current": "",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.default_branch).toBe("main");
    });

    it("falls back to current branch as last resort", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git symbolic-ref": "",
          "git branch --list": "",
          "git branch --show-current": "develop",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.default_branch).toBe("develop");
    });

    it("returns null when git commands fail", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {},
      });
      const result = await repoDetector.detect(ctx);
      expect(result.default_branch).toBeNull();
    });
  });

  describe("active branches detection", () => {
    it("returns list of recent branches", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git branch -a": "main\nfeature-1\nfeature-2\n",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.active_branches).toEqual(["main", "feature-1", "feature-2"]);
    });

    it("removes origin/ prefix", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git branch -a": "origin/main\norigin/feature-1\nfeature-2\n",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.active_branches).toEqual(["main", "feature-1", "feature-2"]);
    });

    it("deduplicates branches", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git branch -a": "main\norigin/main\nfeature/main\n",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.active_branches).toEqual(["main", "feature/main"]);
    });

    it("filters out HEAD reference", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git branch -a": "main\nHEAD\nfeature-1\n",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.active_branches).not.toContain("HEAD");
    });

    it("limits to 10 branches", async () => {
      const branches = Array.from({ length: 15 }, (_, i) => `branch-${i}`);
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git branch -a": branches.join("\n"),
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.active_branches.length).toBe(10);
    });

    it("returns empty array when no branches", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git branch -a": "",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.active_branches).toEqual([]);
    });
  });

  describe("monorepo detection", () => {
    it("detects npm workspaces from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            name: "monorepo",
            workspaces: ["packages/*"],
          }),
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.is_monorepo).toBe(true);
      expect(result.workspace_manager).toBe("npm/yarn");
    });

    it("detects pnpm workspace", async () => {
      const ctx = createMockContext({
        files: ["pnpm-workspace.yaml"],
        fileContents: {},
      });
      const result = await repoDetector.detect(ctx);
      expect(result.is_monorepo).toBe(true);
      expect(result.workspace_manager).toBe("pnpm");
    });

    it("detects turborepo", async () => {
      const ctx = createMockContext({
        files: ["turbo.json"],
        fileContents: {},
      });
      const result = await repoDetector.detect(ctx);
      expect(result.is_monorepo).toBe(true);
      expect(result.workspace_manager).toBe("turborepo");
    });

    it("detects nx monorepo", async () => {
      const ctx = createMockContext({
        files: ["nx.json"],
        fileContents: {},
      });
      const result = await repoDetector.detect(ctx);
      expect(result.is_monorepo).toBe(true);
      expect(result.workspace_manager).toBe("nx");
    });

    it("detects lerna monorepo", async () => {
      const ctx = createMockContext({
        files: ["lerna.json"],
        fileContents: {},
      });
      const result = await repoDetector.detect(ctx);
      expect(result.is_monorepo).toBe(true);
      expect(result.workspace_manager).toBe("lerna");
    });

    it("detects rush monorepo", async () => {
      const ctx = createMockContext({
        files: ["rush.json"],
        fileContents: {},
      });
      const result = await repoDetector.detect(ctx);
      expect(result.is_monorepo).toBe(true);
      expect(result.workspace_manager).toBe("rush");
    });

    it("returns false for non-monorepo", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({ name: "single-package" }),
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.is_monorepo).toBe(false);
      expect(result.workspace_manager).toBeNull();
    });

    it("prioritizes turbo over pnpm when both present", async () => {
      const ctx = createMockContext({
        files: ["turbo.json", "pnpm-workspace.yaml"],
        fileContents: {},
      });
      const result = await repoDetector.detect(ctx);
      expect(result.workspace_manager).toBe("turborepo");
    });
  });

  describe("edge cases", () => {
    it("handles malformed package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": "{ invalid json",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.is_monorepo).toBe(false);
    });

    it("handles empty package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": "{}",
        },
      });
      const result = await repoDetector.detect(ctx);
      expect(result.is_monorepo).toBe(false);
    });
  });
});
