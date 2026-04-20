import { describe, it, expect } from "vitest";
import type { Graph } from "../../src/graph/types.js";
import { getCallers, getCallees, getImpactRadius, getEntrypoints } from "../../src/graph/query.js";

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
