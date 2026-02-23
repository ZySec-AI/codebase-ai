import { describe, it, expect } from "vitest";
import { qualityDetector } from "../../src/detectors/quality.js";
import { createMockContext } from "../helpers.js";

describe("qualityDetector", () => {
  describe("test framework detection", () => {
    it("detects vitest from config file", async () => {
      const ctx = createMockContext({
        files: ["vitest.config.ts"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("vitest");
    });

    it("detects vitest from .ts extension", async () => {
      const ctx = createMockContext({
        files: ["vitest.config.ts"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("vitest");
    });

    it("detects vitest from .js extension", async () => {
      const ctx = createMockContext({
        files: ["vitest.config.js"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("vitest");
    });

    it("detects vitest from .mts extension", async () => {
      const ctx = createMockContext({
        files: ["vitest.config.mts"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("vitest");
    });

    it("detects jest from config file", async () => {
      const ctx = createMockContext({
        files: ["jest.config.js"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("jest");
    });

    it("detects mocha from config file", async () => {
      const ctx = createMockContext({
        files: [".mocharc.yml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("mocha");
    });

    it("detects mocha from .mocharc.json", async () => {
      const ctx = createMockContext({
        files: [".mocharc.json"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("mocha");
    });

    it("detects playwright from config file", async () => {
      const ctx = createMockContext({
        files: ["playwright.config.ts"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("playwright");
    });

    it("detects cypress from config file", async () => {
      const ctx = createMockContext({
        files: ["cypress.config.ts"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("cypress");
    });

    it("detects vitest from package.json dependencies", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { vitest: "^1.0.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("vitest");
    });

    it("detects vitest from test script", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: { test: "vitest run" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("vitest");
    });

    it("detects ava from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { ava: "^5.0.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("ava");
    });

    it("detects tap from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { tap: "^18.0.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("tap");
    });

    it("detects pytest from test files and pyproject.toml", async () => {
      const ctx = createMockContext({
        files: ["pyproject.toml", "tests/test_app.py"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("pytest");
    });

    it("detects pytest from pytest.ini", async () => {
      const ctx = createMockContext({
        files: ["pytest.ini", "tests/test_app.py"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("pytest");
    });

    it("detects go test from test files", async () => {
      const ctx = createMockContext({
        files: ["app_test.go", "utils_test.go"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("go test");
    });

    it("detects cargo test from test directory", async () => {
      const ctx = createMockContext({
        files: ["tests/integration_test.rs"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBe("cargo test");
    });

    it("returns null when no test framework detected", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { express: "^4.18.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.test_framework).toBeNull();
    });
  });

  describe("linter detection", () => {
    it("detects eslint from eslint.config.js", async () => {
      const ctx = createMockContext({
        files: ["eslint.config.js"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("eslint");
    });

    it("detects eslint from eslint.config.mjs", async () => {
      const ctx = createMockContext({
        files: ["eslint.config.mjs"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("eslint");
    });

    it("detects eslint from eslint.config.ts", async () => {
      const ctx = createMockContext({
        files: ["eslint.config.ts"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("eslint");
    });

    it("detects eslint from .eslintrc.js", async () => {
      const ctx = createMockContext({
        files: [".eslintrc.js"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("eslint");
    });

    it("detects eslint from .eslintrc.json", async () => {
      const ctx = createMockContext({
        files: [".eslintrc.json"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("eslint");
    });

    it("detects eslint from glob pattern", async () => {
      const ctx = createMockContext({
        files: [".eslintrc.yml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("eslint");
    });

    it("detects biome from biome.json", async () => {
      const ctx = createMockContext({
        files: ["biome.json"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("biome");
    });

    it("detects biome from biome.jsonc", async () => {
      const ctx = createMockContext({
        files: ["biome.jsonc"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("biome");
    });

    it("detects ruff from ruff.toml", async () => {
      const ctx = createMockContext({
        files: ["ruff.toml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("ruff");
    });

    it("detects ruff from .ruff.toml", async () => {
      const ctx = createMockContext({
        files: [".ruff.toml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("ruff");
    });

    it("detects pylint from .pylintrc", async () => {
      const ctx = createMockContext({
        files: [".pylintrc"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("pylint");
    });

    it("detects flake8 from .flake8", async () => {
      const ctx = createMockContext({
        files: [".flake8"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("flake8");
    });

    it("detects golangci-lint from .golangci.yml", async () => {
      const ctx = createMockContext({
        files: [".golangci.yml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("golangci-lint");
    });

    it("detects golangci-lint from .golangci.yaml", async () => {
      const ctx = createMockContext({
        files: [".golangci.yaml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("golangci-lint");
    });

    it("detects clippy from clippy.toml", async () => {
      const ctx = createMockContext({
        files: ["clippy.toml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("clippy");
    });

    it("detects eslint from package.json dependency", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { eslint: "^8.0.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("eslint");
    });

    it("detects eslint from lint script", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: { lint: "eslint src/" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("eslint");
    });

    it("detects biome from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { "@biomejs/biome": "^1.0.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("biome");
    });

    it("detects oxlint from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { oxlint: "^0.1.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("oxlint");
    });

    it("detects standard from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { standard: "^17.0.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("standard");
    });

    it("detects xo from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { xo: "^0.56.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBe("xo");
    });

    it("returns null when no linter detected", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { express: "^4.18.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.linter).toBeNull();
    });
  });

  describe("formatter detection", () => {
    it("detects prettier from .prettierrc", async () => {
      const ctx = createMockContext({
        files: [".prettierrc"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("prettier");
    });

    it("detects prettier from .prettierrc.js", async () => {
      const ctx = createMockContext({
        files: [".prettierrc.js"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("prettier");
    });

    it("detects prettier from .prettierrc.json", async () => {
      const ctx = createMockContext({
        files: [".prettierrc.json"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("prettier");
    });

    it("detects prettier from prettier.config.js", async () => {
      const ctx = createMockContext({
        files: ["prettier.config.js"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("prettier");
    });

    it("detects prettier from prettier.config.mjs", async () => {
      const ctx = createMockContext({
        files: ["prettier.config.mjs"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("prettier");
    });

    it("detects biome from biome.json (formatter)", async () => {
      const ctx = createMockContext({
        files: ["biome.json"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("biome");
    });

    it("detects ruff from ruff.toml (formatter)", async () => {
      const ctx = createMockContext({
        files: ["ruff.toml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("ruff");
    });

    it("detects rustfmt from rustfmt.toml", async () => {
      const ctx = createMockContext({
        files: ["rustfmt.toml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("rustfmt");
    });

    it("detects rustfmt from .rustfmt.toml", async () => {
      const ctx = createMockContext({
        files: [".rustfmt.toml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("rustfmt");
    });

    it("detects dprint from dprint.json", async () => {
      const ctx = createMockContext({
        files: ["dprint.json"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("dprint");
    });

    it("detects editorconfig from .editorconfig", async () => {
      const ctx = createMockContext({
        files: [".editorconfig"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("editorconfig");
    });

    it("detects prettier from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { prettier: "^3.0.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("prettier");
    });

    it("detects prettier from format script", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: { format: "prettier --write ." },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("prettier");
    });

    it("detects dprint from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { dprint: "^0.45.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBe("dprint");
    });

    it("returns null when no formatter detected", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { express: "^4.18.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.formatter).toBeNull();
    });
  });

  describe("CI detection", () => {
    it("detects GitHub Actions", async () => {
      const ctx = createMockContext({
        files: [".github/workflows/ci.yml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.ci).toBe("github-actions");
    });

    it("detects GitLab CI", async () => {
      const ctx = createMockContext({
        files: [".gitlab-ci.yml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.ci).toBe("gitlab-ci");
    });

    it("detects Jenkins", async () => {
      const ctx = createMockContext({
        files: ["Jenkinsfile"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.ci).toBe("jenkins");
    });

    it("detects CircleCI", async () => {
      const ctx = createMockContext({
        files: [".circleci/config.yml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.ci).toBe("circleci");
    });

    it("detects Bitbucket Pipelines", async () => {
      const ctx = createMockContext({
        files: ["bitbucket-pipelines.yml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.ci).toBe("bitbucket-pipelines");
    });

    it("detects Travis CI", async () => {
      const ctx = createMockContext({
        files: [".travis.yml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.ci).toBe("travis-ci");
    });

    it("detects Azure Pipelines", async () => {
      const ctx = createMockContext({
        files: ["azure-pipelines.yml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.ci).toBe("azure-pipelines");
    });

    it("returns null when no CI detected", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.ci).toBeNull();
    });
  });

  describe("pre-commit hooks detection", () => {
    it("detects husky hooks", async () => {
      const ctx = createMockContext({
        files: [".husky/pre-commit"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.pre_commit_hooks).toBe(true);
    });

    it("detects Python pre-commit hooks", async () => {
      const ctx = createMockContext({
        files: [".pre-commit-config.yaml"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.pre_commit_hooks).toBe(true);
    });

    it("detects lint-staged config", async () => {
      const ctx = createMockContext({
        files: [".lintstagedrc"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.pre_commit_hooks).toBe(true);
    });

    it("detects lint-staged config file", async () => {
      const ctx = createMockContext({
        files: ["lint-staged.config.js"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.pre_commit_hooks).toBe(true);
    });

    it("returns false when no pre-commit hooks", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);
      expect(result.pre_commit_hooks).toBe(false);
    });
  });

  describe("comprehensive quality detection", () => {
    it("detects complete TypeScript quality setup", async () => {
      const ctx = createMockContext({
        files: [
          "vitest.config.ts",
          "eslint.config.js",
          "prettier.config.js",
          ".github/workflows/ci.yml",
          ".husky/pre-commit",
        ],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);

      expect(result.test_framework).toBe("vitest");
      expect(result.linter).toBe("eslint");
      expect(result.formatter).toBe("prettier");
      expect(result.ci).toBe("github-actions");
      expect(result.pre_commit_hooks).toBe(true);
    });

    it("detects complete Python quality setup", async () => {
      const ctx = createMockContext({
        files: [
          "pytest.ini",
          "ruff.toml",
          ".github/workflows/ci.yml",
          ".pre-commit-config.yaml",
          "tests/test_app.py",
        ],
        fileContents: {},
      });
      const result = await qualityDetector.detect(ctx);

      expect(result.test_framework).toBe("pytest");
      expect(result.linter).toBe("ruff");
      expect(result.formatter).toBe("ruff");
      expect(result.ci).toBe("github-actions");
      expect(result.pre_commit_hooks).toBe(true);
    });

    it("handles project with minimal quality tooling", async () => {
      const ctx = createMockContext({
        files: ["package.json", ".editorconfig"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: { express: "^4.18.0" },
          }),
        },
      });
      const result = await qualityDetector.detect(ctx);

      expect(result.test_framework).toBeNull();
      expect(result.linter).toBeNull();
      expect(result.formatter).toBe("editorconfig");
      expect(result.ci).toBeNull();
      expect(result.pre_commit_hooks).toBe(false);
    });
  });
});
