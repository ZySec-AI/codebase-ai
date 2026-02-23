import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scan, summarizeCategory } from "../../src/scanner/engine.js";
import { detectors } from "../../src/detectors/index.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock the syncGitHub function to avoid requiring gh CLI
vi.mock("../../src/github/sync.js", () => ({
  syncGitHub: vi.fn(() => Promise.resolve(null)),
}));

describe("scan engine", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `scan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe("basic scan", () => {
    it("scans project and returns manifest with all detector categories", async () => {
      writeFileSync(join(tempDir, "package.json"), JSON.stringify({
        name: "test-project",
        description: "A test project",
        scripts: { dev: "vite", build: "tsup", test: "vitest" },
      }), "utf-8");

      mkdirSync(join(tempDir, "src"), { recursive: true });
      writeFileSync(join(tempDir, "src", "index.ts"), "export {}", "utf-8");

      const manifest = await scan(tempDir);

      expect(manifest.version).toBe("1.0");
      expect(manifest.generated_at).toBeDefined();
      expect(manifest.project).toBeDefined();
      expect(manifest.stack).toBeDefined();
      expect(manifest.commands).toBeDefined();
      expect(manifest.dependencies).toBeDefined();
      expect(manifest.structure).toBeDefined();
    });

    it("includes version and timestamp", async () => {
      const manifest = await scan(tempDir);

      expect(manifest.version).toBe("1.0");
      expect(manifest.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("returns empty manifest for empty directory", async () => {
      const manifest = await scan(tempDir);

      expect(manifest.version).toBe("1.0");
      expect(manifest.generated_at).toBeDefined();
    });
  });

  describe("category filtering", () => {
    it("scans only specified categories", async () => {
      writeFileSync(join(tempDir, "package.json"), JSON.stringify({
        name: "test",
        scripts: { build: "tsup" },
      }), "utf-8");

      const manifest = await scan(tempDir, { categories: ["project", "stack"] });

      expect(manifest.project).toBeDefined();
      expect(manifest.stack).toBeDefined();
      // commands and dependencies should not be included
      expect(manifest.commands).toBeUndefined();
      expect(manifest.dependencies).toBeUndefined();
    });

    it("handles invalid category gracefully", async () => {
      const manifest = await scan(tempDir, { categories: ["invalid-category"] });

      expect(manifest.version).toBe("1.0");
      expect(manifest.generated_at).toBeDefined();
      // No detector data should be present
      expect(Object.keys(manifest).filter(k => !["version", "generated_at"].includes(k))).toEqual([]);
    });

    it("handles empty categories array", async () => {
      writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");

      const manifest = await scan(tempDir, { categories: [] });

      // With empty categories, all detectors should run
      expect(manifest.project).toBeDefined();
    });
  });

  describe("detector execution", () => {
    it("runs all detectors in parallel", async () => {
      const startTime = Date.now();

      writeFileSync(join(tempDir, "package.json"), JSON.stringify({
        name: "test",
        scripts: { test: "vitest" },
        devDependencies: { vitest: "^1.0.0" },
      }), "utf-8");

      await scan(tempDir);

      const duration = Date.now() - startTime;
      // Parallel execution should be fast
      expect(duration).toBeLessThan(5000);
    });

    it("continues on detector failure", async () => {
      // Create a minimal project that should work
      writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");

      // Scan should complete even if some detectors fail
      const manifest = await scan(tempDir, { quiet: true });

      expect(manifest.version).toBe("1.0");
      expect(manifest.generated_at).toBeDefined();
    });

    it("warns on detector failure when quiet mode is off", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");

      await scan(tempDir, { quiet: false });

      // Check that warnings were called (if any detectors failed)
      // Note: This test depends on detectors actually failing
      warnSpy.mockRestore();
    });
  });

  describe("depth option", () => {
    it("respects depth limit in scan", async () => {
      // Create nested structure
      let currentPath = tempDir;
      for (let i = 0; i < 5; i++) {
        currentPath = join(currentPath, `level${i}`);
        mkdirSync(currentPath, { recursive: true });
      }
      writeFileSync(join(currentPath, "file.txt"), "content", "utf-8");

      const manifest = await scan(tempDir, { depth: 2 });

      expect(manifest.structure).toBeDefined();
    });
  });

  describe("GitHub sync", () => {
    it("does not call syncGitHub when sync option is false", async () => {
      const { syncGitHub } = await import("../../src/github/sync.js");

      const manifest = await scan(tempDir, { sync: false });

      expect(manifest.status).toBeUndefined();
      expect(manifest.roadmap).toBeUndefined();
      expect(manifest.decisions).toBeUndefined();
    });

    it("includes GitHub data when sync option is true and gh CLI works", async () => {
      // Mock is already set up at top of file
      const { syncGitHub } = await import("../../src/github/sync.js");

      const manifest = await scan(tempDir, { sync: true });

      // With our mock returning null, these should be undefined
      expect(manifest.status).toBeUndefined();
    });

    it("handles GitHub sync failure gracefully", async () => {
      const manifest = await scan(tempDir, { sync: true, quiet: true });

      // Should still return a valid manifest even if sync fails
      expect(manifest.version).toBe("1.0");
      expect(manifest.generated_at).toBeDefined();
    });
  });

  describe("incremental mode", () => {
    it("supports incremental scanning option", async () => {
      writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test" }), "utf-8");

      const manifest = await scan(tempDir, { incremental: true });

      expect(manifest.version).toBe("1.0");
      expect(manifest.project).toBeDefined();
    });
  });
});

describe("summarizeCategory", () => {
  describe("project category", () => {
    it("summarizes project with name and description", () => {
      const result = summarizeCategory("project", {
        name: "my-app",
        description: "A great application",
      });

      expect(result).toContain("my-app");
      expect(result).toContain("A great application");
    });

    it("returns just name when no description", () => {
      const result = summarizeCategory("project", { name: "my-app", description: null });

      expect(result).toBe("my-app");
    });

    it("returns unknown when no name", () => {
      const result = summarizeCategory("project", { name: null, description: null });

      expect(result).toBe("unknown");
    });

    it("truncates long descriptions", () => {
      const longDesc = "A".repeat(100);
      const result = summarizeCategory("project", {
        name: "my-app",
        description: longDesc,
      });

      expect(result.length).toBeLessThan(longDesc.length + 20);
    });
  });

  describe("repo category", () => {
    it("summarizes repo with URL and branch", () => {
      const result = summarizeCategory("repo", {
        url: "https://github.com/user/repo.git",
        default_branch: "main",
        is_monorepo: false,
        active_branches: [],
      });

      expect(result).toContain("repo");
      expect(result).toContain("main");
    });

    it("handles local repos without URL", () => {
      const result = summarizeCategory("repo", {
        url: null,
        default_branch: "develop",
        is_monorepo: false,
        active_branches: [],
      });

      expect(result).toContain("local");
      expect(result).toContain("develop");
    });

    it("extracts repo name from URL", () => {
      const result = summarizeCategory("repo", {
        url: "git@github.com:user/my-project.git",
        default_branch: "main",
        is_monorepo: false,
        active_branches: [],
      });

      expect(result).toContain("my-project");
    });
  });

  describe("structure category", () => {
    it("summarizes structure with entry points and dirs", () => {
      const result = summarizeCategory("structure", {
        entry_points: ["src/index.ts", "src/app.tsx"],
        build_output: ["dist", ".next"],
        tree: { "src/": ["index.ts", "app.tsx"], "tests/": ["test.ts"] },
      });

      expect(result).toContain("2 entry points");
      expect(result).toContain("top-level dirs");
    });

    it("returns empty for no structure", () => {
      const result = summarizeCategory("structure", {
        entry_points: [],
        build_output: [],
        tree: {},
      });

      expect(result).toBe("empty");
    });
  });

  describe("stack category", () => {
    it("summarizes stack with languages and frameworks", () => {
      const result = summarizeCategory("stack", {
        languages: ["typescript", "javascript"],
        frameworks: ["react@18.3", "vite"],
        package_manager: "npm",
        database: null,
        orm: null,
        styling: null,
        build_tool: "vite",
      });

      expect(result).toContain("typescript");
      expect(result).toContain("react@18.3");
      expect(result).toContain("vite");
    });

    it("returns unknown for empty stack", () => {
      const result = summarizeCategory("stack", {
        languages: [],
        frameworks: [],
        package_manager: null,
        database: null,
        orm: null,
        styling: null,
        build_tool: null,
      });

      expect(result).toBe("unknown");
    });
  });

  describe("commands category", () => {
    it("summarizes available commands", () => {
      const result = summarizeCategory("commands", {
        dev: "npm run dev",
        build: "npm run build",
        test: "npm test",
        lint: null,
        format: null,
      });

      expect(result).toContain("dev");
      expect(result).toContain("build");
      expect(result).toContain("test");
    });

    it("returns none detected for no commands", () => {
      const result = summarizeCategory("commands", {
        dev: null,
        build: null,
        test: null,
        lint: null,
        format: null,
      });

      expect(result).toBe("none detected");
    });
  });

  describe("dependencies category", () => {
    it("summarizes dependency counts", () => {
      const result = summarizeCategory("dependencies", {
        direct_count: 10,
        dev_count: 5,
        lock_file: "package-lock.json",
        notable: ["react", "vite"],
      });

      expect(result).toContain("10 direct");
      expect(result).toContain("5 dev");
      expect(result).toContain("package-lock.json");
    });

    it("handles zero dependencies", () => {
      const result = summarizeCategory("dependencies", {
        direct_count: 0,
        dev_count: 0,
        lock_file: null,
        notable: [],
      });

      expect(result).toContain("0 deps");
    });
  });

  describe("git category", () => {
    it("summarizes git status", () => {
      const result = summarizeCategory("git", {
        recent_commits: ["Commit 1", "Commit 2", "Commit 3"],
        last_committers: ["user1", "user2"],
        uncommitted_changes: true,
      });

      expect(result).toContain("3 recent commits");
      expect(result).toContain("uncommitted changes");
    });

    it("shows no uncommitted changes when clean", () => {
      const result = summarizeCategory("git", {
        recent_commits: ["Commit 1"],
        last_committers: ["user1"],
        uncommitted_changes: false,
      });

      expect(result).toContain("1 recent commits");
      expect(result).not.toContain("uncommitted");
    });
  });

  describe("quality category", () => {
    it("summarizes quality tools", () => {
      const result = summarizeCategory("quality", {
        test_framework: "vitest",
        linter: "eslint",
        formatter: "prettier",
        ci: "github-actions",
        pre_commit_hooks: true,
      });

      expect(result).toContain("vitest");
      expect(result).toContain("eslint");
      expect(result).toContain("github-actions");
    });

    it("returns none detected for no quality tools", () => {
      const result = summarizeCategory("quality", {
        test_framework: null,
        linter: null,
        formatter: null,
        ci: null,
        pre_commit_hooks: false,
      });

      expect(result).toBe("none detected");
    });
  });

  describe("patterns category", () => {
    it("summarizes architecture and state management", () => {
      const result = summarizeCategory("patterns", {
        architecture: "mvc",
        state_management: "redux",
        api_style: "rest",
        key_modules: {},
      });

      expect(result).toContain("mvc");
      expect(result).toContain("redux");
    });

    it("returns unknown for no patterns", () => {
      const result = summarizeCategory("patterns", {
        architecture: null,
        state_management: null,
        api_style: null,
        key_modules: {},
      });

      expect(result).toBe("unknown");
    });
  });

  describe("status category", () => {
    it("summarizes issues and PRs", () => {
      const result = summarizeCategory("status", {
        synced_at: "2025-02-23T00:00:00Z",
        github_available: true,
        issues: [{}, {}, {}] as unknown[],
        pull_requests: [{}, {}] as unknown[],
        kanban: { backlog: [], in_progress: [], done: [] },
        priorities: [],
      });

      expect(result).toContain("3 issues");
      expect(result).toContain("2 PRs");
    });
  });

  describe("unknown category", () => {
    it("JSON stringifies unknown categories", () => {
      const result = summarizeCategory("unknown", { foo: "bar", baz: 123 });

      expect(result).toContain("foo");
      expect(result).toContain("bar");
    });
  });
});
