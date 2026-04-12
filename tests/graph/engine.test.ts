import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraph, saveGraph, loadGraph } from "../../src/graph/engine.js";

const createdDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "codebase-graph-engine-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of createdDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("buildGraph", () => {
  it("returns graph with version: 1 and at least one node for a dir with a .ts file", async () => {
    const tmpDir = await makeTmpDir();
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(
      join(tmpDir, "src", "index.ts"),
      `export function hello(): string { return "hello"; }`
    );

    const graph = await buildGraph(tmpDir);
    expect(graph).not.toBeNull();
    expect(graph!.version).toBe(1);
    expect(graph!.nodes.length).toBeGreaterThan(0);
  });
});

describe("saveGraph and loadGraph", () => {
  it("round-trips a graph through save and load with deep equality", async () => {
    const tmpDir = await makeTmpDir();
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, "src", "app.ts"), `export const x = 1;`);

    const original = await buildGraph(tmpDir);
    expect(original).not.toBeNull();

    await saveGraph(tmpDir, original!);

    const loaded = await loadGraph(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(original);
  });
});

describe("loadGraph", () => {
  it("returns null when no graph file exists in the directory", async () => {
    const tmpDir = await makeTmpDir();
    const result = await loadGraph(tmpDir);
    expect(result).toBeNull();
  });
});
