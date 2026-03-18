import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { claudeIntegration } from "../../src/integrations/claude.js";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("claudeIntegration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `claude-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe("detect", () => {
    it("returns true when CLAUDE.md exists", () => {
      writeFileSync(join(tempDir, "CLAUDE.md"), "# Rules\n", "utf-8");
      expect(claudeIntegration.detect(tempDir)).toBe(true);
    });

    it("returns false when CLAUDE.md does not exist", () => {
      expect(claudeIntegration.detect(tempDir)).toBe(false);
    });

    it("returns false when only other files exist", () => {
      writeFileSync(join(tempDir, "README.md"), "# readme\n", "utf-8");
      expect(claudeIntegration.detect(tempDir)).toBe(false);
    });
  });

  describe("inject", () => {
    it("creates CLAUDE.md with codebase markers if it doesn't exist", () => {
      claudeIntegration.inject(tempDir);

      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("<!-- codebase:start -->");
      expect(content).toContain("<!-- codebase:end -->");
      expect(content).toContain("## Project Context");
      expect(content).toContain("npx codebase brief");
    });

    it("appends to existing CLAUDE.md", () => {
      writeFileSync(join(tempDir, "CLAUDE.md"), "# My Rules\n\nBe nice.\n", "utf-8");

      claudeIntegration.inject(tempDir);

      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("# My Rules");
      expect(content).toContain("Be nice.");
      expect(content).toContain("<!-- codebase:start -->");
    });

    it("replaces existing codebase block in CLAUDE.md", () => {
      const oldContent =
        "# Rules\n\n<!-- codebase:start -->\nOld instructions\n<!-- codebase:end -->\n";
      writeFileSync(join(tempDir, "CLAUDE.md"), oldContent, "utf-8");

      claudeIntegration.inject(tempDir);

      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("<!-- codebase:start -->");
      expect(content).toContain("<!-- codebase:end -->");
      expect(content).not.toContain("Old instructions");
      expect(content).toContain("npx codebase brief");
    });

    it("preserves content before codebase block", () => {
      const original = "# Project Rules\n\nRule 1: Be awesome\n\nRule 2: Have fun\n";
      writeFileSync(join(tempDir, "CLAUDE.md"), original, "utf-8");

      claudeIntegration.inject(tempDir);

      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("# Project Rules");
      expect(content).toContain("Rule 1: Be awesome");
      expect(content).toContain("Rule 2: Have fun");
    });
  });

  describe("remove", () => {
    it("removes codebase block from CLAUDE.md", () => {
      const content =
        "# Rules\n\n<!-- codebase:start -->\nAI instructions\n<!-- codebase:end -->\n## More Rules\n";
      writeFileSync(join(tempDir, "CLAUDE.md"), content, "utf-8");

      claudeIntegration.remove(tempDir);

      const result = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(result).toContain("# Rules");
      expect(result).toContain("## More Rules");
      expect(result).not.toContain("<!-- codebase:start -->");
      expect(result).not.toContain("AI instructions");
      expect(result).not.toContain("<!-- codebase:end -->");
    });

    it("does nothing if CLAUDE.md doesn't exist", () => {
      expect(() => claudeIntegration.remove(tempDir)).not.toThrow();
    });

    it("does nothing if no codebase block exists", () => {
      writeFileSync(join(tempDir, "CLAUDE.md"), "# Just rules\n", "utf-8");

      claudeIntegration.remove(tempDir);

      const result = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(result).toBe("# Just rules\n");
    });

    it("handles missing end marker gracefully", () => {
      const content = "# Rules\n\n<!-- codebase:start -->\nNo end marker";
      writeFileSync(join(tempDir, "CLAUDE.md"), content, "utf-8");

      // Should not crash - function requires both markers to remove
      expect(() => claudeIntegration.remove(tempDir)).not.toThrow();
    });
  });

  describe("integration workflow", () => {
    it("supports full detect-inject-remove cycle", () => {
      // Initially not detected
      expect(claudeIntegration.detect(tempDir)).toBe(false);

      // Inject creates the file
      claudeIntegration.inject(tempDir);
      expect(claudeIntegration.detect(tempDir)).toBe(true);

      // Verify content
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("<!-- codebase:start -->");

      // Remove cleans up
      claudeIntegration.remove(tempDir);
      const result = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(result).not.toContain("<!-- codebase:start -->");
    });

    it("can re-inject after removal", () => {
      // First injection
      claudeIntegration.inject(tempDir);
      claudeIntegration.remove(tempDir);

      // Re-inject should work
      claudeIntegration.inject(tempDir);
      const content = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(content).toContain("<!-- codebase:start -->");
      expect(content).toContain("npx codebase brief");
    });
  });
});
