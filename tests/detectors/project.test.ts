import { describe, it, expect } from "vitest";
import { projectDetector } from "../../src/detectors/project.js";
import { createMockContext } from "../helpers.js";

describe("projectDetector", () => {
  describe("project name detection", () => {
    it("detects name from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({ name: "my-awesome-project" }),
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.name).toBe("my-awesome-project");
    });

    it("detects name from Cargo.toml", async () => {
      const ctx = createMockContext({
        files: ["Cargo.toml"],
        fileContents: {
          "Cargo.toml": '[package]\nname = "rust-project"',
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.name).toBe("rust-project");
    });

    it("detects name from pyproject.toml", async () => {
      const ctx = createMockContext({
        files: ["pyproject.toml"],
        fileContents: {
          "pyproject.toml": '[project]\nname = "python-project"',
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.name).toBe("python-project");
    });

    it("detects name from go.mod (last component)", async () => {
      const ctx = createMockContext({
        files: ["go.mod"],
        fileContents: {
          "go.mod": "module github.com/user/project",
        },
        execResults: {
          "git remote": "",
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.name).toBe("project");
    });

    it("falls back to git remote name", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git remote": "git@github.com:user/repo-name.git",
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.name).toBe("repo-name");
    });

    it("falls back to directory name as last resort", async () => {
      const ctx = createMockContext({
        files: [],
        fileContents: {},
        execResults: {
          "git remote": "",
        },
      });
      ctx.root = "/path/to/my-project";
      const result = await projectDetector.detect(ctx);
      expect(result.name).toBe("my-project");
    });
  });

  describe("description detection", () => {
    it("detects description from package.json", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": JSON.stringify({
            name: "test",
            description: "A test project for testing",
          }),
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.description).toBe("A test project for testing");
    });

    it("detects description from Cargo.toml", async () => {
      const ctx = createMockContext({
        files: ["Cargo.toml"],
        fileContents: {
          "Cargo.toml": '[package]\nname = "test"\ndescription = "A Rust project"',
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.description).toBe("A Rust project");
    });

    it("detects description from pyproject.toml", async () => {
      const ctx = createMockContext({
        files: ["pyproject.toml"],
        fileContents: {
          "pyproject.toml": '[project]\nname = "test"\ndescription = "A Python project"',
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.description).toBe("A Python project");
    });
  });

  describe("README summary extraction", () => {
    it("extracts first paragraph from README.md", async () => {
      const ctx = createMockContext({
        files: ["README.md"],
        fileContents: {
          "README.md": `# My Project

This is the first paragraph of the README.
It continues on this line.

## Features

- Feature 1
- Feature 2
`,
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.description).toContain("This is the first paragraph");
      expect(result.description).toContain("continues on this line");
    });

    it("skips badges and images before content", async () => {
      const ctx = createMockContext({
        files: ["README.md"],
        fileContents: {
          "README.md": `# Project

![build-badge](https://img.shields.io/badge/build-passing)
[![License](https://img.shields.io/badge/license-MIT)]

This is real content after badges.
`,
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.description).toContain("real content after badges");
      expect(result.description).not.toContain("build-badge");
    });

    it("handles README.md with title only", async () => {
      const ctx = createMockContext({
        files: ["README.md"],
        fileContents: {
          "README.md": "# Just Title\n",
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.description).toBeNull();
    });

    it("prefers package.json description over README", async () => {
      const ctx = createMockContext({
        files: ["package.json", "README.md"],
        fileContents: {
          "package.json": JSON.stringify({
            name: "test",
            description: "Package description",
          }),
          "README.md": `# Project

README description
`,
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.description).toBe("Package description");
    });

    it("falls back to README when no package.json description", async () => {
      const ctx = createMockContext({
        files: ["package.json", "README.md"],
        fileContents: {
          "package.json": JSON.stringify({ name: "test" }),
          "README.md": `# Project

README description
`,
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.description).toContain("README description");
    });

    it("checks multiple README filename variants", async () => {
      const ctx = createMockContext({
        files: ["readme.md"],
        fileContents: {
          "readme.md": `# Lowercase readme

Content from lowercase readme.
`,
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.description?.toLowerCase()).toContain("content from lowercase readme");
    });
  });

  describe("edge cases", () => {
    it("handles malformed package.json gracefully", async () => {
      const ctx = createMockContext({
        files: ["package.json"],
        fileContents: {
          "package.json": "{ invalid json }",
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.name).toBeDefined(); // Falls back to other methods
    });

    it("handles empty Cargo.toml", async () => {
      const ctx = createMockContext({
        files: ["Cargo.toml"],
        fileContents: {
          "Cargo.toml": "# empty\n",
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.name).toBeDefined(); // Falls back
    });

    it("handles both package.json and Cargo.toml (package.json wins)", async () => {
      const ctx = createMockContext({
        files: ["package.json", "Cargo.toml"],
        fileContents: {
          "package.json": JSON.stringify({ name: "js-name" }),
          "Cargo.toml": '[package]\nname = "rust-name"',
        },
      });
      const result = await projectDetector.detect(ctx);
      expect(result.name).toBe("js-name");
    });
  });
});
