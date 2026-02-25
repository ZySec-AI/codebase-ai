import { describe, it, expect } from "vitest";
import { dependenciesDetector } from "../../src/detectors/dependencies.js";
import { createMockContext } from "../helpers.js";

describe("dependenciesDetector", () => {
  it("counts direct and dev dependencies separately", async () => {
    const ctx = createMockContext({
      files: ["package.json"],
      fileContents: {
        "package.json": JSON.stringify({
          dependencies: { react: "^18.0.0", "react-dom": "^18.0.0" },
          devDependencies: { typescript: "^5.4.0", vitest: "^1.6.0", tsup: "^8.0.0" },
        }),
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(2);
    expect(result.dev_count).toBe(3);
  });

  it("detects notable packages from both deps and devDeps", async () => {
    const ctx = createMockContext({
      files: ["package.json"],
      fileContents: {
        "package.json": JSON.stringify({
          dependencies: { react: "^18.0.0", zustand: "^4.0.0" },
          devDependencies: { vitest: "^1.6.0", tsup: "^8.0.0" },
        }),
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    const notable = result.notable as string[];
    expect(notable).toContain("react");
    expect(notable).toContain("zustand");
    expect(notable).toContain("vitest");
    expect(notable).toContain("tsup");
  });

  it("detects lock file", async () => {
    const ctx = createMockContext({
      files: ["package.json", "yarn.lock"],
      fileContents: {
        "package.json": JSON.stringify({ dependencies: { react: "^18.0.0" } }),
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.lock_file).toBe("yarn.lock");
  });

  it("returns empty when no package.json", async () => {
    const ctx = createMockContext({ files: ["src/main.go"] });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(0);
    expect(result.notable).toEqual([]);
  });

  it("parses Python pyproject.toml (PEP 621)", async () => {
    const ctx = createMockContext({
      files: ["pyproject.toml", "poetry.lock"],
      fileContents: {
        "pyproject.toml": `[project]
name = "myapp"
version = "1.0.0"
dependencies = [
  "flask>=2.0",
  "sqlalchemy>=2.0",
  "pydantic>=2.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=7.0",
  "ruff>=0.1.0",
]`,
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(3);
    expect(result.dev_count).toBe(2);
    expect(result.lock_file).toBe("poetry.lock");
    expect(result.notable).toContain("flask");
    expect(result.notable).toContain("sqlalchemy");
    expect(result.notable).toContain("pytest");
  });

  it("parses Python pyproject.toml (Poetry format)", async () => {
    const ctx = createMockContext({
      files: ["pyproject.toml"],
      fileContents: {
        "pyproject.toml": `[tool.poetry]
name = "myapp"

[tool.poetry.dependencies]
python = "^3.11"
django = "^4.2"
celery = "^5.3"

[tool.poetry.group.dev.dependencies]
pytest = "^7.4"
`,
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(2); // python excluded
    expect(result.dev_count).toBe(1);
    expect(result.notable).toContain("django");
    expect(result.notable).toContain("celery");
  });

  it("parses Python requirements.txt", async () => {
    const ctx = createMockContext({
      files: ["requirements.txt"],
      fileContents: {
        "requirements.txt": `# Web framework
flask>=2.0
requests==2.31.0
numpy>=1.24
# Dev tools
-e .
`,
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(3);
    expect(result.dev_count).toBe(0);
    expect(result.notable).toContain("flask");
    expect(result.notable).toContain("requests");
    expect(result.notable).toContain("numpy");
  });

  it("parses Rust Cargo.toml", async () => {
    const ctx = createMockContext({
      files: ["Cargo.toml", "Cargo.lock"],
      fileContents: {
        "Cargo.toml": `[package]
name = "myapp"
version = "0.1.0"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
axum = "0.7"

[dev-dependencies]
reqwest = { version = "0.11", features = ["json"] }
`,
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(3);
    expect(result.dev_count).toBe(1);
    expect(result.lock_file).toBe("Cargo.lock");
    expect(result.notable).toContain("serde");
    expect(result.notable).toContain("tokio");
    expect(result.notable).toContain("axum");
  });

  it("parses Go go.mod", async () => {
    const ctx = createMockContext({
      files: ["go.mod", "go.sum"],
      fileContents: {
        "go.mod": `module github.com/myorg/myapp

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/spf13/cobra v1.7.0
	gorm.io/gorm v1.25.0
)
`,
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(3);
    expect(result.dev_count).toBe(0);
    expect(result.lock_file).toBe("go.sum");
    expect(result.notable).toContain("gin");
    expect(result.notable).toContain("cobra");
    expect(result.notable).toContain("gorm");
  });

  it("package.json wins when both package.json and pyproject.toml exist", async () => {
    const ctx = createMockContext({
      files: ["package.json", "pyproject.toml"],
      fileContents: {
        "package.json": JSON.stringify({
          dependencies: { react: "^18.0.0" },
        }),
        "pyproject.toml": `[project]
name = "dual"
dependencies = ["flask>=2.0"]`,
      },
    });
    const result = await dependenciesDetector.detect(ctx);
    expect(result.direct_count).toBe(1);
    const notable = result.notable as string[];
    expect(notable).toContain("react");
    expect(notable).not.toContain("flask");
  });
});
