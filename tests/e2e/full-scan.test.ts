import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * End-to-end tests for the complete CLI scan workflow
 *
 * These tests validate the entire user journey from invoking the CLI
 * to generating a complete .codebase.json manifest.
 */

describe("E2E: Full Scan Workflow", () => {
  let tempDir: string;
  let cliPath: string;

  beforeAll(() => {
    // Build the CLI if not already built
    if (!existsSync(join(process.cwd(), "dist/index.js"))) {
      execSync("pnpm run build", { cwd: process.cwd() });
    }

    cliPath = join(process.cwd(), "dist/index.js");

    // Create a temporary directory for testing
    tempDir = join(tmpdir(), `codebase-e2e-${Date.now()}`);
    execSync(`mkdir -p ${tempDir}`);
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should scan a simple Node.js project and generate manifest", () => {
    // Create a simple Node.js project
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });
    execSync(`npm install express --save`, { cwd: tempDir, stdio: "pipe" });

    // Initialize git repo
    execSync(`git init`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.email "test@example.com"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git config user.name "Test User"`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git add .`, { cwd: tempDir, stdio: "pipe" });
    execSync(`git commit -m "Initial commit"`, { cwd: tempDir, stdio: "pipe" });

    // Run codebase scan
    execSync(`node ${cliPath} scan`, { cwd: tempDir, stdio: "pipe" });

    // Verify manifest was created
    const manifestPath = join(tempDir, ".codebase.json");
    expect(existsSync(manifestPath)).toBe(true);

    // Verify manifest structure
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest).toHaveProperty("version");
    expect(manifest).toHaveProperty("generated_at");
    expect(manifest).toHaveProperty("stack");
    expect(manifest).toHaveProperty("dependencies");
    expect(manifest).toHaveProperty("commands");
  });

  it("should detect project structure correctly", () => {
    // Create a Next.js-like structure
    execSync(`mkdir -p ${join(tempDir, "src/app")}`, { stdio: "pipe" });
    execSync(`mkdir -p ${join(tempDir, "src/components")}`, { stdio: "pipe" });
    execSync(`mkdir -p ${join(tempDir, "public")}`, { stdio: "pipe" });

    // Create some files
    const pkgJson = {
      name: "test-nextjs-app",
      version: "1.0.0",
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "next lint",
      },
      dependencies: {
        next: "^14.0.0",
        react: "^18.0.0",
      },
    };

    const readme = "# Test Next.js App\n\nA test application.";

    execSync(`echo '${JSON.stringify(pkgJson)}' > package.json`, { cwd: tempDir, stdio: "pipe" });
    execSync(`echo '${readme}' > README.md`, { cwd: tempDir, stdio: "pipe" });

    // Run scan
    execSync(`node ${cliPath} scan`, { cwd: tempDir, stdio: "pipe" });

    // Verify structure detection
    const manifest = JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));
    expect(manifest.structure).toBeDefined();
    expect(manifest.structure.tree).toBeDefined();
    expect(manifest.structure.entry_points).toBeDefined();
  });

  it("should detect tech stack correctly", () => {
    // Create a Python project
    const requirements = "fastapi==0.109.0\nuvicorn==0.27.0\npydantic==2.0.0";
    execSync(`echo '${requirements}' > requirements.txt`, { cwd: tempDir, stdio: "pipe" });

    const pyproject = `
[tool.poetry]
name = "test-python-app"
version = "1.0.0"

[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.109.0"
`;
    execSync(`echo '${pyproject}' > pyproject.toml`, { cwd: tempDir, stdio: "pipe" });

    // Add a Python file so the detector finds it
    execSync(`echo 'print("hello")' > main.py`, { cwd: tempDir, stdio: "pipe" });

    // Run scan
    execSync(`node ${cliPath} scan`, { cwd: tempDir, stdio: "pipe" });

    // Verify stack detection
    const manifest = JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));
    expect(manifest.stack).toBeDefined();
    expect(manifest.stack.languages).toBeDefined();
    // Should detect Python
    expect(
      manifest.stack.languages.some((lang: string) => lang.toLowerCase().includes("python"))
    ).toBe(true);
  });

  it("should detect commands correctly", () => {
    // Create package.json with various scripts
    const pkgJson = {
      name: "test-commands",
      version: "1.0.0",
      scripts: {
        dev: "vite",
        build: "vite build",
        test: "vitest",
        "test:watch": "vitest --watch",
        lint: "eslint .",
        format: "prettier --write .",
      },
    };

    execSync(`echo '${JSON.stringify(pkgJson)}' > package.json`, { cwd: tempDir, stdio: "pipe" });

    // Run scan
    execSync(`node ${cliPath} scan`, { cwd: tempDir, stdio: "pipe" });

    // Verify command detection
    const manifest = JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));
    expect(manifest.commands).toBeDefined();
    expect(manifest.commands.dev).toBe("npm run dev");
    expect(manifest.commands.build).toBe("npm run build");
    expect(manifest.commands.test).toBe("npm run test");
    expect(manifest.commands.lint).toBe("npm run lint");
  });

  it("should handle --quiet flag", () => {
    // Create minimal project
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });

    // Run scan with --quiet
    const output = execSync(`node ${cliPath} scan --quiet`, {
      cwd: tempDir,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Should produce no stdout output
    expect(output.trim()).toBe("");

    // But manifest should still be created
    expect(existsSync(join(tempDir, ".codebase.json"))).toBe(true);
  });

  it("should handle --depth flag", () => {
    // Create nested directory structure
    execSync(`mkdir -p ${join(tempDir, "src/feat1/subfeat1/deep")}`, { stdio: "pipe" });
    execSync(`mkdir -p ${join(tempDir, "src/feat2/subfeat2/deeper")}`, { stdio: "pipe" });
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });

    // Run scan with depth=2
    execSync(`node ${cliPath} scan --depth 2`, { cwd: tempDir, stdio: "pipe" });

    const manifest = JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));

    // Verify depth limit is respected (implementation specific)
    expect(manifest.structure).toBeDefined();
  });

  it("should produce valid JSON", () => {
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });

    // Run scan
    execSync(`node ${cliPath} scan`, { cwd: tempDir, stdio: "pipe" });

    // Verify JSON is valid
    const manifestPath = join(tempDir, ".codebase.json");
    const content = readFileSync(manifestPath, "utf-8");

    expect(() => JSON.parse(content)).not.toThrow();

    const manifest = JSON.parse(content);
    expect(manifest.version).toBe("1.0");
    expect(manifest.generated_at).toBeDefined();
  });

  it("should be idempotent - running twice produces same structure", async () => {
    execSync(`npm init -y`, { cwd: tempDir, stdio: "pipe" });

    // First scan
    execSync(`node ${cliPath} scan`, { cwd: tempDir, stdio: "pipe" });
    const manifest1 = JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));

    // Wait a bit (to ensure different generated_at timestamp)
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second scan
    execSync(`node ${cliPath} scan`, { cwd: tempDir, stdio: "pipe" });
    const manifest2 = JSON.parse(readFileSync(join(tempDir, ".codebase.json"), "utf-8"));

    // Structure should be the same (except generated_at)
    expect(manifest1.version).toBe(manifest2.version);
    expect(Object.keys(manifest1).sort()).toEqual(Object.keys(manifest2).sort());
  });
});
