import type { Graph, ImpactResult, GraphNode } from "./types.js";
import { detectEntrypoints } from "./entrypoints.js";

export interface DeadCodeResult {
  dead_files: string[];
  dead_exports: Array<{
    file: string;
    symbol: string;
    kind: string;
    line?: number;
    confidence: "high" | "low";
  }>;
  entrypoints: string[];
  reachable_files: number;
  total_files: number;
  notes: string;
}

export interface CyclesResult {
  cycles: string[][];
  count: number;
}

export interface OrphansResult {
  orphans: string[];
  count: number;
}

function fileOf(id: string): string {
  return id.includes(":") ? id.split(":")[0] : id;
}

/**
 * Normalize an edge endpoint to a real node file path. ESM TS imports use
 * `.js` specifiers but nodes are `.ts`/`.tsx`; try those swaps before giving up.
 */
function resolveToFile(raw: string, fileSet: Set<string>): string | null {
  if (fileSet.has(raw)) {
    return raw;
  }
  if (raw.endsWith(".js")) {
    const base = raw.slice(0, -3);
    for (const ext of [".ts", ".tsx", ".jsx"]) {
      if (fileSet.has(base + ext)) {
        return base + ext;
      }
    }
  }
  if (raw.endsWith(".mjs")) {
    const base = raw.slice(0, -4);
    if (fileSet.has(base + ".ts")) {
      return base + ".ts";
    }
  }
  return null;
}

function buildForwardFileIndex(graph: Graph, fileSet?: Set<string>): Map<string, Set<string>> {
  const fs = fileSet ?? new Set(graph.nodes.map((n) => n.file));
  const index = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== "imports" && edge.kind !== "calls") {
      continue;
    }
    const from = fileOf(edge.from);
    const toRaw = fileOf(edge.to);
    const to = resolveToFile(toRaw, fs);
    if (!to || from === to) {
      continue;
    }
    if (!index.has(from)) {
      index.set(from, new Set());
    }
    index.get(from)!.add(to);
  }
  return index;
}

/**
 * Build a reverse-import index: file -> set of files that import it.
 */
function buildReverseIndex(graph: Graph): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const edge of graph.edges) {
    if (edge.kind !== "imports" && edge.kind !== "calls") {
      continue;
    }

    // Normalise edge.to to a file path (strip symbol part if present)
    const toFile = edge.to.includes(":") ? edge.to.split(":")[0] : edge.to;
    const fromFile = edge.from.includes(":") ? edge.from.split(":")[0] : edge.from;

    if (!index.has(toFile)) {
      index.set(toFile, new Set());
    }
    index.get(toFile)!.add(fromFile);
  }

  return index;
}

/**
 * All files that import or call symbols defined in `targetFiles`.
 * Returns up to `hops` transitive steps (default 2).
 */
export function getImpactRadius(graph: Graph, targetFiles: string[], hops = 2): ImpactResult {
  const reverseIndex = buildReverseIndex(graph);

  const directCallers = new Set<string>();
  const transitiveCallers = new Set<string>();
  const visited = new Set<string>(targetFiles);

  // Hop 1: direct callers
  for (const file of targetFiles) {
    const callers = reverseIndex.get(file);
    if (callers) {
      for (const caller of callers) {
        if (!visited.has(caller)) {
          directCallers.add(caller);
          visited.add(caller);
        }
      }
    }
  }

  // Hop 2+ : transitive callers
  if (hops >= 2) {
    const frontier = Array.from(directCallers);
    for (let hop = 2; hop <= hops; hop++) {
      const nextFrontier: string[] = [];
      for (const file of frontier) {
        const callers = reverseIndex.get(file);
        if (callers) {
          for (const caller of callers) {
            if (!visited.has(caller)) {
              transitiveCallers.add(caller);
              visited.add(caller);
              nextFrontier.push(caller);
            }
          }
        }
      }
      if (nextFrontier.length === 0) {
        break;
      }
    }
  }

  const coveringTests = getCoveringTests(graph, targetFiles);

  // Count exported symbols in changed files
  const targetSet = new Set(targetFiles);
  const exportedSymbolsChanged = graph.nodes.filter(
    (n) => targetSet.has(n.file) && n.exported && n.symbol !== undefined
  ).length;

  const riskScore = Math.min(100, directCallers.size * 10 + exportedSymbolsChanged * 5);

  return {
    changed: targetFiles,
    direct_callers: Array.from(directCallers),
    transitive_callers: Array.from(transitiveCallers),
    covering_tests: coveringTests,
    risk_score: riskScore,
  };
}

/**
 * Return covering test files for the given target files.
 */
