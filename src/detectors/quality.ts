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
  if (ctx.fileExists("pytest.ini") || ctx.fileExists("pyproject.toml") || ctx.fileExists("setup.cfg") || ctx.fileExists("tox.ini")) {
    const pyproject = await ctx.readFile("pyproject.toml");
    const setupCfg = await ctx.readFile("setup.cfg");
    const pytestIni = await ctx.readFile("pytest.ini");
    if (pyproject?.includes("pytest") || setupCfg?.includes("pytest") || pytestIni) return "pytest";
    if (ctx.files.some(f => f.includes("test_") || f.includes("_test.py"))) return "pytest";
    if (pyproject?.includes("unittest") || setupCfg?.includes("unittest")) return "unittest";
    if (pyproject?.includes("nose")) return "nose";
  }
  // Go
  if (ctx.files.some(f => f.endsWith("_test.go"))) return "go test";
  // Rust
  if (ctx.files.some(f => f.includes("/tests/") || f.startsWith("tests/") || f.endsWith("tests.rs") || f.match(/mod\s+tests/))) return "cargo test";
  // Ruby
  if (ctx.fileExists("spec/spec_helper.rb") || ctx.fileExists(".rspec")) return "rspec";
  if (ctx.files.some(f => f.includes("/spec/") && f.endsWith("_spec.rb"))) return "rspec";
  if (ctx.fileExists("test/minitest_helper.rb")) return "minitest";
  // Java
  if (ctx.files.some(f => f.endsWith("Test.java") || f.endsWith("Tests.java"))) return "junit";
  if (ctx.fileExists("pom.xml")) {
    const pom = await ctx.readFile("pom.xml");
    if (pom?.includes("junit") || pom?.includes("testng")) return pom?.includes("testng") ? "testng" : "junit";
  }
  // PHP
  if (ctx.fileExists("phpunit.xml") || ctx.fileExists("phpunit.xml.dist")) return "phpunit";
  if (ctx.files.some(f => f.includes("tests/") && f.endsWith(".php"))) return "phpunit";
  // C#
  if (ctx.files.some(f => f.endsWith("Test.cs") || f.endsWith("Tests.cs"))) return "nunit";
  // Scala
  if (ctx.fileExists("build.sbt")) {
    const build = await ctx.readFile("build.sbt");
    if (build?.includes("scalatest")) return "scalatest";
    if (build?.includes("specs2")) return "specs2";
  }
  // Swift
  if (ctx.files.some(f => f.endsWith("Tests.swift") || f.endsWith("XCTest.swift"))) return "xctest";

  return null;
}

