import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { webstormIntegration } from "../../src/integrations/webstorm.js";

describe("webstormIntegration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `webstorm-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects WebStorm/IntelliJ project", () => {
    mkdirSync(join(tempDir, ".idea"), { recursive: true });
    expect(webstormIntegration.detect(tempDir)).toBe(true);
  });

  it("does not detect without .idea directory", () => {
    expect(webstormIntegration.detect(tempDir)).toBe(false);
  });

  it("creates codebase project file", () => {
    mkdirSync(join(tempDir, ".idea"), { recursive: true });

    webstormIntegration.inject(tempDir);

    const configPath = join(tempDir, ".idea/codebase-project.xml");
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("<!-- codebase:start -->");
    expect(content).toContain("<!-- codebase:end -->");
    expect(content).toContain("npx codebase brief");
  });

  it("removes codebase project file", () => {
    mkdirSync(join(tempDir, ".idea"), { recursive: true });
    webstormIntegration.inject(tempDir);

    const configPath = join(tempDir, ".idea/codebase-project.xml");
    expect(existsSync(configPath)).toBe(true);

    webstormIntegration.remove(tempDir);
    expect(existsSync(configPath)).toBe(false);
  });
});
