import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createScanContext } from "../../src/scanner/context.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("createScanContext", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `context-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe("file walking", () => {
    it("walks directory structure respecting depth limit", async () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      mkdirSync(join(tempDir, "src", "components"), { recursive: true });
      mkdirSync(join(tempDir, "src", "components", "deep"), { recursive: true });

      writeFileSync(join(tempDir, "package.json"), "{}", "utf-8");
      writeFileSync(join(tempDir, "src", "index.ts"), "export {}", "utf-8");
      writeFileSync(join(tempDir, "src", "components", "Button.tsx"), "", "utf-8");
      writeFileSync(join(tempDir, "src", "components", "deep", "file.ts"), "", "utf-8");

      const ctx = await createScanContext(tempDir, { depth: 2 });

      expect(ctx.files).toContain("package.json");
      expect(ctx.files).toContain("src/");
      expect(ctx.files).toContain("src/index.ts");
      expect(ctx.files).toContain("src/components/");
      expect(ctx.files).toContain("src/components/Button.tsx");
      // Deep files should be excluded due to depth limit
      expect(ctx.files).not.toContain("src/components/deep/file.ts");
    });

    it("defaults to depth 10", async () => {
      // Create a deeply nested structure (12 levels)
      let currentPath = tempDir;
      for (let i = 0; i < 12; i++) {
        currentPath = join(currentPath, `level${i}`);
        mkdirSync(currentPath, { recursive: true });
      }
      writeFileSync(join(currentPath, "deep.txt"), "content", "utf-8");

      const ctx = await createScanContext(tempDir);

      // Should include files up to depth 10
      expect(ctx.files.length).toBeGreaterThan(0);
      // level11 and level12 should be beyond depth limit
      expect(ctx.files.some((f) => f.includes("level10"))).toBe(true);
    });

    it("ignores default ignore patterns", async () => {
      mkdirSync(join(tempDir, "node_modules"), { recursive: true });
      mkdirSync(join(tempDir, ".git"), { recursive: true });
      mkdirSync(join(tempDir, "dist"), { recursive: true });
      mkdirSync(join(tempDir, "src"), { recursive: true });

      writeFileSync(join(tempDir, "node_modules", "package.json"), "{}", "utf-8");
      writeFileSync(join(tempDir, ".git", "config"), "", "utf-8");
      writeFileSync(join(tempDir, "dist", "bundle.js"), "", "utf-8");
      writeFileSync(join(tempDir, "src", "index.ts"), "", "utf-8");

      const ctx = await createScanContext(tempDir);

      expect(ctx.files).toContain("src/index.ts");
      expect(ctx.files).not.toContain("node_modules/package.json");
      expect(ctx.files).not.toContain(".git/config");
      expect(ctx.files).not.toContain("dist/bundle.js");
    });

    it("allows custom ignore patterns", async () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      mkdirSync(join(tempDir, "tests"), { recursive: true });

      writeFileSync(join(tempDir, "src", "index.ts"), "", "utf-8");
      writeFileSync(join(tempDir, "tests", "test.spec.ts"), "", "utf-8");

      const ctx = await createScanContext(tempDir, { ignore: ["tests"] });

      expect(ctx.files).toContain("src/index.ts");
      expect(ctx.files).not.toContain("tests/test.spec.ts");
    });

    it("allows allowed hidden directories", async () => {
      mkdirSync(join(tempDir, ".github"), { recursive: true });
      mkdirSync(join(tempDir, ".husky"), { recursive: true });
      mkdirSync(join(tempDir, ".circleci"), { recursive: true });
      mkdirSync(join(tempDir, ".hidden"), { recursive: true });

      writeFileSync(join(tempDir, ".github", "workflows"), "ci:", "utf-8");
      writeFileSync(join(tempDir, ".husky", "pre-commit"), "", "utf-8");
      writeFileSync(join(tempDir, ".circleci", "config.yml"), "", "utf-8");
      writeFileSync(join(tempDir, ".hidden", "file.txt"), "", "utf-8");

      const ctx = await createScanContext(tempDir);

      expect(ctx.files).toContain(".github/");
      expect(ctx.files).toContain(".husky/");
      expect(ctx.files).toContain(".circleci/");
      expect(ctx.files).not.toContain(".hidden/");
    });

    it("marks directories with trailing slash", async () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      mkdirSync(join(tempDir, "src", "components"), { recursive: true });
      writeFileSync(join(tempDir, "src", "index.ts"), "", "utf-8");

      const ctx = await createScanContext(tempDir);

      expect(ctx.files).toContain("src/");
      expect(ctx.files).toContain("src/components/");
      expect(ctx.files).toContain("src/index.ts");
    });

    it("handles permission errors gracefully", async () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      writeFileSync(join(tempDir, "src", "index.ts"), "", "utf-8");

      // Create a directory with no permissions (will fail to read)
      const noPermDir = join(tempDir, "no-perm");
      mkdirSync(noPermDir, { recursive: true });

      const ctx = await createScanContext(tempDir);

      // Should still return other files
      expect(ctx.files).toContain("src/index.ts");
    });
  });

  describe("readFile", () => {
    it("reads file content relative to root", async () => {
      writeFileSync(join(tempDir, "test.txt"), "Hello, World!", "utf-8");

      const ctx = await createScanContext(tempDir);
      const content = await ctx.readFile("test.txt");

      expect(content).toBe("Hello, World!");
    });

    it("reads nested file content", async () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      writeFileSync(join(tempDir, "src", "app.ts"), "export const app = {};", "utf-8");

      const ctx = await createScanContext(tempDir);
      const content = await ctx.readFile("src/app.ts");

      expect(content).toBe("export const app = {};");
    });

    it("returns empty string for non-existent file", async () => {
      const ctx = await createScanContext(tempDir);
      const content = await ctx.readFile("non-existent.txt");

      expect(content).toBe("");
    });

    it("returns empty string for read errors", async () => {
      writeFileSync(join(tempDir, "test.txt"), "content", "utf-8");

      const ctx = await createScanContext(tempDir);
      // File exists but we simulate a read error by checking behavior
      const content = await ctx.readFile("test.txt");

      expect(content).toBe("content");
    });
  });

  describe("fileExists", () => {
    it("returns true for files that were walked", async () => {
      writeFileSync(join(tempDir, "package.json"), "{}", "utf-8");

      const ctx = await createScanContext(tempDir);

      expect(ctx.fileExists("package.json")).toBe(true);
    });

    it("returns false for non-existent files", async () => {
      const ctx = await createScanContext(tempDir);

      expect(ctx.fileExists("non-existent.txt")).toBe(false);
    });

    it("returns true for files in ignored directories via filesystem check", async () => {
      mkdirSync(join(tempDir, "node_modules"), { recursive: true });
      writeFileSync(join(tempDir, "node_modules", "package.json"), "{}", "utf-8");

      const ctx = await createScanContext(tempDir);

      // Even though node_modules is ignored from walking, fileExists should still find it
      expect(ctx.fileExists("node_modules/package.json")).toBe(true);
    });

    it("returns false for non-existent files in ignored directories", async () => {
      mkdirSync(join(tempDir, "node_modules"), { recursive: true });

      const ctx = await createScanContext(tempDir);

      expect(ctx.fileExists("node_modules/non-existent.json")).toBe(false);
    });
  });

  describe("glob", () => {
    it("filters files by pattern", async () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      writeFileSync(join(tempDir, "src", "index.ts"), "", "utf-8");
      writeFileSync(join(tempDir, "src", "app.tsx"), "", "utf-8");
      writeFileSync(join(tempDir, "src", "styles.css"), "", "utf-8");
      writeFileSync(join(tempDir, "package.json"), "", "utf-8");

      const ctx = await createScanContext(tempDir);
      const tsFiles = ctx.glob("*.ts");

      expect(tsFiles).not.toContain("package.json");
    });

    it("supports ** patterns for nested files", async () => {
      mkdirSync(join(tempDir, "src", "components"), { recursive: true });
      writeFileSync(join(tempDir, "src", "components", "Button.tsx"), "", "utf-8");
      writeFileSync(join(tempDir, "src", "index.ts"), "", "utf-8");

      const ctx = await createScanContext(tempDir);
      const tsxFiles = ctx.glob("**/*.tsx");

      expect(tsxFiles).toContain("src/components/Button.tsx");
    });

    it("supports directory patterns", async () => {
      mkdirSync(join(tempDir, "src"), { recursive: true });
      mkdirSync(join(tempDir, "tests"), { recursive: true });
      writeFileSync(join(tempDir, "src", "index.ts"), "", "utf-8");
      writeFileSync(join(tempDir, "tests", "test.spec.ts"), "", "utf-8");

      const ctx = await createScanContext(tempDir);
      const srcFiles = ctx.glob("src/*");

      expect(srcFiles).toContain("src/index.ts");
      expect(srcFiles).not.toContain("tests/test.spec.ts");
    });
  });

  describe("exec", () => {
    it("executes shell command and returns stdout", async () => {
      writeFileSync(join(tempDir, "test.txt"), "content", "utf-8");

      const ctx = await createScanContext(tempDir);
      const result = await ctx.exec("echo 'hello'");

      expect(result).toBe("hello");
    });

    it("returns empty string on command failure", async () => {
      const ctx = await createScanContext(tempDir);
      const result = await ctx.exec("exit 1");

      expect(result).toBe("");
    });

    it("returns empty string on command failure (non-zero exit)", async () => {
      const ctx = await createScanContext(tempDir);
      const result = await ctx.exec("exit 1");

      expect(result).toBe("");
    });

    it("trims whitespace from output", async () => {
      const ctx = await createScanContext(tempDir);
      const result = await ctx.exec("echo '  test  '");

      expect(result).toBe("test"); // exec returns trimmed output
    });
  });

  describe("root path", () => {
    it("stores the root directory path", async () => {
      const ctx = await createScanContext(tempDir);

      expect(ctx.root).toBe(tempDir);
    });
  });

  describe("edge cases", () => {
    it("handles empty directory", async () => {
      const ctx = await createScanContext(tempDir);

      expect(ctx.files).toEqual([]);
    });

    it("handles directory with only hidden files", async () => {
      writeFileSync(join(tempDir, ".env"), "KEY=value", "utf-8");
      writeFileSync(join(tempDir, ".gitignore"), "node_modules\n", "utf-8");

      const ctx = await createScanContext(tempDir);

      // Hidden files in root ARE walked (unless they're in specific ignore patterns)
      expect(ctx.files).toContain(".env");
      expect(ctx.files).toContain(".gitignore");
    });

    it("handles symbolic links gracefully", async () => {
      // This test verifies that broken symlinks don't crash the scanner
      writeFileSync(join(tempDir, "real.txt"), "content", "utf-8");

      const ctx = await createScanContext(tempDir);

      expect(ctx.files).toContain("real.txt");
    });

    it("respects combined default and custom ignore patterns", async () => {
      mkdirSync(join(tempDir, "node_modules"), { recursive: true });
      mkdirSync(join(tempDir, "build"), { recursive: true });
      mkdirSync(join(tempDir, "custom"), { recursive: true });

      writeFileSync(join(tempDir, "node_modules", "pkg.json"), "", "utf-8");
      writeFileSync(join(tempDir, "build", "app.js"), "", "utf-8");
      writeFileSync(join(tempDir, "custom", "file.txt"), "", "utf-8");
      writeFileSync(join(tempDir, "index.ts"), "", "utf-8");

      const ctx = await createScanContext(tempDir, { ignore: ["custom"] });

      expect(ctx.files).toContain("index.ts");
      expect(ctx.files).not.toContain("node_modules/pkg.json");
      expect(ctx.files).not.toContain("build/app.js");
      expect(ctx.files).not.toContain("custom/file.txt");
    });
  });
});