async function detectLinter(ctx: ScanContext): Promise<string | null> {
  // Config-file detection
  if (ctx.fileExists("eslint.config.js") || ctx.fileExists("eslint.config.mjs") || ctx.fileExists("eslint.config.ts")) return "eslint";
  if (ctx.glob(".eslintrc*").length > 0) return "eslint";
  if (ctx.fileExists("biome.json") || ctx.fileExists("biome.jsonc")) return "biome";
  if (ctx.fileExists("ruff.toml") || ctx.fileExists(".ruff.toml")) return "ruff";
  if (ctx.fileExists(".pylintrc") || ctx.fileExists("pylintrc")) return "pylint";
  if (ctx.fileExists(".flake8") || ctx.fileExists("setup.cfg") || ctx.fileExists(".flake8rc")) return "flake8";
  if (ctx.fileExists(".golangci.yml") || ctx.fileExists(".golangci.yaml") || ctx.fileExists(".golangci-lint.yml")) return "golangci-lint";
  if (ctx.fileExists("clippy.toml")) return "clippy";
  if (ctx.fileExists(".rubocop.yml") || ctx.fileExists(".rubocop.yaml")) return "rubocop";
  if (ctx.fileExists(".php_cs") || ctx.fileExists("phpstan.neon") || ctx.fileExists("phpunit.xml")) return "php-cs-fixer";
  if (ctx.fileExists("psalm.xml")) return "psalm";
  if (ctx.fileExists(".swiftlint.yml") || ctx.fileExists(".swiftlint.yaml")) return "swiftlint";
  if (ctx.fileExists(".kotlinlint.xml")) return "ktlint";
  if (ctx.fileExists("detekt.yml") || ctx.fileExists("detekt.yaml")) return "detekt";
  if (ctx.fileExists("checkstyle.xml")) return "checkstyle";
  if (ctx.fileExists("pmd.xml")) return "pmd";
  if (ctx.fileExists(".scalafix.conf")) return "scalafix";

  // Check pyproject.toml for Python linters
  const pyproject = await ctx.readFile("pyproject.toml");
  if (pyproject) {
    if (pyproject.includes("ruff")) return "ruff";
    if (pyproject.includes("pylint")) return "pylint";
    if (pyproject.includes("flake8")) return "flake8";
    if (pyproject.includes("mypy")) return "mypy";
    if (pyproject.includes("black")) return "black";
  }

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
      if (allDeps["@typescript-eslint/eslint-plugin"]) return "eslint";
      if (allDeps["dprint"]) return "dprint";
    } catch {}
  }

  // Go
  if (ctx.fileExists("golangci-lint.yml") || ctx.fileExists(".golangci.yml")) return "golangci-lint";

  // Rust
  const cargo = await ctx.readFile("Cargo.toml");
  if (cargo?.includes("clippy")) return "clippy";

  // Ruby
  if (ctx.fileExists(".rubocop.yml")) return "rubocop";

  // PHP
  if (ctx.fileExists("phpstan.neon")) return "phpstan";
  if (ctx.fileExists("ecs.php") || ctx.fileExists("easy-coding-standard.yml")) return "ecs";

  return null;
}

async function detectFormatter(ctx: ScanContext): Promise<string | null> {
  // Config-file detection
  if (ctx.glob(".prettierrc*").length > 0 || ctx.fileExists("prettier.config.js") || ctx.fileExists("prettier.config.mjs") || ctx.fileExists("prettier.config.cjs") || ctx.fileExists("prettier.config.ts")) return "prettier";
  if (ctx.fileExists("biome.json") || ctx.fileExists("biome.jsonc")) return "biome";
  if (ctx.fileExists("ruff.toml") || ctx.fileExists(".ruff.toml")) return "ruff";
  if (ctx.fileExists("rustfmt.toml") || ctx.fileExists(".rustfmt.toml")) return "rustfmt";
  if (ctx.fileExists("dprint.json") || ctx.fileExists("dprint.jsonc")) return "dprint";
  if (ctx.fileExists(".editorconfig")) return "editorconfig";
  if (ctx.fileExists(".gofmt")) return "gofmt";
  if (ctx.fileExists("gofmt.toml")) return "gofmt";
  if (ctx.fileExists(".scalafmt.conf")) return "scalafmt";
  if (ctx.fileExists(".black") || ctx.fileExists("pyproject.toml")) return "black";
  if (ctx.fileExists(".isort.cfg") || ctx.fileExists("pyproject.toml")) return "isort";
  if (ctx.fileExists(".swiftformat")) return "swiftformat";
  if (ctx.fileExists(".php-cs-fixer.php") || ctx.fileExists(".php-cs-fixer.dist.php")) return "php-cs-fixer";
  if (ctx.fileExists(".rubocop.yml")) return "rubocop";
  if (ctx.fileExists("prettier.config.ts")) return "prettier";
  if (ctx.fileExists(".prettierignore")) return "prettier";

  // Check pyproject.toml for Python formatters
  const pyproject = await ctx.readFile("pyproject.toml");
  if (pyproject) {
    if (pyproject.includes("black")) return "black";
    if (pyproject.includes("isort")) return "isort";
    if (pyproject.includes("autopep8")) return "autopep8";
    if (pyproject.includes("yapf")) return "yapf";
  }

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

  // Go
  if (ctx.fileExists(".gofmtrc") || ctx.fileExists("gofmt.toml")) return "gofmt";

  // Rust
  if (ctx.fileExists("rustfmt.toml")) return "rustfmt";

  // Ruby
  if (ctx.fileExists(".rubocop.yml")) return "rubocop";

  // Swift
  if (ctx.fileExists(".swiftformat")) return "swiftformat";

  // Scala
  if (ctx.fileExists(".scalafmt.conf")) return "scalafmt";

  return null;
}

