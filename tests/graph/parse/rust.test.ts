import { describe, it, expect } from "vitest";
import type { GraphNode, GraphEdge } from "../../../src/graph/types.js";
import { parseRust } from "../../../src/graph/parse/rust.js";

describe("parseRust", () => {
  describe("import edges", () => {
    it("creates import edge for crate-internal use", () => {
      const content = `use crate::utils::helper;`;
      const { edges } = parseRust("src/service.rs", content, "/project");
      const importEdge = edges.find((e: GraphEdge) => e.kind === "imports");
      expect(importEdge).toBeDefined();
      expect(importEdge!.from).toBe("src/service.rs");
      expect(importEdge!.to).toMatch(/utils/);
    });

    it("does not create internal edge for std import", () => {
      const content = `use std::collections::HashMap;`;
      const { edges } = parseRust("src/service.rs", content, "/project");
      const importEdges = edges.filter((e: GraphEdge) => e.kind === "imports");
      expect(importEdges).toHaveLength(0);
    });
  });

  describe("function nodes", () => {
    it("detects pub fn and marks it exported: true", () => {
      const content = `pub fn process(input: &str) -> String { String::new() }`;
      const { nodes } = parseRust("src/service.rs", content, "/project");
      const fn = nodes.find((n: GraphNode) => n.symbol === "process");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
      expect(fn!.exported).toBe(true);
    });

    it("detects private fn and marks it exported: false", () => {
      const content = `fn private_helper(x: i32) -> i32 { x }`;
      const { nodes } = parseRust("src/service.rs", content, "/project");
      const fn = nodes.find((n: GraphNode) => n.symbol === "private_helper");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
      expect(fn!.exported).toBe(false);
    });
  });

  describe("struct nodes", () => {
    it("detects pub struct and creates struct node", () => {
      const content = `pub struct Config {\n  pub port: u16,\n}`;
      const { nodes } = parseRust("src/config.rs", content, "/project");
      const s = nodes.find((n: GraphNode) => n.symbol === "Config");
      expect(s).toBeDefined();
      expect(s!.kind).toBe("struct");
    });
  });

  describe("test nodes", () => {
    it("detects #[test] annotated function and creates test node", () => {
      const content = `#[test]\nfn test_process() {\n  assert!(true);\n}`;
      const { nodes } = parseRust("src/service.rs", content, "/project");
      const testNode = nodes.find((n: GraphNode) => n.symbol === "test_process");
      expect(testNode).toBeDefined();
      expect(testNode!.kind).toBe("test");
    });
  });
});
