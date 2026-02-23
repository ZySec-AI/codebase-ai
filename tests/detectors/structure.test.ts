import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { structureDetector } from "../../src/detectors/structure.js";
import { createMockContext } from "../helpers.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("structureDetector", () => {
  describe("entry point detection", () => {
    it("detects TypeScript entry point", async () => {
      const ctx = createMockContext({
        files: ["src/index.ts", "src/app.ts"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.entry_points).toContain("src/index.ts");
    });

    it("detects JavaScript entry point", async () => {
      const ctx = createMockContext({
        files: ["src/index.js"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.entry_points).toContain("src/index.js");
    });

    it("detects Next.js app router entry points", async () => {
      const ctx = createMockContext({
        files: ["src/app/layout.tsx", "src/app/page.tsx"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.entry_points).toContain("src/app/layout.tsx");
      expect(result.entry_points).toContain("src/app/page.tsx");
    });

    it("detects pages router entry point", async () => {
      const ctx = createMockContext({
        files: ["pages/_app.tsx"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.entry_points).toContain("pages/_app.tsx");
    });

    it("detects Python entry points", async () => {
      const ctx = createMockContext({
        files: ["main.py", "app.py", "manage.py"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.entry_points).toContain("main.py");
      expect(result.entry_points).toContain("app.py");
      expect(result.entry_points).toContain("manage.py");
    });

    it("detects Go entry point", async () => {
      const ctx = createMockContext({
        files: ["main.go", "cmd/main.go"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.entry_points).toContain("main.go");
      expect(result.entry_points).toContain("cmd/main.go");
    });

    it("detects Rust entry points", async () => {
      const ctx = createMockContext({
        files: ["src/main.rs", "src/lib.rs"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.entry_points).toContain("src/main.rs");
      expect(result.entry_points).toContain("src/lib.rs");
    });

    it("returns empty array when no entry points found", async () => {
      const ctx = createMockContext({
        files: ["README.md", "package.json"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.entry_points).toEqual([]);
    });
  });

  describe("build output detection", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `structure-test-${Date.now()}`);
    });

    afterEach(() => {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    });

    it("detects dist directory", async () => {
      mkdirSync(join(tempDir, "dist"), { recursive: true });
      const ctx = createMockContext({
        files: [],
        fileContents: {},
      });
      ctx.root = tempDir;
      const result = await structureDetector.detect(ctx);
      expect(result.build_output).toContain("dist");
    });

    it("detects build directory", async () => {
      mkdirSync(join(tempDir, "build"), { recursive: true });
      const ctx = createMockContext({
        files: [],
        fileContents: {},
      });
      ctx.root = tempDir;
      const result = await structureDetector.detect(ctx);
      expect(result.build_output).toContain("build");
    });

    it("detects Next.js .next directory", async () => {
      mkdirSync(join(tempDir, ".next"), { recursive: true });
      const ctx = createMockContext({
        files: [],
        fileContents: {},
      });
      ctx.root = tempDir;
      const result = await structureDetector.detect(ctx);
      expect(result.build_output).toContain(".next");
    });

    it("detects multiple build outputs", async () => {
      mkdirSync(join(tempDir, "dist"), { recursive: true });
      mkdirSync(join(tempDir, ".next"), { recursive: true });
      const ctx = createMockContext({
        files: [],
        fileContents: {},
      });
      ctx.root = tempDir;
      const result = await structureDetector.detect(ctx);
      expect(result.build_output).toContain("dist");
      expect(result.build_output).toContain(".next");
    });

    it("detects Rust target directory", async () => {
      mkdirSync(join(tempDir, "target"), { recursive: true });
      const ctx = createMockContext({
        files: [],
        fileContents: {},
      });
      ctx.root = tempDir;
      const result = await structureDetector.detect(ctx);
      expect(result.build_output).toContain("target");
    });

    it("returns empty array when no build outputs", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
      });
      ctx.root = tempDir;
      const result = await structureDetector.detect(ctx);
      expect(result.build_output).toEqual([]);
    });
  });

  describe("tree building", () => {
    it("builds tree with top-level files", async () => {
      const ctx = createMockContext({
        files: ["package.json", "README.md", "tsconfig.json", ".gitignore"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.tree["./"]).toContain("package.json");
      expect(result.tree["./"]).toContain("README.md");
      expect(result.tree["./"]).toContain("tsconfig.json");
      expect(result.tree["./"]).toContain(".gitignore");
    });

    it("builds tree with src directory structure", async () => {
      const ctx = createMockContext({
        files: [
          "src/index.ts",
          "src/app.ts",
          "src/utils/helpers.ts",
          "src/components/Button.tsx",
        ],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.tree["src/"]).toContain("app.ts");
      expect(result.tree["src/"]).toContain("index.ts");
      expect(result.tree["src/"]).toContain("components/");
      expect(result.tree["src/"]).toContain("utils/");
    });

    it("builds tree with multiple top-level directories", async () => {
      const ctx = createMockContext({
        files: [
          "src/index.ts",
          "tests/app.test.ts",
          "lib/utils.ts",
          "config/default.json",
        ],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.tree["src/"]).toContain("index.ts");
      expect(result.tree["tests/"]).toContain("app.test.ts");
      expect(result.tree["lib/"]).toContain("utils.ts");
      expect(result.tree["config/"]).toContain("default.json");
    });

    it("limits large file lists with truncation", async () => {
      const files = Array.from({ length: 20 }, (_, i) => `file${i}.ts`);
      const ctx = createMockContext({
        files,
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      // Top-level files are stored under "./" not ".//"
      expect(result.tree["./"]).toContain("... (20 files)");
    });

    it("limits directory children", async () => {
      const files = Array.from({ length: 25 }, (_, i) => `src/component${i}.tsx`);
      const ctx = createMockContext({
        files,
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.tree["src/"]).toContain("... (25 items)");
    });

    it("sorts entries alphabetically", async () => {
      const ctx = createMockContext({
        files: ["zebra.ts", "apple.ts", "banana.ts"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      const topFiles = result.tree["./"];
      expect(topFiles[0]).toBe("apple.ts");
      expect(topFiles[1]).toBe("banana.ts");
      expect(topFiles[2]).toBe("zebra.ts");
    });

    it("handles nested subdirectories", async () => {
      const ctx = createMockContext({
        files: [
          "src/features/auth/login.tsx",
          "src/features/auth/register.tsx",
          "src/features/dashboard/index.tsx",
        ],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.tree["src/"]).toContain("features/");
    });

    it("handles files with same name in different directories", async () => {
      const ctx = createMockContext({
        files: ["src/utils.ts", "lib/utils.ts", "test/utils.ts"],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(result.tree["src/"]).toContain("utils.ts");
      expect(result.tree["lib/"]).toContain("utils.ts");
      expect(result.tree["test/"]).toContain("utils.ts");
    });

    it("handles empty file list", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);
      expect(Object.keys(result.tree)).toHaveLength(0);
    });
  });

  describe("comprehensive project structure", () => {
    it("builds complete tree for typical TypeScript project", async () => {
      const ctx = createMockContext({
        files: [
          "package.json",
          "tsconfig.json",
          "README.md",
          ".gitignore",
          "src/index.ts",
          "src/app.ts",
          "src/utils/helpers.ts",
          "src/components/Button.tsx",
          "tests/app.test.ts",
        ],
        fileContents: {},
      });
      const result = await structureDetector.detect(ctx);

      expect(result.entry_points).toContain("src/index.ts");
      expect(result.tree["./"]).toContain("package.json");
      expect(result.tree["src/"]).toContain("index.ts");
      expect(result.tree["src/"]).toContain("components/");
      expect(result.tree["tests/"]).toContain("app.test.ts");
    });
  });
});
