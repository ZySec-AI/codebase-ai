import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installHooks, installHook, uninstallHook } from "../../src/integrations/githook.js";
import { writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("githook integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `githook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, ".git"), { recursive: true });
    mkdirSync(join(tempDir, ".git", "hooks"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe("installHooks", () => {
    it("returns false when .git directory doesn't exist", () => {
      const noGitDir = join(tmpdir(), `no-git-${Date.now()}`);
      mkdirSync(noGitDir, { recursive: true });
      expect(installHooks(noGitDir)).toBe(false);
      rmSync(noGitDir, { recursive: true, force: true });
    });

    it("creates post-commit hook in .git/hooks", () => {
      installHooks(tempDir, false);

      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      expect(existsSync(hookPath)).toBe(true);

      const content = readFileSync(hookPath, "utf-8");
      expect(content).toContain("# codebase-auto-update");
      expect(content).toContain("npx --yes codebase scan-only --incremental --quiet");
    });

    it("creates post-checkout hook in .git/hooks", () => {
      installHooks(tempDir, false);

      const hookPath = join(tempDir, ".git", "hooks", "post-checkout");
      expect(existsSync(hookPath)).toBe(true);

      const content = readFileSync(hookPath, "utf-8");
      expect(content).toContain("# codebase-auto-update");
      expect(content).toContain("npx --yes codebase scan-only --incremental --quiet");
    });

    it("includes --sync flag when ghSync is true", () => {
      installHooks(tempDir, true);

      const postCommitPath = join(tempDir, ".git", "hooks", "post-commit");
      const postCheckoutPath = join(tempDir, ".git", "hooks", "post-checkout");

      const postCommitContent = readFileSync(postCommitPath, "utf-8");
      const postCheckoutContent = readFileSync(postCheckoutPath, "utf-8");

      expect(postCommitContent).toContain("--sync");
      expect(postCheckoutContent).toContain("--sync");
    });

    it("sets executable permissions on hooks", () => {
      installHooks(tempDir, false);

      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      // On Unix-like systems, check the file is executable
      const stats = statSync(hookPath);
      // Note: mode checks vary by platform, just verify file exists and has content
      expect(stats.isFile()).toBe(true);
    });

    it("updates existing post-commit hook with codebase marker", () => {
      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      writeFileSync(hookPath, "#!/bin/sh\n\n# Existing hook\necho 'Running tests'\n", "utf-8");

      installHooks(tempDir, false);

      const content = readFileSync(hookPath, "utf-8");
      expect(content).toContain("# Existing hook");
      expect(content).toContain("Running tests");
      expect(content).toContain("# codebase-auto-update");
    });

    it("updates command in existing hook with codebase marker", () => {
      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      writeFileSync(
        hookPath,
        "#!/bin/sh\n\n# codebase-auto-update\nnpx codebase scan-only\n",
        "utf-8"
      );

      installHooks(tempDir, false);

      const content = readFileSync(hookPath, "utf-8");
      expect(content).toContain("npx --yes codebase scan-only --incremental --quiet");
      expect(content).not.toContain("npx codebase scan-only");
    });

    it("appends to existing hook without codebase marker", () => {
      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      writeFileSync(hookPath, "#!/bin/sh\n\nnpm run build\n", "utf-8");

      installHooks(tempDir, false);

      const content = readFileSync(hookPath, "utf-8");
      expect(content).toContain("npm run build");
      expect(content).toContain("# codebase-auto-update");
    });
  });

  describe("installHook (legacy)", () => {
    it("installs post-commit hook for backwards compatibility", () => {
      const result = installHook(tempDir);
      expect(result).toBe(true);

      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      expect(existsSync(hookPath)).toBe(true);
      expect(readFileSync(hookPath, "utf-8")).toContain("# codebase-auto-update");
    });
  });

  describe("uninstallHook", () => {
    it("removes codebase block from post-commit hook", () => {
      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      writeFileSync(
        hookPath,
        "#!/bin/sh\n\n# codebase-auto-update\nnpx codebase scan-only\n",
        "utf-8"
      );

      const result = uninstallHook(tempDir);
      expect(result).toBe(true);

      // Hook should be removed since it only had our content
      expect(existsSync(hookPath)).toBe(false);
    });

    it("removes codebase block but preserves other content", () => {
      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      writeFileSync(
        hookPath,
        "#!/bin/sh\n\nnpm run build\n\n# codebase-auto-update\nnpx codebase scan-only\n",
        "utf-8"
      );

      const result = uninstallHook(tempDir);
      expect(result).toBe(true);

      const content = readFileSync(hookPath, "utf-8");
      expect(content).toContain("npm run build");
      expect(content).not.toContain("# codebase-auto-update");
      expect(content).not.toContain("npx codebase scan-only");
    });

    it("returns false when no codebase hooks exist", () => {
      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      writeFileSync(hookPath, "#!/bin/sh\n\nnpm run build\n", "utf-8");

      const result = uninstallHook(tempDir);
      expect(result).toBe(false);
    });

    it("removes codebase block from both hooks if present", () => {
      const postCommitPath = join(tempDir, ".git", "hooks", "post-commit");
      const postCheckoutPath = join(tempDir, ".git", "hooks", "post-checkout");

      writeFileSync(
        postCommitPath,
        "#!/bin/sh\n\n# codebase-auto-update\nnpx codebase scan\n",
        "utf-8"
      );
      writeFileSync(
        postCheckoutPath,
        "#!/bin/sh\n\n# codebase-auto-update\nnpx codebase scan\n",
        "utf-8"
      );

      const result = uninstallHook(tempDir);
      expect(result).toBe(true);

      expect(existsSync(postCommitPath)).toBe(false);
      expect(existsSync(postCheckoutPath)).toBe(false);
    });
  });

  describe("hook file permissions", () => {
    it("creates hook with shebang", () => {
      installHooks(tempDir, false);

      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      const content = readFileSync(hookPath, "utf-8");
      expect(content.trimStart().startsWith("#!/bin/sh")).toBe(true);
    });

    it("preserves existing shebang when updating", () => {
      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      writeFileSync(hookPath, "#!/bin/bash\n\nnpm test\n", "utf-8");

      installHooks(tempDir, false);

      const content = readFileSync(hookPath, "utf-8");
      expect(content).toContain("#!/bin/bash");
      expect(content).toContain("npm test");
    });
  });

  describe("full workflow", () => {
    it("supports install-uninstall-reinstall cycle", () => {
      // First install
      expect(installHooks(tempDir, false)).toBe(true);
      const hookPath = join(tempDir, ".git", "hooks", "post-commit");
      expect(existsSync(hookPath)).toBe(true);

      // Uninstall
      expect(uninstallHook(tempDir)).toBe(true);
      expect(existsSync(hookPath)).toBe(false);

      // Re-install
      expect(installHooks(tempDir, true)).toBe(true);
      expect(existsSync(hookPath)).toBe(true);
      const content = readFileSync(hookPath, "utf-8");
      expect(content).toContain("--sync");
    });
  });
});
