import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { createHash } from "node:crypto";
import { buildGraph, loadGraph, saveGraph } from "./engine.js";
import { parseFile } from "./parse/index.js";
import type { Graph } from "./types.js";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

/**
 * Detect which files have changed by comparing stored hashes.
 * Returns relative paths (from root) of changed files.
 */
async function detectChangedFiles(graph: Graph, root: string): Promise<string[]> {
  const absRoot = resolve(root);

  // Build a map: relFile -> hash (use the first node from that file)
  const storedHashes = new Map<string, string>();
  for (const node of graph.nodes) {
    if (!storedHashes.has(node.file) && node.hash) {
      storedHashes.set(node.file, node.hash);
    }
  }

  const changed: string[] = [];

  await Promise.all(
    Array.from(storedHashes.entries()).map(async ([relFile, storedHash]) => {
      const absPath = join(absRoot, relFile);
      if (!existsSync(absPath)) {
        // File was deleted — mark as changed so it gets removed
        changed.push(relFile);
        return;
      }
      try {
        const content = await readFile(absPath, "utf8");
        const currentHash = hashContent(content);
        if (currentHash !== storedHash) {
          changed.push(relFile);
        }
      } catch {
        changed.push(relFile);
      }
    })
  );

  return changed;
}

/**
 * Incrementally update the graph by re-parsing only changed files.
 * If no graph exists yet, performs a full build.
 */
export async function updateGraph(root: string, changedFiles?: string[]): Promise<Graph> {
  const absRoot = resolve(root);
  const existing = await loadGraph(absRoot);

  if (!existing) {
    const graph = await buildGraph(absRoot);
    await saveGraph(absRoot, graph);
    return graph;
  }

  // Determine which files need re-parsing
  const filesToUpdate =
    changedFiles !== undefined
      ? changedFiles.map((f) => relative(absRoot, resolve(absRoot, f)))
      : await detectChangedFiles(existing, absRoot);

  if (filesToUpdate.length === 0) {
    return existing;
  }

  const changedSet = new Set(filesToUpdate);

  // Remove all nodes and edges belonging to changed files
  const filteredNodes = existing.nodes.filter((n) => !changedSet.has(n.file));
  const filteredEdges = existing.edges.filter(
    (e) => !changedSet.has(e.from) && !changedSet.has(e.to)
  );

  // Re-parse changed files (only those that still exist)
  const newNodes = [...filteredNodes];
  const newEdges = [...filteredEdges];

  await Promise.all(
    filesToUpdate.map(async (relFile) => {
      const absPath = join(absRoot, relFile);
      if (!existsSync(absPath)) {
        return;
      } // deleted file
      let content: string;
      try {
        content = await readFile(absPath, "utf8");
      } catch {
        return;
      }
      const hash = hashContent(content);
      const result = parseFile(absPath, content, absRoot);
      for (const node of result.nodes) {
        node.hash = hash;
        newNodes.push(node);
      }
      for (const edge of result.edges) {
        newEdges.push(edge);
      }
    })
  );

  const updated: Graph = {
    ...existing,
    built_at: new Date().toISOString(),
    nodes: newNodes,
    edges: newEdges,
  };

  await saveGraph(absRoot, updated);
  return updated;
}