export function getCoveringTests(graph: Graph, targetFiles: string[]): string[] {
  const targetSet = new Set(targetFiles);
  const tests = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.kind !== "test_covers") {
      continue;
    }
    const toFile = edge.to.includes(":") ? edge.to.split(":")[0] : edge.to;
    if (targetSet.has(toFile)) {
      const fromFile = edge.from.includes(":") ? edge.from.split(":")[0] : edge.from;
      tests.add(fromFile);
    }
  }

  return Array.from(tests);
}

/**
 * Return all files that directly import the given file.
 */
export function getCallers(graph: Graph, file: string): string[] {
  const callers = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "imports" && edge.kind !== "calls") {
      continue;
    }
    const toFile = edge.to.includes(":") ? edge.to.split(":")[0] : edge.to;
    if (toFile === file) {
      const fromFile = edge.from.includes(":") ? edge.from.split(":")[0] : edge.from;
      if (fromFile !== file) {
        callers.add(fromFile);
      }
    }
  }
  return Array.from(callers);
}

/**
 * Return all files that the given file imports.
 */
export function getCallees(graph: Graph, file: string): string[] {
  const callees = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "imports" && edge.kind !== "calls") {
      continue;
    }
    const fromFile = edge.from.includes(":") ? edge.from.split(":")[0] : edge.from;
    if (fromFile === file) {
      const toFile = edge.to.includes(":") ? edge.to.split(":")[0] : edge.to;
      if (toFile !== file) {
        callees.add(toFile);
      }
    }
  }
  return Array.from(callees);
}

/**
 * Return all nodes that represent a symbol matching the query string
 * (substring match on symbol name).
 */
export function querySymbol(graph: Graph, query: string): GraphNode[] {
  const lower = query.toLowerCase();
  return graph.nodes.filter(
    (n) => n.symbol !== undefined && n.symbol.toLowerCase().includes(lower)
  );
}

/**
 * Return all detected entry points in the graph
 * (nodes where no other node imports them — i.e. in-degree 0 in the import graph).
 */
export function getEntrypoints(graph: Graph): string[] {
  const allFiles = new Set(graph.nodes.map((n) => n.file));

  // Build set of files that are imported by something
  const imported = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "imports") {
      continue;
    }
    const toFile = edge.to.includes(":") ? edge.to.split(":")[0] : edge.to;
    if (allFiles.has(toFile)) {
      imported.add(toFile);
    }
  }

  // Files with in-degree 0
  const entrypoints = new Set<string>();
  for (const file of allFiles) {
    if (!imported.has(file)) {
      entrypoints.add(file);
    }
  }

  return Array.from(entrypoints);
}

/**
 * Reachability BFS from project entry points. Files (and exports) never reached
 * are reported as dead. Combines well-known entry points (`detectEntrypoints`)
 * with graph in-degree-0 files so we don't drop genuinely-orphaned roots.
 */
export function getDeadCode(graph: Graph, root: string): DeadCodeResult {
  const allFiles = Array.from(new Set(graph.nodes.map((n) => n.file)));
  const detected = detectEntrypoints(allFiles, root);
  const inDegreeZero = getEntrypoints(graph);
  const seeds = new Set<string>([...detected, ...inDegreeZero]);

  const fileSet = new Set(allFiles);
  const forward = buildForwardFileIndex(graph, fileSet);
  const reachable = new Set<string>();
  const queue: string[] = [];
  for (const s of seeds) {
    if (fileSet.has(s) && !reachable.has(s)) {
      reachable.add(s);
      queue.push(s);
    }
  }
  while (queue.length > 0) {
    const f = queue.shift()!;
    const outs = forward.get(f);
    if (!outs) {
      continue;
    }
    for (const next of outs) {
      if (!fileSet.has(next) || reachable.has(next)) {
        continue;
      }
      reachable.add(next);
      queue.push(next);
    }
  }

  const deadFiles = allFiles.filter((f) => !reachable.has(f));

  // Index 1: which symbol IDs are explicitly called from another file?
  const referencedSymbolIds = new Set<string>();
  // Index 2: which files have at least one external importer? (regex parsers
  // miss property-access calls like `mod.fn()`, so we treat any importer as
  // a potential symbol reference and downgrade those exports to "low" confidence.)
  const importedFiles = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind === "calls" && fileOf(edge.from) !== fileOf(edge.to)) {
      referencedSymbolIds.add(edge.to);
    } else if (edge.kind === "imports") {
      const to = resolveToFile(fileOf(edge.to), fileSet) ?? fileOf(edge.to);
      if (fileOf(edge.from) !== to) {
        importedFiles.add(to);
      }
    }
  }

  const deadExports: DeadCodeResult["dead_exports"] = [];
  for (const node of graph.nodes) {
    if (!node.exported || !node.symbol) {
      continue;
    }
    if (!reachable.has(node.file)) {
      continue; // already counted via dead_files
    }
    if (referencedSymbolIds.has(node.id)) {
      continue; // explicitly called from another file
    }
    // No direct call edge — but if the file is imported anywhere, the symbol
    // might be reached via property access the regex parser can't see.
    const confidence: "high" | "low" = importedFiles.has(node.file) ? "low" : "high";
    deadExports.push({
      file: node.file,
      symbol: node.symbol,
      kind: node.kind,
      ...(node.line !== undefined ? { line: node.line } : {}),
      confidence,
    });
  }

  // Sort: high confidence first, then by file
  deadExports.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === "high" ? -1 : 1;
    }
    return a.file.localeCompare(b.file);
  });

  return {
    dead_files: deadFiles,
    dead_exports: deadExports,
    notes:
      "Dead-export detection uses regex AST-lite parsing — property-access calls (mod.fn()) are not tracked. 'high' confidence: declaring file has no importers. 'low' confidence: file is imported but no explicit call edge — likely a false positive when dispatch happens via namespace property access.",
    entrypoints: Array.from(seeds),
    reachable_files: reachable.size,
    total_files: allFiles.length,
  };
}

