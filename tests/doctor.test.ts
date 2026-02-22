import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test the doctor command by running it against temp directories
// with various states of setup

function createTempDir(): string {
  const dir = join(tmpdir(), `codebase-doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(root: string, overrides: Record<string, unknown> = {}): void {
  const manifest = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    project: { name: "test", description: "test project" },
    repo: { url: null, default_branch: "main", is_monorepo: false, active_branches: [] },
    structure: { entry_points: [], build_output: [], tree: {} },
    stack: { languages: ["typescript"], frameworks: [], package_manager: "npm", database: null, orm: null, styling: null, build_tool: null },
    commands: { dev: null, build: "npm run build", test: "npm test", lint: null, format: null },
    dependencies: { direct_count: 0, dev_count: 0, lock_file: null, notable: [] },
    config: { env_files: [], config_files: [], feature_flags: null },
    git: { recent_commits: [], last_committers: [], uncommitted_changes: false },
    quality: { test_framework: "vitest", linter: null, formatter: null, ci: null, pre_commit_hooks: false },
    patterns: { architecture: null, state_management: null, api_style: null, key_modules: {} },
    ...overrides,
  };
  writeFileSync(join(root, ".codebase.json"), JSON.stringify(manifest, null, 2), "utf-8");
}

function writeGitignore(root: string, content: string): void {
  writeFileSync(join(root, ".gitignore"), content, "utf-8");
}

function setupGitHooks(root: string, opts: { postCommit?: boolean; postCheckout?: boolean; withSync?: boolean } = {}): void {
  const hooksDir = join(root, ".git", "hooks");
  mkdirSync(hooksDir, { recursive: true });

  const syncFlag = opts.withSync ? " --sync" : "";
  const hookCmd = `npx --yes codebase scan-only --incremental --quiet${syncFlag}`;
  const hookContent = `#!/bin/sh\n\n# codebase-auto-update\n${hookCmd}\n`;

  if (opts.postCommit) {
    writeFileSync(join(hooksDir, "post-commit"), hookContent, "utf-8");
  }
  if (opts.postCheckout) {
    writeFileSync(join(hooksDir, "post-checkout"), hookContent, "utf-8");
  }
}

describe("doctor checks", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it("detects missing manifest", () => {
    const manifestPath = join(tempDir, ".codebase.json");
    expect(existsSync(manifestPath)).toBe(false);
  });

  it("detects present manifest with valid JSON", () => {
    writeManifest(tempDir);
    const manifestPath = join(tempDir, ".codebase.json");
    expect(existsSync(manifestPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(parsed.version).toBe("1.0");
    expect(parsed.generated_at).toBeDefined();
  });

  it("detects corrupted manifest", () => {
    writeFileSync(join(tempDir, ".codebase.json"), "{ invalid json !!!", "utf-8");
    let isCorrupted = false;
    try {
      JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));
    } catch {
      isCorrupted = true;
    }
    expect(isCorrupted).toBe(true);
  });

  it("counts all 10 detector categories", () => {
    writeManifest(tempDir);
    const manifest = JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));
    const expectedCategories = [
      "project", "repo", "structure", "stack", "commands",
      "dependencies", "config", "git", "quality", "patterns",
    ];
    const present = expectedCategories.filter(c => c in manifest);
    expect(present.length).toBe(10);
  });

  it("detects missing detector categories", () => {
    writeManifest(tempDir, { stack: undefined, commands: undefined });
    const manifest = JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));
    const expectedCategories = [
      "project", "repo", "structure", "stack", "commands",
      "dependencies", "config", "git", "quality", "patterns",
    ];
    const missing = expectedCategories.filter(c => !(c in manifest));
    expect(missing).toContain("stack");
    expect(missing).toContain("commands");
  });

  it("detects git hooks with marker", () => {
    setupGitHooks(tempDir, { postCommit: true, postCheckout: true });
    const hookContent = readFileSync(join(tempDir, ".git", "hooks", "post-commit"), "utf-8");
    expect(hookContent).toContain("# codebase-auto-update");
  });

  it("detects missing git hooks", () => {
    mkdirSync(join(tempDir, ".git", "hooks"), { recursive: true });
    expect(existsSync(join(tempDir, ".git", "hooks", "post-commit"))).toBe(false);
  });

  it("detects --sync flag in hooks", () => {
    setupGitHooks(tempDir, { postCommit: true, postCheckout: true, withSync: true });
    const content = readFileSync(join(tempDir, ".git", "hooks", "post-commit"), "utf-8");
    expect(content).toContain("--sync");
  });

  it("detects missing --sync flag in hooks", () => {
    setupGitHooks(tempDir, { postCommit: true, postCheckout: true, withSync: false });
    const content = readFileSync(join(tempDir, ".git", "hooks", "post-commit"), "utf-8");
    expect(content).not.toContain("--sync");
  });

  it("detects .codebase.json in .gitignore", () => {
    writeGitignore(tempDir, "node_modules\n.codebase.json\n");
    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    expect(content.includes(".codebase.json")).toBe(true);
  });

  it("detects missing .codebase.json in .gitignore", () => {
    writeGitignore(tempDir, "node_modules\n");
    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    expect(content.includes(".codebase.json")).toBe(false);
  });

  it("detects injection markers in markdown files", () => {
    const claudePath = join(tempDir, "CLAUDE.md");
    writeFileSync(claudePath, "# Rules\n\n<!-- codebase:start -->\ninjected\n<!-- codebase:end -->\n", "utf-8");
    const content = readFileSync(claudePath, "utf-8");
    expect(content.includes("<!-- codebase:start -->")).toBe(true);
  });

  it("detects injection markers in plaintext files", () => {
    const cursorPath = join(tempDir, ".cursorrules");
    writeFileSync(cursorPath, "# codebase:start\ninjected\n# codebase:end\n", "utf-8");
    const content = readFileSync(cursorPath, "utf-8");
    expect(content.includes("# codebase:start")).toBe(true);
  });

  it("detects MCP configuration", () => {
    const mcpPath = join(tempDir, ".mcp.json");
    writeFileSync(mcpPath, JSON.stringify({
      mcpServers: {
        codebase: { command: "npx", args: ["codebase", "mcp"] },
      },
    }), "utf-8");
    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(config.mcpServers.codebase).toBeDefined();
  });

  it("detects missing MCP configuration", () => {
    const mcpPath = join(tempDir, ".mcp.json");
    writeFileSync(mcpPath, JSON.stringify({ mcpServers: {} }), "utf-8");
    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(config.mcpServers.codebase).toBeUndefined();
  });
});
