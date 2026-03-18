import { describe, it, expect } from "vitest";
import { commandsDetector } from "../../src/detectors/commands.js";
import { createMockContext } from "../helpers.js";

describe("commandsDetector", () => {
  describe("package.json scripts detection", () => {
    it("detects dev, build, test, lint, format scripts", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: {
              dev: "vite",
              build: "tsup",
              test: "vitest",
              lint: "eslint",
              format: "prettier --check",
            },
          }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("npm run dev");
      expect(result.build).toBe("npm run build");
      expect(result.test).toBe("npm run test");
      expect(result.lint).toBe("npm run lint");
      expect(result.format).toBe("npm run format");
    });

    it("detects pnpm scripts from pnpm-lock.yaml", async () => {
      const ctx = createMockContext({
        files: ["package.json", "pnpm-lock.yaml"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: { dev: "vite", build: "tsup" },
          }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("pnpm dev");
      expect(result.build).toBe("pnpm build");
    });

    it("detects yarn scripts from yarn.lock", async () => {
      const ctx = createMockContext({
        files: ["package.json", "yarn.lock"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: { dev: "vite" },
          }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("yarn dev");
    });

    it("detects bun scripts from bun.lock", async () => {
      const ctx = createMockContext({
        files: ["package.json", "bun.lock"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: { dev: "vite" },
          }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("bun run dev");
    });

    it("detects bun scripts from bun.lockb", async () => {
      const ctx = createMockContext({
        files: ["package.json", "bun.lockb"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: { dev: "vite" },
          }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("bun run dev");
    });

    it("falls back to alternative script names", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: {
              start: "node server.js",
              compile: "tsc",
              "test:unit": "vitest run",
              "lint:check": "eslint .",
              fmt: "prettier --check",
            },
          }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("npm run start");
      expect(result.build).toBe("npm run compile");
      expect(result.test).toBe("npm run test:unit");
      expect(result.lint).toBe("npm run lint:check");
      expect(result.format).toBe("npm run fmt");
    });

    it("returns null for missing scripts", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: { dev: "vite" },
          }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.build).toBeNull();
      expect(result.test).toBeNull();
      expect(result.lint).toBeNull();
      expect(result.format).toBeNull();
    });

    it("detects extra useful scripts", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: {
              dev: "vite",
              typecheck: "tsc --noEmit",
              deploy: "vercel deploy",
              preview: "vite preview",
              clean: "rm -rf dist",
              "db:migrate": "prisma migrate",
              "db:seed": "prisma seed",
              generate: "prisma generate",
              storybook: "storybook dev",
            },
          }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("npm run dev");
      expect(result.typecheck).toBe("npm run typecheck");
      expect(result.deploy).toBe("npm run deploy");
      expect(result.preview).toBe("npm run preview");
      expect(result.clean).toBe("npm run clean");
      expect(result["db:migrate"]).toBe("npm run db:migrate");
      expect(result["db:seed"]).toBe("npm run db:seed");
      expect(result.generate).toBe("npm run generate");
      expect(result.storybook).toBe("npm run storybook");
    });

    it("handles malformed package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": "{ invalid json",
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBeNull();
      expect(result.build).toBeNull();
    });

    it("handles package.json with no scripts", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({ name: "test" }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBeNull();
      expect(result.build).toBeNull();
    });
  });

  describe("Makefile detection", () => {
    it("detects commands from Makefile when no package.json scripts", async () => {
      const ctx = createMockContext({
        files: ["Makefile"],
        fileContents: {
          Makefile: `
.PHONY: dev build test lint format

dev:
  npm run dev

build:
  npm run build

test:
  npm test

lint:
  eslint .

format:
  prettier --write .
`,
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("make dev");
      expect(result.build).toBe("make build");
      expect(result.test).toBe("make test");
      expect(result.lint).toBe("make lint");
      expect(result.format).toBe("make format");
    });

    it("falls back to run target when dev not found", async () => {
      const ctx = createMockContext({
        files: ["Makefile"],
        fileContents: {
          Makefile: `
run:
  npm start

build:
  npm run build
`,
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("make run");
      expect(result.build).toBe("make build");
    });

    it("falls back to fmt when format not found", async () => {
      const ctx = createMockContext({
        files: ["Makefile"],
        fileContents: {
          Makefile: `
fmt:
  prettier --write .
`,
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.format).toBe("make fmt");
    });

    it("returns null for missing Makefile targets", async () => {
      const ctx = createMockContext({
        files: ["Makefile"],
        fileContents: {
          Makefile: `
clean:
  rm -rf dist
`,
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBeNull();
      expect(result.build).toBeNull();
    });
  });

  describe("language-specific defaults", () => {
    it("detects Cargo (Rust) defaults", async () => {
      const ctx = createMockContext({
        files: ["Cargo.toml"],
        fileContents: {},
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("cargo run");
      expect(result.build).toBe("cargo build");
      expect(result.test).toBe("cargo test");
      expect(result.lint).toBe("cargo clippy");
      expect(result.format).toBe("cargo fmt");
    });

    it("detects Go defaults", async () => {
      const ctx = createMockContext({
        files: ["go.mod"],
        fileContents: {},
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("go run .");
      expect(result.build).toBe("go build .");
      expect(result.test).toBe("go test ./...");
      expect(result.format).toBe("go fmt ./...");
    });

    it("detects Go lint when golangci.yml present", async () => {
      const ctx = createMockContext({
        files: ["go.mod", ".golangci.yml"],
        fileContents: {},
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.lint).toBe("golangci-lint run");
    });

    it("detects Python with pytest", async () => {
      const ctx = createMockContext({
        files: ["pyproject.toml", "tests/test_app.py"],
        fileContents: {},
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.test).toBe("python -m pytest");
    });

    it("detects Python with poetry.lock", async () => {
      const ctx = createMockContext({
        files: ["pyproject.toml", "poetry.lock", "tests/test_app.py"],
        fileContents: {},
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.test).toBe("poetry run pytest");
    });

    it("detects Django manage.py", async () => {
      const ctx = createMockContext({
        files: ["manage.py", "pyproject.toml"],
        fileContents: {},
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("python -m python manage.py runserver");
    });

    it("detects Python lint with ruff.toml", async () => {
      const ctx = createMockContext({
        files: ["pyproject.toml", "ruff.toml"],
        fileContents: {},
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.lint).toBe("python -m ruff check .");
      expect(result.format).toBe("python -m ruff format .");
    });

    it("detects Python lint with .ruff.toml", async () => {
      const ctx = createMockContext({
        files: ["pyproject.toml", ".ruff.toml"],
        fileContents: {},
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.lint).toBe("python -m ruff check .");
      expect(result.format).toBe("python -m ruff format .");
    });

    it("returns empty for projects without detectable commands", async () => {
      const ctx = createMockContext({
        files: ["README.md"],
        fileContents: {},
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBeNull();
      expect(result.build).toBeNull();
      expect(result.test).toBeNull();
      expect(result.lint).toBeNull();
      expect(result.format).toBeNull();
    });
  });

  describe("priority order", () => {
    it("prefers package.json scripts over Makefile", async () => {
      const ctx = createMockContext({
        files: ["package.json", "Makefile"],
        fileContents: {
          "package.json": JSON.stringify({
            scripts: { dev: "vite", build: "tsup" },
          }),
          Makefile: "dev:\n  npm start",
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("npm run dev");
      expect(result.build).toBe("npm run build");
    });

    it("uses Makefile when package.json has no scripts", async () => {
      const ctx = createMockContext({
        files: ["package.json", "Makefile"],
        fileContents: {
          "package.json": JSON.stringify({ name: "test" }),
          Makefile: "dev:\n  npm start\nbuild:\n  npm run build",
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("make dev");
      expect(result.build).toBe("make build");
    });

    it("falls back to language defaults when no scripts/Makefile", async () => {
      const ctx = createMockContext({
        files: ["package.json", "Cargo.toml"],
        fileContents: {
          "package.json": JSON.stringify({ name: "test" }),
        },
      });
      const result = await commandsDetector.detect(ctx);
      expect(result.dev).toBe("cargo run");
      expect(result.build).toBe("cargo build");
    });
  });
});
