import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { copilotEnterpriseIntegration } from "../../src/integrations/copilot-enterprise.js";

describe("copilotEnterpriseIntegration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `copilot-ent-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, ".github"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects Copilot Enterprise instructions", () => {
    const instructionsPath = join(tempDir, ".github/copilot-instructions.md");
    const { writeFileSync } = require("node:fs");
    writeFileSync(instructionsPath, "# Instructions");
    expect(copilotEnterpriseIntegration.detect(tempDir)).toBe(true);
  });

  it("does not detect without instructions file", () => {
    expect(copilotEnterpriseIntegration.detect(tempDir)).toBe(false);
  });

  it("injects codebase reference", () => {
    const instructionsPath = join(tempDir, ".github/copilot-instructions.md");
    const { writeFileSync } = require("node:fs");
    writeFileSync(instructionsPath, "# Copilot Instructions\n");

    copilotEnterpriseIntegration.inject(tempDir);

    const content = readFileSync(instructionsPath, "utf-8");
    expect(content).toContain("<!-- codebase:start -->");
    expect(content).toContain("<!-- codebase:end -->");
    expect(content).toContain("npx codebase brief");
  });

  it("removes codebase reference", () => {
    const instructionsPath = join(tempDir, ".github/copilot-instructions.md");
    const { writeFileSync } = require("node:fs");
    writeFileSync(instructionsPath, "<!-- codebase:start -->\n<!-- codebase:end -->\n");

    copilotEnterpriseIntegration.remove(tempDir);

    const content = readFileSync(instructionsPath, "utf-8");
    expect(content).not.toContain("<!-- codebase:start -->");
    expect(content).not.toContain("<!-- codebase:end -->");
  });
});
