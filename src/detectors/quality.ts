import type { Detector, ScanContext } from "../types.js";

export const qualityDetector: Detector = {
  name: "quality",
  category: "quality",

  async detect(ctx: ScanContext) {
    const [test_framework, linter, formatter] = await Promise.all([
      detectTestFramework(ctx),
      detectLinter(ctx),
      detectFormatter(ctx),
    ]);

    return {
      test_framework,
      linter,
      formatter,
      ci: detectCI(ctx),
      pre_commit_hooks: detectPreCommitHooks(ctx),
    };
  },
};

async function detectTestFramework(ctx: ScanContext): Promise<string | null> {
  // Config-file detection
  if (ctx.glob("vitest.config.*").length > 0) return "vitest";
  if (ctx.glob("jest.config.*").length > 0) return "jest";
  if (ctx.fileExists(".mocharc.yml") || ctx.fileExists(".mocharc.json")) return "mocha";
  if (ctx.glob("playwright.config.*").length > 0) return "playwright";
  if (ctx.glob("cypress.config.*").length > 0) return "cypress";

  // Fallback: check package.json devDependencies and scripts
  const pkgContent = await ctx.readFile("package.json");
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts = pkg.scripts || {};
      const testScript = scripts.test || "";

      if (allDeps["vitest"] || testScript.includes("vitest")) return "vitest";
      if (allDeps["jest"] || testScript.includes("jest")) return "jest";
      if (allDeps["mocha"] || testScript.includes("mocha")) return "mocha";
      if (allDeps["@playwright/test"] || testScript.includes("playwright")) return "playwright";
      if (allDeps["cypress"]) return "cypress";
      if (allDeps["ava"]) return "ava";
      if (allDeps["tap"]) return "tap";
    } catch {}
  }

  // Python
  if (ctx.fileExists("pytest.ini") || ctx.fileExists("pyproject.toml")) {
    if (ctx.files.some(f => f.includes("test_") || f.includes("_test.py"))) return "pytest";
  }
  // Go
  if (ctx.files.some(f => f.endsWith("_test.go"))) return "go test";
  // Rust
  if (ctx.files.some(f => f.includes("/tests/") || f.startsWith("tests/") || f.match(/mod\s+tests/))) return "cargo test";

  return null;
}

async function detectLinter(ctx: ScanContext): Promise<string | null> {
  // Config-file detection
  if (ctx.fileExists("eslint.config.js") || ctx.fileExists("eslint.config.mjs") || ctx.fileExists("eslint.config.ts")) return "eslint";
  if (ctx.glob(".eslintrc*").length > 0) return "eslint";
  if (ctx.fileExists("biome.json") || ctx.fileExists("biome.jsonc")) return "biome";
  if (ctx.fileExists("ruff.toml") || ctx.fileExists(".ruff.toml")) return "ruff";
  if (ctx.fileExists(".pylintrc")) return "pylint";
  if (ctx.fileExists(".flake8")) return "flake8";
  if (ctx.fileExists(".golangci.yml") || ctx.fileExists(".golangci.yaml")) return "golangci-lint";
  if (ctx.fileExists("clippy.toml")) return "clippy";

  // Fallback: check package.json
  const pkgContent = await ctx.readFile("package.json");
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts = pkg.scripts || {};
      const lintScript = scripts.lint || "";

      if (allDeps["eslint"] || lintScript.includes("eslint")) return "eslint";
      if (allDeps["@biomejs/biome"] || lintScript.includes("biome")) return "biome";
      if (allDeps["oxlint"] || lintScript.includes("oxlint")) return "oxlint";
      if (allDeps["standard"]) return "standard";
      if (allDeps["xo"]) return "xo";
    } catch {}
  }

  return null;
}

async function detectFormatter(ctx: ScanContext): Promise<string | null> {
  if (ctx.glob(".prettierrc*").length > 0 || ctx.fileExists("prettier.config.js") || ctx.fileExists("prettier.config.mjs")) return "prettier";
  if (ctx.fileExists("biome.json") || ctx.fileExists("biome.jsonc")) return "biome";
  if (ctx.fileExists("ruff.toml") || ctx.fileExists(".ruff.toml")) return "ruff";
  if (ctx.fileExists("rustfmt.toml") || ctx.fileExists(".rustfmt.toml")) return "rustfmt";
  if (ctx.fileExists("dprint.json")) return "dprint";
  if (ctx.fileExists(".editorconfig")) return "editorconfig";

  // Fallback: check package.json
  const pkgContent = await ctx.readFile("package.json");
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts = pkg.scripts || {};
      const fmtScript = (scripts.format || "") + (scripts.fmt || "");

      if (allDeps["prettier"] || fmtScript.includes("prettier")) return "prettier";
      if (allDeps["@biomejs/biome"] || fmtScript.includes("biome")) return "biome";
      if (allDeps["dprint"]) return "dprint";
    } catch {}
  }

  return null;
}

function detectCI(ctx: ScanContext): string | null {
  if (ctx.files.some(f => f.startsWith(".github/workflows/"))) return "github-actions";
  if (ctx.fileExists(".gitlab-ci.yml")) return "gitlab-ci";
  if (ctx.fileExists("Jenkinsfile")) return "jenkins";
  if (ctx.files.some(f => f.startsWith(".circleci/"))) return "circleci";
  if (ctx.fileExists("bitbucket-pipelines.yml")) return "bitbucket-pipelines";
  if (ctx.fileExists(".travis.yml")) return "travis-ci";
  if (ctx.fileExists("azure-pipelines.yml")) return "azure-pipelines";
  return null;
}

function detectPreCommitHooks(ctx: ScanContext): boolean {
  if (ctx.files.some(f => f.startsWith(".husky/"))) return true;
  if (ctx.fileExists(".pre-commit-config.yaml")) return true;
  if (ctx.fileExists(".lintstagedrc") || ctx.fileExists("lint-staged.config.js")) return true;
  return false;
}
