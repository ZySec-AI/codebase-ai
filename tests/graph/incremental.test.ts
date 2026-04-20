import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateGraph } from "../../src/graph/incremental.js";
import { saveGraph, buildGraph } from "../../src/graph/engine.js";

const createdDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "codebase-graph-incremental-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of createdDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("updateGraph", () => {
  it("returns a non-null graph when no existing graph is found (full build)", async () => {
    const tmpDir = await makeTmpDir();
    await mkdir(join(tmpDir, "src"), { recursive: true });
    await writeFile(join(tmpDir, "src", "index.ts"), `export const value = 42;`);

    const graph = await updateGraph(tmpDir);
    expect(graph).not.toBeNull();
    expect(graph!.version).toBe(1);
  });

  it("updates nodes for a modified file", async () => {
    const tmpDir = await makeTmpDir();
    await mkdir(join(tmpDir, "src"), { recursive: true });
    const filePath = join(tmpDir, "src", "service.ts");
    await writeFile(filePath, `export function oldName(): void {}`);

    // Build and save the initial graph
    const initial = await buildGraph(tmpDir);
    expect(initial).not.toBeNull();
    await saveGraph(tmpDir, initial!);

    // Modify the file
    await writeFile(filePath, `export function newName(): void {}`);

    const updated = await updateGraph(tmpDir, ["src/service.ts"]);
    expect(updated).not.toBeNull();

    // The updated graph should reflect the new function name
    const hasNewName = updated!.nodes.some((n) => n.symbol === "newName");
    expect(hasNewName).toBe(true);
  });

  it("retains original hash for files that have not changed", async () => {
    const tmpDir = await makeTmpDir();
    await mkdir(join(tmpDir, "src"), { recursive: true });
    const unchangedPath = join(tmpDir, "src", "stable.ts");
    const changedPath = join(tmpDir, "src", "changed.ts");
    await writeFile(unchangedPath, `export const stable = true;`);
    await writeFile(changedPath, `export const version = 1;`);

    const initial = await buildGraph(tmpDir);
    expect(initial).not.toBeNull();
    await saveGraph(tmpDir, initial!);

    const stableNodeBefore = initial!.nodes.find((n) => n.file === "src/stable.ts");

    // Modify only changed.ts
    await writeFile(changedPath, `export const version = 2;`);
    const updated = await updateGraph(tmpDir, ["src/changed.ts"]);
    expect(updated).not.toBeNull();

    const stableNodeAfter = updated!.nodes.find((n) => n.file === "src/stable.ts");

    // Stable file's hash should be unchanged
    if (stableNodeBefore?.hash !== undefined) {
      expect(stableNodeAfter?.hash).toBe(stableNodeBefore.hash);
    } else {
      // If no hash field, at least verify the stable node still exists
      expect(stableNodeAfter).toBeDefined();
    }
  });
});
