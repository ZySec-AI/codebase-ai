import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCache, saveCache, isCacheValid } from "../../src/scanner/cache.js";

describe("scanner cache", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "codebase-cache-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns null when no cache file exists", () => {
    expect(loadCache(root)).toBeNull();
  });

  it("saves and loads cache round-trip", () => {
    const manifest = { version: "1.0", generated_at: "2024-01-01T00:00:00Z" };
    saveCache(root, 42, manifest);
    const cache = loadCache(root);
    expect(cache).not.toBeNull();
    expect(cache!.file_count).toBe(42);
    expect(cache!.manifest).toEqual(manifest);
  });

  it("cache is valid when file count and mtimes unchanged", () => {
    // Create a tracked file
    writeFileSync(join(root, "package.json"), "{}");

    const manifest = { version: "1.0", generated_at: "2024-01-01T00:00:00Z" };
    saveCache(root, 100, manifest);
    const cache = loadCache(root)!;

    expect(isCacheValid(root, cache, 100)).toBe(true);
  });

  it("cache is invalid when file count changes", () => {
    const manifest = { version: "1.0", generated_at: "2024-01-01T00:00:00Z" };
    saveCache(root, 100, manifest);
    const cache = loadCache(root)!;

    expect(isCacheValid(root, cache, 105)).toBe(false);
  });

  it("cache is invalid when tracked file is modified", () => {
    writeFileSync(join(root, "package.json"), "{}");

    const manifest = { version: "1.0", generated_at: "2024-01-01T00:00:00Z" };
    saveCache(root, 100, manifest);
    const cache = loadCache(root)!;

    // Modify tracked file — change mtime
    const future = new Date(Date.now() + 5000);
    writeFileSync(join(root, "package.json"), '{"name":"changed"}');

    expect(isCacheValid(root, cache, 100)).toBe(false);
  });

  it("cache is invalid when a new tracked file appears", () => {
    const manifest = { version: "1.0", generated_at: "2024-01-01T00:00:00Z" };
    saveCache(root, 100, manifest);
    const cache = loadCache(root)!;

    // Add a new tracked file that didn't exist before
    writeFileSync(join(root, "Cargo.toml"), "[package]");

    expect(isCacheValid(root, cache, 100)).toBe(false);
  });

  it("returns null for corrupted cache", () => {
    writeFileSync(join(root, ".codebase.cache.json"), "not json");
    expect(loadCache(root)).toBeNull();
  });

  it("returns null for wrong cache version", () => {
    writeFileSync(join(root, ".codebase.cache.json"), JSON.stringify({ cache_version: 999 }));
    expect(loadCache(root)).toBeNull();
  });
});