function detectCI(ctx: ScanContext): string | null {
  if (ctx.files.some(f => f.startsWith(".github/workflows/"))) return "github-actions";
  if (ctx.fileExists(".gitlab-ci.yml") || ctx.fileExists(".gitlab-ci.yaml")) return "gitlab-ci";
  if (ctx.fileExists("Jenkinsfile") || ctx.fileExists("Jenkinsfile")) return "jenkins";
  if (ctx.files.some(f => f.startsWith(".circleci/"))) return "circleci";
  if (ctx.fileExists("bitbucket-pipelines.yml")) return "bitbucket-pipelines";
  if (ctx.fileExists(".travis.yml")) return "travis-ci";
  if (ctx.fileExists("azure-pipelines.yml") || ctx.fileExists("azure-pipelines.yaml")) return "azure-pipelines";
  if (ctx.fileExists("buildspec.yml")) return "aws-codebuild";
  if (ctx.fileExists("cloudbuild.yaml") || ctx.fileExists("cloudbuild.yml")) return "google-cloud-build";
  if (ctx.fileExists(".drone.yml")) return "drone-ci";
  if (ctx.fileExists("workflow.yml")) return "gsuite-actions";
  if (ctx.fileExists("now.json") || ctx.fileExists(".vercelignore")) return "vercel";
  if (ctx.fileExists("netlify.toml")) return "netlify";
  if (ctx.fileExists(".github/workflows/ci.yml") || ctx.fileExists(".github/workflows/cd.yml")) return "github-actions";
  if (ctx.fileExists("procfile") || ctx.fileExists("Procfile")) return "heroku";
  if (ctx.fileExists("appveyor.yml")) return "appveyor";
  if (ctx.fileExists("codeship-services.yml") || ctx.fileExists("codeship-steps.yml")) return "codeship";
  if (ctx.fileExists("semantic.yml")) return "semantic-release";
  if (ctx.fileExists(".rerun.yaml") || ctx.fileExists(".rerun.yml")) return "rerun";
  if (ctx.fileExists("woodpecker.yml")) return "woodpecker-ci";
  if (ctx.fileExists(".forgejo")) return "forgejo";
  return null;
}

function detectPreCommitHooks(ctx: ScanContext): boolean {
  // Husky
  if (ctx.files.some(f => f.startsWith(".husky/"))) return true;
  // pre-commit framework (Python)
  if (ctx.fileExists(".pre-commit-config.yaml") || ctx.fileExists(".pre-commit-config.yml")) return true;
  // lint-staged
  if (ctx.fileExists(".lintstagedrc") || ctx.fileExists("lint-staged.config.js") || ctx.fileExists("lint-staged.config.mjs") || ctx.fileExists("lint-staged.config.ts")) return true;
  // Lefthook
  if (ctx.fileExists("lefthook.yml") || ctx.fileExists("lefthook.yaml") || ctx.fileExists("lefthook-local.yml")) return true;
  // pre-commit hooks
  if (ctx.fileExists(".git/hooks/pre-commit")) return true;
  // simple-git-hooks
  if (ctx.fileExists(".simple-git-hooks.cjs") || ctx.fileExists(".simple-git-hooks.js")) return true;
  // yorkie (VueJS)
  if (ctx.fileExists(".yorkielerc") || ctx.fileExists(".yorkie")) return true;
  // husky 4
  if (ctx.fileExists(".huskyrc") || ctx.fileExists(".huskyrc.json") || ctx.fileExists(".huskyrc.js")) return true;
  // pre-commit (Node)
  if (ctx.fileExists(".pre-commit-hook.json")) return true;
  return false;
}
