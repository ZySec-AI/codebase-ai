import type { Graph, ImpactResult, GraphNode } from "./types.js";

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
