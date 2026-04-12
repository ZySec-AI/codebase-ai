import { readFile, writeFile, mkdir, rename, readdir } from "node:fs/promises";
import { existsSync, type Dirent } from "node:fs";
import { join, relative, resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import { parseFile } from "./parse/index.js";
import { detectEntrypoints } from "./entrypoints.js";
import type { Graph, GraphNode, GraphEdge } from "./types.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  "vendor",
  "target",
  "__pycache__",
  ".venv",
  "venv",
]);

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
]);

const GRAPH_DIR = ".codebase";
const GRAPH_FILE = "graph.json";
const GRAPH_TMP = "graph.json.tmp";

/**
 * Recursively walk a directory, skipping ignored dirs.
 * Returns absolute file paths.
 */
async function walkDir(dir: string, depth: number, maxDepth: number): Promise<string[]> {
  if (depth > maxDepth) {
    return [];
  }
  const results: string[] = [];
  let entries: Dirent<string>[];
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".codebase") {
      // skip hidden dirs/files except our own
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      const sub = await walkDir(fullPath, depth + 1, maxDepth);
      results.push(...sub);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Compute a short SHA-256 hash of file content.
 */
function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

/**
 * Build a complete call/import graph for the project rooted at `root`.
 */
export async function buildGraph(root: string): Promise<Graph> {
  const absRoot = resolve(root);
  const allFiles = await walkDir(absRoot, 0, 12);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  await Promise.all(
    allFiles.map(async (absPath) => {
      let content: string;
      try {
        content = await readFile(absPath, "utf8");
      } catch {
        return;
      }
      const hash = hashContent(content);
      const result = parseFile(absPath, content, absRoot);

      // Attach hash to all nodes from this file
      for (const node of result.nodes) {
        node.hash = hash;
        nodes.push(node);
      }
      for (const edge of result.edges) {
        edges.push(edge);
      }
    })
  );

  const relFiles = allFiles.map((f) => relative(absRoot, f));
  // detectEntrypoints is called for informational purposes; not stored in graph
  detectEntrypoints(relFiles, absRoot);

  return {
    version: 1,
    root: absRoot,
    built_at: new Date().toISOString(),
    nodes,
    edges,
  };
}

/**
 * Save graph to `.codebase/graph.json` atomically.
 */
export async function saveGraph(root: string, graph: Graph): Promise<void> {
  const absRoot = resolve(root);
  const dir = join(absRoot, GRAPH_DIR);
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, GRAPH_TMP);
  const finalPath = join(dir, GRAPH_FILE);
  await writeFile(tmpPath, JSON.stringify(graph, null, 2), "utf8");
  await rename(tmpPath, finalPath);
}

/**
 * Load graph from `.codebase/graph.json`. Returns null if not found or invalid.
 */
export async function loadGraph(root: string): Promise<Graph | null> {
  const absRoot = resolve(root);
  const graphPath = join(absRoot, GRAPH_DIR, GRAPH_FILE);
  if (!existsSync(graphPath)) {
    return null;
  }
  try {
    const raw = await readFile(graphPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Record<string, unknown>)["version"] === 1
    ) {
      return parsed as Graph;
    }
    return null;
  } catch {
    return null;
  }
}
