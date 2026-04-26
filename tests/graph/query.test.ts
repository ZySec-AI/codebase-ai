import { describe, it, expect } from "vitest";
import type { Graph } from "../../src/graph/types.js";
import {
  getCallers,
  getCallees,
  getImpactRadius,
  getEntrypoints,
  getDeadCode,
  getCycles,
  getOrphans,
} from "../../src/graph/query.js";

function buildFixtureGraph(): Graph {
  return {
    version: 1,
    root: "/project",
    generatedAt: new Date().toISOString(),
    nodes: [
      { id: "A.ts", file: "A.ts", kind: "file", name: "A.ts", exported: false },
      { id: "B.ts", file: "B.ts", kind: "file", name: "B.ts", exported: false },
      { id: "C.ts", file: "C.ts", kind: "file", name: "C.ts", exported: false },
      { id: "A.test.ts", file: "A.test.ts", kind: "file", name: "A.test.ts", exported: false },
    ],
    edges: [
      { from: "A.ts", to: "B.ts", kind: "imports" },
      { from: "B.ts", to: "C.ts", kind: "imports" },
      { from: "A.test.ts", to: "A.ts", kind: "test_covers" },
    ],
  };
}

describe("getCallers", () => {
  it("returns files that import the target file", () => {
    const graph = buildFixtureGraph();
    const callers = getCallers(graph, "B.ts");
    expect(callers).toContain("A.ts");
  });

  it("returns empty array when no callers exist", () => {
    const graph = buildFixtureGraph();
    const callers = getCallers(graph, "A.ts");
    expect(callers).toHaveLength(0);
  });
});

describe("getCallees", () => {
  it("returns files that the target file imports", () => {
    const graph = buildFixtureGraph();
    const callees = getCallees(graph, "A.ts");
    expect(callees).toContain("B.ts");
  });

  it("returns empty array when file imports nothing", () => {
    const graph = buildFixtureGraph();
    const callees = getCallees(graph, "C.ts");
    expect(callees).toHaveLength(0);
  });
});

describe("getImpactRadius", () => {
  it("returns direct callers when hops >= 1", () => {
    const graph = buildFixtureGraph();
    const result = getImpactRadius(graph, ["C.ts"], 2);
    expect(result.direct_callers).toContain("B.ts");
  });

  it("returns transitive callers when hops >= 2", () => {
    const graph = buildFixtureGraph();
    const result = getImpactRadius(graph, ["C.ts"], 2);
    expect(result.transitive_callers).toContain("A.ts");
  });

  it("returns covering tests for the target file", () => {
    const graph = buildFixtureGraph();
    const result = getImpactRadius(graph, ["A.ts"], 1);
    expect(result.covering_tests).toContain("A.test.ts");
  });

  it("risk_score is a non-negative number", () => {
    const graph = buildFixtureGraph();
    const result = getImpactRadius(graph, ["C.ts"], 2);
    expect(typeof result.risk_score).toBe("number");
    expect(result.risk_score).toBeGreaterThanOrEqual(0);
  });
});

describe("getEntrypoints", () => {
  it("returns files that are not imported by any other file", () => {
    const graph = buildFixtureGraph();
    const entrypoints = getEntrypoints(graph);
    // A.ts and A.test.ts are not imported by anyone
    expect(entrypoints).toContain("A.ts");
    expect(entrypoints).toContain("A.test.ts");
    // B.ts and C.ts are imported, so they are not entrypoints
    expect(entrypoints).not.toContain("B.ts");
    expect(entrypoints).not.toContain("C.ts");
  });
});

