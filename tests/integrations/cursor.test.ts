import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cursorIntegration } from "../../src/integrations/cursor.js";
import { writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cursorIntegration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cursor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe("detect", () => {
    it("returns true when .cursorrules exists", () => {
      writeFileSync(join(tempDir, ".cursorrules"), "# rules\n", "utf-8");
      expect(cursorIntegration.detect(tempDir)).toBe(true);
    });

    it("returns false when .cursorrules does not exist", () => {
      expect(cursorIntegration.detect(tempDir)).toBe(false);
    });

    it("returns false when only other files exist", () => {
      writeFileSync(join(tempDir, "README.md"), "# readme\n", "utf-8");
      expect(cursorIntegration.detect(tempDir)).toBe(false);
    });
  });

  describe("inject", () => {
    it("creates .cursorrules with codebase markers if it doesn't exist", () => {
      cursorIntegration.inject(tempDir);

      const content = readFileSync(join(tempDir, ".cursorrules"), "utf-8");
      expect(content).toContain("# codebase:start");
      expect(content).toContain("# codebase:end");
      expect(content).toContain("# Project Context");
      expect(content).toContain("npx codebase brief");
    });

    it("appends to existing .cursorrules", () => {
      writeFileSync(join(tempDir, ".cursorrules"), "# My rules\n\nBe nice.\n", "utf-8");

      cursorIntegration.inject(tempDir);

      const content = readFileSync(join(tempDir, ".cursorrules"), "utf-8");
      expect(content).toContain("# My rules");
      expect(content).toContain("Be nice.");
      expect(content).toContain("# codebase:start");
    });

    it("replaces existing codebase block in .cursorrules", () => {
      const oldContent = "# Rules\n# codebase:start\nOld instructions\n# codebase:end\n";
      writeFileSync(join(tempDir, ".cursorrules"), oldContent, "utf-8");

      cursorIntegration.inject(tempDir);

      const content = readFileSync(join(tempDir, ".cursorrules"), "utf-8");
      expect(content).toContain("# codebase:start");
      expect(content).toContain("# codebase:end");
      expect(content).not.toContain("Old instructions");
      expect(content).toContain("npx codebase brief");
    });

    it("preserves content before codebase block", () => {
      const original = "# Project Rules\n\nRule 1: Be awesome\n\nRule 2: Have fun\n";
      writeFileSync(join(tempDir, ".cursorrules"), original, "utf-8");

      cursorIntegration.inject(tempDir);

      const content = readFileSync(join(tempDir, ".cursorrules"), "utf-8");
      expect(content).toContain("# Project Rules");
      expect(content).toContain("Rule 1: Be awesome");
      expect(content).toContain("Rule 2: Have fun");
    });
  });

  describe("remove", () => {
    it("removes codebase block from .cursorrules", () => {
      const content = "# Rules\n# codebase:start\nAI instructions\n# codebase:end\n## More Rules\n";
      writeFileSync(join(tempDir, ".cursorrules"), content, "utf-8");

      cursorIntegration.remove(tempDir);

      const result = readFileSync(join(tempDir, ".cursorrules"), "utf-8");
      expect(result).toContain("# Rules");
      expect(result).toContain("## More Rules");
      expect(result).not.toContain("# codebase:start");
      expect(result).not.toContain("AI instructions");
      expect(result).not.toContain("# codebase:end");
    });

    it("does nothing if .cursorrules doesn't exist", () => {
      expect(() => cursorIntegration.remove(tempDir)).not.toThrow();
    });

    it("does nothing if no codebase block exists", () => {
      writeFileSync(join(tempDir, ".cursorrules"), "# Just rules\n", "utf-8");

      cursorIntegration.remove(tempDir);

      const result = readFileSync(join(tempDir, ".cursorrules"), "utf-8");
      expect(result).toBe("# Just rules\n");
    });
  });

  describe("integration workflow", () => {
    it("supports full detect-inject-remove cycle", () => {
      expect(cursorIntegration.detect(tempDir)).toBe(false);

      cursorIntegration.inject(tempDir);
      expect(cursorIntegration.detect(tempDir)).toBe(true);

      const content = readFileSync(join(tempDir, ".cursorrules"), "utf-8");
      expect(content).toContain("# codebase:start");

      cursorIntegration.remove(tempDir);
      const result = readFileSync(join(tempDir, ".cursorrules"), "utf-8");
      expect(result).not.toContain("# codebase:start");
    });
  });
});
