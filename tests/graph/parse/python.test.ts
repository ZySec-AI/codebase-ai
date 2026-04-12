import { describe, it, expect } from "vitest";
import type { GraphNode, GraphEdge } from "../../../src/graph/types.js";
import { parsePython } from "../../../src/graph/parse/python.js";

describe("parsePython", () => {
  describe("import edges", () => {
    it("creates import edge for relative import", () => {
      const content = `from .utils import helper`;
      const { edges } = parsePython("src/service.py", content, "/project");
      const importEdge = edges.find((e: GraphEdge) => e.kind === "imports");
      expect(importEdge).toBeDefined();
      expect(importEdge!.from).toBe("src/service.py");
      expect(importEdge!.to).toMatch(/utils/);
    });

    it("does not create internal edge for stdlib import", () => {
      const content = `import os`;
      const { edges } = parsePython("src/service.py", content, "/project");
      const importEdges = edges.filter((e: GraphEdge) => e.kind === "imports");
      expect(importEdges).toHaveLength(0);
    });
  });

  describe("function nodes", () => {
    it("detects function definition and creates function node", () => {
      const content = `def process_data(records: list) -> dict:\n    pass`;
      const { nodes } = parsePython("src/service.py", content, "/project");
      const fn = nodes.find((n: GraphNode) => n.symbol === "process_data");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
    });
  });

  describe("class nodes", () => {
    it("detects class definition and creates class node", () => {
      const content = `class DataProcessor(BaseModel):\n    pass`;
      const { nodes } = parsePython("src/processor.py", content, "/project");
      const cls = nodes.find((n: GraphNode) => n.symbol === "DataProcessor");
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe("class");
    });
  });

  describe("test file heuristics", () => {
    it("marks test function as test node and adds test_covers edge for test file", () => {
      const content = `def test_process():\n    assert True`;
      const { nodes, edges } = parsePython("test_utils.py", content, "/project");
      const testNode = nodes.find((n: GraphNode) => n.symbol === "test_process");
      expect(testNode).toBeDefined();
      expect(testNode!.kind).toBe("test");
      const coverEdge = edges.find((e: GraphEdge) => e.kind === "test_covers");
      expect(coverEdge).toBeDefined();
      expect(coverEdge!.to).toMatch(/utils/);
    });
  });
});