describe("getDeadCode", () => {
  it("flags files unreachable from any entry point as dead", () => {
    const graph: Graph = {
      version: 1,
      root: "/project",
      generatedAt: new Date().toISOString(),
      nodes: [
        { id: "A.ts", file: "A.ts", kind: "file", name: "A.ts", exported: false },
        { id: "B.ts", file: "B.ts", kind: "file", name: "B.ts", exported: false },
        { id: "Z.ts", file: "Z.ts", kind: "file", name: "Z.ts", exported: false },
      ],
      edges: [{ from: "A.ts", to: "B.ts", kind: "imports" }],
    } as unknown as Graph;
    const result = getDeadCode(graph, "/project");
    // A.ts and Z.ts have in-degree 0 → both seeds; B.ts is reached from A.ts.
    // None should be dead because Z.ts itself is a seed (in-degree 0).
    expect(result.dead_files).not.toContain("A.ts");
    expect(result.dead_files).not.toContain("B.ts");
    expect(result.dead_files).not.toContain("Z.ts");
    expect(result.reachable_files).toBe(3);
  });

  it("flags files only reachable from a non-seed as dead when graph has true dead branches", () => {
    // Make D.ts reachable only from a node that itself isn't a seed/reached
    const graph: Graph = {
      version: 1,
      root: "/project",
      generatedAt: new Date().toISOString(),
      nodes: [
        { id: "entry.ts", file: "entry.ts", kind: "file", name: "entry.ts", exported: false },
        { id: "live.ts", file: "live.ts", kind: "file", name: "live.ts", exported: false },
        { id: "dead1.ts", file: "dead1.ts", kind: "file", name: "dead1.ts", exported: false },
        { id: "dead2.ts", file: "dead2.ts", kind: "file", name: "dead2.ts", exported: false },
      ],
      edges: [
        { from: "entry.ts", to: "live.ts", kind: "imports" },
        // dead1 -> dead2 forms a cycle so neither has in-degree 0
        { from: "dead1.ts", to: "dead2.ts", kind: "imports" },
        { from: "dead2.ts", to: "dead1.ts", kind: "imports" },
      ],
    } as unknown as Graph;
    const result = getDeadCode(graph, "/project");
    expect(result.dead_files).toContain("dead1.ts");
    expect(result.dead_files).toContain("dead2.ts");
    expect(result.dead_files).not.toContain("entry.ts");
    expect(result.dead_files).not.toContain("live.ts");
  });
});

describe("getCycles", () => {
  it("returns empty array when graph is acyclic", () => {
    const graph: Graph = {
      version: 1,
      root: "/project",
      generatedAt: new Date().toISOString(),
      nodes: [
        { id: "A.ts", file: "A.ts", kind: "file", name: "A.ts", exported: false },
        { id: "B.ts", file: "B.ts", kind: "file", name: "B.ts", exported: false },
      ],
      edges: [{ from: "A.ts", to: "B.ts", kind: "imports" }],
    } as unknown as Graph;
    expect(getCycles(graph).count).toBe(0);
  });

  it("detects a 2-file cycle", () => {
    const graph: Graph = {
      version: 1,
      root: "/project",
      generatedAt: new Date().toISOString(),
      nodes: [
        { id: "A.ts", file: "A.ts", kind: "file", name: "A.ts", exported: false },
        { id: "B.ts", file: "B.ts", kind: "file", name: "B.ts", exported: false },
      ],
      edges: [
        { from: "A.ts", to: "B.ts", kind: "imports" },
        { from: "B.ts", to: "A.ts", kind: "imports" },
      ],
    } as unknown as Graph;
    const result = getCycles(graph);
    expect(result.count).toBe(1);
    expect(result.cycles[0].sort()).toEqual(["A.ts", "B.ts"]);
  });

  it("detects a 3-file cycle", () => {
    const graph: Graph = {
      version: 1,
      root: "/project",
      generatedAt: new Date().toISOString(),
      nodes: [
        { id: "A.ts", file: "A.ts", kind: "file", name: "A.ts", exported: false },
        { id: "B.ts", file: "B.ts", kind: "file", name: "B.ts", exported: false },
        { id: "C.ts", file: "C.ts", kind: "file", name: "C.ts", exported: false },
      ],
      edges: [
        { from: "A.ts", to: "B.ts", kind: "imports" },
        { from: "B.ts", to: "C.ts", kind: "imports" },
        { from: "C.ts", to: "A.ts", kind: "imports" },
      ],
    } as unknown as Graph;
    const result = getCycles(graph);
    expect(result.count).toBe(1);
    expect(result.cycles[0].sort()).toEqual(["A.ts", "B.ts", "C.ts"]);
  });
});

describe("getOrphans", () => {
  it("returns files with no in or out edges", () => {
    const graph: Graph = {
      version: 1,
      root: "/project",
      generatedAt: new Date().toISOString(),
      nodes: [
        { id: "A.ts", file: "A.ts", kind: "file", name: "A.ts", exported: false },
        { id: "B.ts", file: "B.ts", kind: "file", name: "B.ts", exported: false },
        { id: "lonely.ts", file: "lonely.ts", kind: "file", name: "lonely.ts", exported: false },
      ],
      edges: [{ from: "A.ts", to: "B.ts", kind: "imports" }],
    } as unknown as Graph;
    const result = getOrphans(graph, "/project");
    expect(result.orphans).toContain("lonely.ts");
    expect(result.orphans).not.toContain("A.ts");
    expect(result.orphans).not.toContain("B.ts");
  });
});
