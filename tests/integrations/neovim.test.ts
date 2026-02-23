import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { neovimIntegration } from "../../src/integrations/neovim.js";

describe("neovimIntegration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `neovim-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects .nvimrc", () => {
    const nvimrcPath = join(tempDir, ".nvimrc");
    const { writeFileSync } = require("node:fs");
    writeFileSync(nvimrcPath, "");
    expect(neovimIntegration.detect(tempDir)).toBe(true);
  });

  it("detects init.lua", () => {
    const luaPath = join(tempDir, "init.lua");
    const { writeFileSync } = require("node:fs");
    writeFileSync(luaPath, "");
    expect(neovimIntegration.detect(tempDir)).toBe(true);
  });

  it("detects .config/nvim/init.lua", () => {
    const configDir = join(tempDir, ".config/nvim");
    mkdirSync(configDir, { recursive: true });
    const luaPath = join(configDir, "init.lua");
    const { writeFileSync } = require("node:fs");
    writeFileSync(luaPath, "");
    expect(neovimIntegration.detect(tempDir)).toBe(true);
  });

  it("does not detect without Neovim config", () => {
    expect(neovimIntegration.detect(tempDir)).toBe(false);
  });

  it("injects into init.lua with Lua comments", () => {
    const luaPath = join(tempDir, "init.lua");
    const { writeFileSync } = require("node:fs");
    writeFileSync(luaPath, "-- Existing config\n");

    neovimIntegration.inject(tempDir);

    const content = readFileSync(luaPath, "utf-8");
    expect(content).toContain("-- codebase:start");
    expect(content).toContain("-- codebase:end");
    expect(content).toContain("npx codebase brief");
  });

  it("removes from init.lua", () => {
    const luaPath = join(tempDir, "init.lua");
    const { writeFileSync } = require("node:fs");
    writeFileSync(luaPath, "-- codebase:start\n-- codebase:end\n");

    neovimIntegration.remove(tempDir);

    const content = readFileSync(luaPath, "utf-8");
    expect(content).not.toContain("-- codebase:start");
    expect(content).not.toContain("-- codebase:end");
  });

  it("creates init.lua if no config exists", () => {
    neovimIntegration.inject(tempDir);

    const luaPath = join(tempDir, "init.lua");
    expect(existsSync(luaPath)).toBe(true);

    const content = readFileSync(luaPath, "utf-8");
    expect(content).toContain("-- codebase:start");
    expect(content).toContain("-- codebase:end");
  });
});
