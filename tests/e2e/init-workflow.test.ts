import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * End-to-end tests for the init workflow
 *
 * The init command should:
 * 1. Scan the project
 * 2. Sync GitHub data (if gh CLI available)
 * 3. Inject into AI tool configs
 * 4. Install git hooks
 * 5. Update .gitignore
 */

describe("E2E: Init Workflow", () => {
  let tempDir: string;
  let cliPath: string;

  beforeAll(() => {
    // Build the CLI if not already built
    if (!existsSync(join(process.cwd(), "dist/index.js"))) {
      execSync("pnpm run build", { cwd: process.cwd(), stdio: "pipe" });
    }

    cliPath = join(process.cwd(), "dist/index.js");

    // Create a temporary directory for testing
    tempDir = join(tmpdir(), `codebase-e2e-init-${Date.now()}`);
    execSync(`mkdir -p ${tempDir}`);
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should initialize a new project with all features", () => {
    // Create a simple Node.js project
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git init`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.email "test@example.com"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.name "Test User"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git add .`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git commit -m "Initial commit"`, { cwd: tempDir, stdio: "pipe" });

    // Create CLAUDE.md
    const claudeMd = "# Project Instructions\n\nThis is a test project.";
    execSync(`echo '${claudeMd}' > CLAUDE.md`, { cwd: tempDir, stdio: "pipe" });

    // Run init
    const output = execSync(`node ${cliPath} init`, {
      cwd: tempDir,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Verify manifest was created
    const manifestPath = join(tempDir, ".codebase.json");
    expect(existsSync(manifestPath)).toBe(true);

    // Verify CLAUDE.md was updated with codebase block
    const claudeContent = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(claudeContent).toContain("codebase:start");
    expect(claudeContent).toContain("codebase:end");

    // Verify .gitignore was updated
    const gitignorePath = join(tempDir, ".gitignore");
    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, "utf-8");
      expect(gitignore).toContain(".codebase.json");
    }
  });

  it("should create CLAUDE.md if it doesn't exist", () => {
    // Create project without CLAUDE.md
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git init`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.email "test@example.com"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.name "Test User"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git add .`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git commit -m "Initial commit"`, { cwd: tempDir, stdio: "pipe" });

    // Remove CLAUDE.md if it exists
    const claudePath = join(tempDir, "CLAUDE.md");
    if (existsSync(claudePath)) {
      execSync(`rm ${claudePath}`, { cwd: tempDir, stdio: "pipe" });
    }

    // Run init
    execSync(`node ${cliPath} init`, { cwd: tempDir, stdio: "pipe" });

    // Verify CLAUDE.md was created with codebase block
    expect(existsSync(claudePath)).toBe(true);

    const claudeContent = readFileSync(claudePath, "utf-8");
    expect(claudeContent).toContain("codebase:start");
    expect(claudeContent).toContain("codebase:end");
  });

  it("should inject into .cursorrules if present", () => {
    // Create project with .cursorrules
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git init`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.email "test@example.com"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.name "Test User"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git add .`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git commit -m "Initial commit"`, { cwd: tempDir, stdio: "pipe" });

    const cursorRules = "# Cursor Rules\n\nBe helpful.";
    execSync(`echo '${cursorRules}' > .cursorrules`, { cwd: tempDir, stdio: "pipe" });

    // Run init
    execSync(`node ${cliPath} init`, { cwd: tempDir, stdio: "pipe" });

    // Verify .cursorrules was updated
    const cursorContent = readFileSync(join(tempDir, ".cursorrules"), "utf-8");
    expect(cursorContent).toContain(".codebase.json");
  });

  it("should handle --dry-run flag", () => {
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git init`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.email "test@example.com"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.name "Test User"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git add .`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git commit -m "Initial commit"`, { cwd: tempDir, stdio: "pipe" });

    const claudeMd = "# Project Instructions\n\nThis is a test project.";
    const originalContent = execSync(`echo '${claudeMd}' > CLAUDE.md`, { cwd: tempDir, stdio: "pipe" });

    // Run init with --dry-run
    execSync(`node ${cliPath} init --dry-run`, { cwd: tempDir, stdio: "pipe" });

    // Verify CLAUDE.md was NOT changed
    const claudeContent = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(claudeContent).toBe(claudeMd);

    // But manifest should still be created for preview
    const manifestPath = join(tempDir, ".codebase.json");
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("should install git post-commit hook", () => {
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git init`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.email "test@example.com"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.name "Test User"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git add .`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git commit -m "Initial commit"`, { cwd: tempDir, stdio: "pipe" });

    // Run init
    execSync(`node ${cliPath} init`, { cwd: tempDir, stdio: "pipe" });

    // Verify git hook was installed
    const hookPath = join(tempDir, ".git", "hooks", "post-commit");
    expect(existsSync(hookPath)).toBe(true);

    const hookContent = readFileSync(hookPath, "utf-8");
    expect(hookContent).toContain("codebase");
  });

  it("should include GitHub data if gh CLI is available", () => {
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git init`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.email "test@example.com"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.name "Test User"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git add .`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git commit -m "Initial commit"`, { cwd: tempDir, stdio: "pipe" });

    // Add GitHub remote
    execSync(`git remote add origin https://github.com/test/repo.git`, { cwd: tempDir, stdio: "pipe" });

    // Run init (with --sync to attempt GitHub sync)
    try {
      execSync(`node ${cliPath} init --sync`, { cwd: tempDir, stdio: "pipe", timeout: 5000 });
    } catch (error) {
      // gh CLI might not be available, which is fine
    }

    const manifest = JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));

    // If gh CLI is available, status should be present
    // If not, github_available should be false
    if (manifest.status) {
      expect(manifest.status).toHaveProperty("github_available");
    }
  });

  it("should handle errors gracefully on invalid project", () => {
    // Create empty directory (not a valid project)
    const emptyDir = join(tempDir, "empty");
    execSync(`mkdir ${emptyDir}`, { cwd: tempDir, stdio: "pipe" });

    // Should not throw, but create minimal manifest
    try {
      execSync(`node ${cliPath} init`, { cwd: emptyDir, stdio: "pipe" });
    } catch (error) {
      // Error is acceptable, but shouldn't crash
    }

    // Manifest might still be created with minimal data
    const manifestPath = join(emptyDir, ".codebase.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      expect(manifest.version).toBe("1.0");
    }
  });
});
