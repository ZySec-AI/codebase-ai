import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { vscodeIntegration } from "../../src/integrations/vscode.js";

describe("vscodeIntegration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `vscode-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, ".vscode"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects VS Code workspace", () => {
    const settingsPath = join(tempDir, ".vscode/settings.json");
    const { writeFileSync } = require("node:fs");
    writeFileSync(settingsPath, "{}");

    expect(vscodeIntegration.detect(tempDir)).toBe(true);
  });

  it("does not detect without settings.json", () => {
    expect(vscodeIntegration.detect(tempDir)).toBe(false);
  });

  it("injects codebase reference into settings.json", () => {
    const settingsPath = join(tempDir, ".vscode/settings.json");
    const { writeFileSync } = require("node:fs");
    writeFileSync(settingsPath, JSON.stringify({}));

    vscodeIntegration.inject(tempDir);

    const content = readFileSync(settingsPath, "utf-8");
    expect(content).toContain("// codebase:start");
    expect(content).toContain("// codebase:end");
    expect(content).toContain("npx codebase brief");
  });

  it("removes codebase reference from settings.json", () => {
    const settingsPath = join(tempDir, ".vscode/settings.json");
    const { writeFileSync } = require("node:fs");
    writeFileSync(settingsPath, "// codebase:start\n// codebase:end\n");

    vscodeIntegration.remove(tempDir);

    const content = readFileSync(settingsPath, "utf-8");
    expect(content).not.toContain("// codebase:start");
    expect(content).not.toContain("// codebase:end");
  });
});
