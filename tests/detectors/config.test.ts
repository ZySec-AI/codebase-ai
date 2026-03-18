import { describe, it, expect } from "vitest";
import { configDetector } from "../../src/detectors/config.js";
import { createMockContext } from "../helpers.js";

describe("configDetector", () => {
  describe("environment file detection", () => {
    it("detects .env files", async () => {
      const ctx = createMockContext({
        files: [".env", ".env.local", ".env.production"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.env_files).toContain(".env");
      expect(result.env_files).toContain(".env.local");
      expect(result.env_files).toContain(".env.production");
    });

    it("detects .env.example and .env.sample", async () => {
      const ctx = createMockContext({
        files: [".env.example", ".env.sample"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.env_files).toContain(".env.example");
      expect(result.env_files).toContain(".env.sample");
    });

    it("returns empty array when no env files", async () => {
      const ctx = createMockContext({
        files: ["package.json", "README.md"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.env_files).toEqual([]);
    });
  });

  describe("config file detection", () => {
    it("detects TypeScript/JavaScript config files", async () => {
      const ctx = createMockContext({
        files: ["tsconfig.json", "jsconfig.json"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("tsconfig.json");
      expect(result.config_files).toContain("jsconfig.json");
    });

    it("detects bundler config files", async () => {
      const ctx = createMockContext({
        files: [
          "tsup.config.ts",
          "next.config.js",
          "vite.config.ts",
          "webpack.config.js",
          "rollup.config.js",
          "esbuild.config.js",
        ],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("tsup.config.ts");
      expect(result.config_files).toContain("next.config.js");
      expect(result.config_files).toContain("vite.config.ts");
      expect(result.config_files).toContain("webpack.config.js");
      expect(result.config_files).toContain("rollup.config.js");
    });

    it("detects monorepo config files", async () => {
      const ctx = createMockContext({
        files: ["turbo.json", "nx.json"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("turbo.json");
      expect(result.config_files).toContain("nx.json");
    });

    it("detects styling config files", async () => {
      const ctx = createMockContext({
        files: ["tailwind.config.js", "tailwind.config.ts", "postcss.config.js"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("tailwind.config.js");
      expect(result.config_files).toContain("tailwind.config.ts");
      expect(result.config_files).toContain("postcss.config.js");
    });

    it("detects transpiler config files", async () => {
      const ctx = createMockContext({
        files: ["babel.config.js", ".babelrc", "swc.config.json", ".swcrc"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("babel.config.js");
      expect(result.config_files).toContain(".babelrc");
      expect(result.config_files).toContain("swc.config.json");
      expect(result.config_files).toContain(".swcrc");
    });

    it("detects testing config files", async () => {
      const ctx = createMockContext({
        files: ["jest.config.js", "vitest.config.ts", "playwright.config.ts", "cypress.config.js"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("jest.config.js");
      expect(result.config_files).toContain("vitest.config.ts");
      expect(result.config_files).toContain("playwright.config.ts");
      expect(result.config_files).toContain("cypress.config.js");
    });

    it("detects linting and formatting config files", async () => {
      const ctx = createMockContext({
        files: [
          ".prettierrc",
          ".prettierrc.js",
          ".eslintrc.js",
          "eslint.config.js",
          "biome.json",
          "dprint.json",
          ".editorconfig",
        ],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain(".prettierrc");
      expect(result.config_files).toContain(".eslintrc.js");
      expect(result.config_files).toContain("eslint.config.js");
      expect(result.config_files).toContain("biome.json");
      expect(result.config_files).toContain("dprint.json");
      expect(result.config_files).toContain(".editorconfig");
    });

    it("detects container and infra config files", async () => {
      const ctx = createMockContext({
        files: ["docker-compose.yml", "Dockerfile", "fly.toml", "vercel.json", "netlify.toml"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("docker-compose.yml");
      expect(result.config_files).toContain("Dockerfile");
      expect(result.config_files).toContain("fly.toml");
      expect(result.config_files).toContain("vercel.json");
      expect(result.config_files).toContain("netlify.toml");
    });

    it("detects Python config files", async () => {
      const ctx = createMockContext({
        files: ["pyproject.toml", "setup.cfg", "setup.py", "tox.ini", "ruff.toml"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("pyproject.toml");
      expect(result.config_files).toContain("setup.cfg");
      expect(result.config_files).toContain("setup.py");
      expect(result.config_files).toContain("tox.ini");
      expect(result.config_files).toContain("ruff.toml");
    });

    it("detects Go config files", async () => {
      const ctx = createMockContext({
        files: ["go.mod"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("go.mod");
    });

    it("detects Rust config files", async () => {
      const ctx = createMockContext({
        files: ["Cargo.toml"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("Cargo.toml");
    });

    it("detects Ruby config files", async () => {
      const ctx = createMockContext({
        files: ["Gemfile"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("Gemfile");
    });

    it("detects PHP config files", async () => {
      const ctx = createMockContext({
        files: ["composer.json"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("composer.json");
    });

    it("detects misc config files", async () => {
      const ctx = createMockContext({
        files: ["Makefile", "Taskfile.yml", ".nvmrc", ".node-version", ".python-version"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toContain("Makefile");
      expect(result.config_files).toContain("Taskfile.yml");
      expect(result.config_files).toContain(".nvmrc");
      expect(result.config_files).toContain(".node-version");
      expect(result.config_files).toContain(".python-version");
    });

    it("returns empty array when no config files", async () => {
      const ctx = createMockContext({
        files: ["README.md", "src/index.ts"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.config_files).toEqual([]);
    });
  });

  describe("feature flag detection", () => {
    it("detects LaunchDarkly", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: {
              "launchdarkly-node-server-sdk": "^3.0.0",
            },
          }),
        },
      });
      const result = await configDetector.detect(ctx);
      expect(result.feature_flags).toBe("launchdarkly");
    });

    it("detects Unleash", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: {
              "@unleash/proxy-client-react": "^3.0.0",
            },
          }),
        },
      });
      const result = await configDetector.detect(ctx);
      expect(result.feature_flags).toBe("unleash");
    });

    it("detects Flagsmith", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: {
              flagsmith: "^1.0.0",
            },
          }),
        },
      });
      const result = await configDetector.detect(ctx);
      expect(result.feature_flags).toBe("flagsmith");
    });

    it("detects GrowthBook", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: {
              "@growthbook/growthbook-react": "^1.0.0",
            },
          }),
        },
      });
      const result = await configDetector.detect(ctx);
      expect(result.feature_flags).toBe("growthbook");
    });

    it("detects feature flags from devDependencies", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            devDependencies: {
              "launchdarkly-node-server-sdk": "^3.0.0",
            },
          }),
        },
      });
      const result = await configDetector.detect(ctx);
      expect(result.feature_flags).toBe("launchdarkly");
    });

    it("returns null when no feature flags detected", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: {
              react: "^18.0.0",
            },
          }),
        },
      });
      const result = await configDetector.detect(ctx);
      expect(result.feature_flags).toBeNull();
    });

    it("returns null when no package.json", async () => {
      const ctx = createMockContext({
        files: ["README.md"],
        fileContents: {},
      });
      const result = await configDetector.detect(ctx);
      expect(result.feature_flags).toBeNull();
    });

    it("handles malformed package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": "{ invalid json",
        },
      });
      const result = await configDetector.detect(ctx);
      expect(result.feature_flags).toBeNull();
    });
  });

  describe("comprehensive config detection", () => {
    it("detects all config categories together", async () => {
      const ctx = createMockContext({
        files: [
          ".env",
          ".env.local",
          "tsconfig.json",
          "vite.config.ts",
          "vitest.config.ts",
          "tailwind.config.ts",
          ".prettierrc",
          "eslint.config.js",
          "pyproject.toml",
          "Makefile",
        ],
        fileContents: {
          "package.json": JSON.stringify({
            dependencies: {
              "launchdarkly-node-server-sdk": "^3.0.0",
            },
          }),
        },
      });
      const result = await configDetector.detect(ctx);

      expect(result.env_files).toContain(".env");
      expect(result.config_files).toContain("tsconfig.json");
      expect(result.config_files).toContain("vite.config.ts");
      expect(result.config_files).toContain("vitest.config.ts");
      expect(result.config_files).toContain("tailwind.config.ts");
      expect(result.config_files).toContain(".prettierrc");
      expect(result.config_files).toContain("eslint.config.js");
      expect(result.feature_flags).toBe("launchdarkly");
    });
  });
});
