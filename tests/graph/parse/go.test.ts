import { describe, it, expect } from "vitest";
import type { GraphNode, GraphEdge } from "../../../src/graph/types.js";
import { parseGo } from "../../../src/graph/parse/go.js";

describe("parseGo", () => {
  describe("import edges", () => {
    it("parses multi-line import block and creates edges for each import", () => {
      const content = `package main

import (
  "fmt"
  "github.com/myorg/myapp/internal/handler"
  "github.com/myorg/myapp/internal/store"
)`;
      const { edges } = parseGo("cmd/server/main.go", content, "/project");
      // At least the internal imports should produce edges
      const importEdges = edges.filter((e: GraphEdge) => e.kind === "imports");
      expect(importEdges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("function nodes", () => {
    it("detects exported function (uppercase) and marks it exported: true", () => {
      const content = `func HandleRequest(w http.ResponseWriter, r *http.Request) {}`;
      const { nodes } = parseGo("internal/handler/handler.go", content, "/project");
      const fn = nodes.find((n: GraphNode) => n.symbol === "HandleRequest");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
      expect(fn!.exported).toBe(true);
    });

    it("detects unexported function (lowercase) and marks it exported: false", () => {
      const content = `func helperFn(x int) int { return x }`;
      const { nodes } = parseGo("internal/handler/handler.go", content, "/project");
      const fn = nodes.find((n: GraphNode) => n.symbol === "helperFn");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
      expect(fn!.exported).toBe(false);
    });
  });

  describe("struct nodes", () => {
    it("detects struct definition and creates struct node", () => {
      const content = `type Server struct {\n  port int\n}`;
      const { nodes } = parseGo("internal/server/server.go", content, "/project");
      const s = nodes.find((n: GraphNode) => n.symbol === "Server");
      expect(s).toBeDefined();
      expect(s!.kind).toBe("struct");
    });
  });

  describe("test file heuristics", () => {
    it("detects test function in _test.go file as test node", () => {
      const content = `func TestFoo(t *testing.T) {}`;
      const { nodes } = parseGo("internal/handler/handler_test.go", content, "/project");
      const testNode = nodes.find((n: GraphNode) => n.symbol === "TestFoo");
      expect(testNode).toBeDefined();
      expect(testNode!.kind).toBe("test");
    });
  });
});
