import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { updateGitignore } from "../../src/integrations/gitignore.js";
import { writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("gitignore integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `gitignore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe("updateGitignore", () => {
    it("creates .gitignore if it doesn't exist", () => {
      updateGitignore(tempDir);

      const gitignorePath = join(tempDir, ".gitignore");
      expect(existsSync(gitignorePath)).toBe(true);

      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain(".codebase.json");
      expect(content).toContain(".codebase.cache.json");
      expect(content).toContain("# AI context manifest");
    });

    it("appends to existing .gitignore", () => {
      const gitignorePath = join(tempDir, ".gitignore");
      writeFileSync(gitignorePath, "node_modules\n.DS_Store\n", "utf-8");

      updateGitignore(tempDir);

      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("node_modules");
      expect(content).toContain(".DS_Store");
      expect(content).toContain(".codebase.json");
      expect(content).toContain(".codebase.cache.json");
    });

    it("doesn't add duplicate entries", () => {
      const gitignorePath = join(tempDir, ".gitignore");
      writeFileSync(
        gitignorePath,
        "node_modules\n# AI context manifest\n.codebase.json\n.codebase.cache.json\n",
        "utf-8"
      );

      updateGitignore(tempDir);

      const content = readFileSync(gitignorePath, "utf-8");
      const count = (content.match(/\.codebase\.json/g) || []).length;
      expect(count).toBe(1);
    });

    it("preserves existing content", () => {
      const gitignorePath = join(tempDir, ".gitignore");
      const original = "# Dependencies\nnode_modules\n\n# Build\ndist\nbuild\n";
      writeFileSync(gitignorePath, original, "utf-8");

      updateGitignore(tempDir);

      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("# Dependencies");
      expect(content).toContain("node_modules");
      expect(content).toContain("# Build");
      expect(content).toContain("dist");
    });

    it("handles .gitignore with trailing whitespace", () => {
      const gitignorePath = join(tempDir, ".gitignore");
      writeFileSync(gitignorePath, "node_modules\n   \n", "utf-8");

      updateGitignore(tempDir);

      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("node_modules");
      expect(content).toContain(".codebase.json");
    });

    it("handles empty .gitignore", () => {
      const gitignorePath = join(tempDir, ".gitignore");
      writeFileSync(gitignorePath, "", "utf-8");

      updateGitignore(tempDir);

      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("# AI context manifest");
      expect(content).toContain(".codebase.json");
      expect(content).toContain(".codebase.cache.json");
    });

    it("handles .gitignore with only comments", () => {
      const gitignorePath = join(tempDir, ".gitignore");
      writeFileSync(gitignorePath, "# Ignore files\n# More comments\n", "utf-8");

      updateGitignore(tempDir);

      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("# Ignore files");
      expect(content).toContain("# More comments");
      expect(content).toContain(".codebase.json");
    });

    it("adds section header for clarity", () => {
      updateGitignore(tempDir);

      const gitignorePath = join(tempDir, ".gitignore");
      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("# AI context manifest");
    });

    it("handles .gitignore without trailing newline", () => {
      const gitignorePath = join(tempDir, ".gitignore");
      writeFileSync(gitignorePath, "node_modules", "utf-8");

      updateGitignore(tempDir);

      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain("node_modules");
      expect(content).toContain(".codebase.json");
    });

    it("adds both .codebase.json and .codebase.cache.json", () => {
      updateGitignore(tempDir);

      const gitignorePath = join(tempDir, ".gitignore");
      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain(".codebase.json");
      expect(content).toContain(".codebase.cache.json");
    });

    it("handles .codebase.json already present but .codebase.cache.json missing", () => {
      const gitignorePath = join(tempDir, ".gitignore");
      writeFileSync(gitignorePath, ".codebase.json\n", "utf-8");

      updateGitignore(tempDir);

      const content = readFileSync(gitignorePath, "utf-8");
      // Should not duplicate .codebase.json
      const codebaseCount = (content.match(/\.codebase\.json/g) || []).length;
      expect(codebaseCount).toBe(1);
    });
  });

  describe("idempotency", () => {
    it("can be called multiple times safely", () => {
      updateGitignore(tempDir);
      updateGitignore(tempDir);
      updateGitignore(tempDir);

      const gitignorePath = join(tempDir, ".gitignore");
      const content = readFileSync(gitignorePath, "utf-8");

      const codebaseCount = (content.match(/\.codebase\.json/g) || []).length;
      expect(codebaseCount).toBe(1);
    });

    it("doesn't add duplicate headers", () => {
      updateGitignore(tempDir);
      updateGitignore(tempDir);

      const gitignorePath = join(tempDir, ".gitignore");
      const content = readFileSync(gitignorePath, "utf-8");

      const headerCount = (content.match(/# AI context manifest/g) || []).length;
      expect(headerCount).toBe(1);
    });
  });
});