/**
 * Detect import cycles (strongly-connected components > 1) in the file-level
 * import graph. Iterative Tarjan's algorithm — safe on large graphs.
 */
export function getCycles(graph: Graph): CyclesResult {
  const forward = buildForwardFileIndex(graph);
  const allFiles = new Set<string>([...graph.nodes.map((n) => n.file), ...forward.keys()]);

  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  for (const start of allFiles) {
    if (indices.has(start)) {
      continue;
    }
    // Iterative DFS using an explicit work stack of (node, iterator-state)
    const work: Array<{ v: string; succ: string[]; i: number }> = [];
    const seed = (v: string): void => {
      indices.set(v, index);
      lowlinks.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);
      work.push({ v, succ: Array.from(forward.get(v) ?? []), i: 0 });
    };
    seed(start);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame.i < frame.succ.length) {
        const w = frame.succ[frame.i++];
        if (!allFiles.has(w)) {
          continue;
        }
        if (!indices.has(w)) {
          seed(w);
        } else if (onStack.has(w)) {
          lowlinks.set(frame.v, Math.min(lowlinks.get(frame.v)!, indices.get(w)!));
        }
      } else {
        // Post-order: maybe pop an SCC
        if (lowlinks.get(frame.v) === indices.get(frame.v)) {
          const scc: string[] = [];
          while (true) {
            const w = stack.pop()!;
            onStack.delete(w);
            scc.push(w);
            if (w === frame.v) {
              break;
            }
          }
          // Real cycle: SCC of size >= 2, or self-loop
          if (scc.length > 1 || (forward.get(frame.v)?.has(frame.v) ?? false)) {
            cycles.push(scc.sort());
          }
        }
        work.pop();
        if (work.length > 0) {
          const parent = work[work.length - 1];
          lowlinks.set(parent.v, Math.min(lowlinks.get(parent.v)!, lowlinks.get(frame.v)!));
        }
      }
    }
  }

  return { cycles, count: cycles.length };
}

/**
 * Files with zero imports in AND zero imports out — likely forgotten scratch
 * files. Excludes detected entry points and test files (which legitimately
 * have no importers).
 */
export function getOrphans(graph: Graph, root: string): OrphansResult {
  const allFiles = Array.from(new Set(graph.nodes.map((n) => n.file)));
  const fileSet = new Set(allFiles);
  const entrypointSet = new Set(detectEntrypoints(allFiles, root));

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const f of allFiles) {
    inDegree.set(f, 0);
    outDegree.set(f, 0);
  }
  for (const edge of graph.edges) {
    if (edge.kind !== "imports" && edge.kind !== "calls") {
      continue;
    }
    const from = fileOf(edge.from);
    const toRaw = fileOf(edge.to);
    const to = resolveToFile(toRaw, fileSet);
    if (!to || from === to) {
      continue;
    }
    if (outDegree.has(from)) {
      outDegree.set(from, outDegree.get(from)! + 1);
    }
    if (inDegree.has(to)) {
      inDegree.set(to, inDegree.get(to)! + 1);
    }
  }

  const orphans = allFiles
    .filter(
      (f) => !entrypointSet.has(f) && (inDegree.get(f) ?? 0) === 0 && (outDegree.get(f) ?? 0) === 0
    )
    .sort();

  return { orphans, count: orphans.length };
}
