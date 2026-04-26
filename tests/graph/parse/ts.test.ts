import { describe, it, expect } from "vitest";
import type { GraphNode, GraphEdge } from "../../../src/graph/types.js";
import { parseTs } from "../../../src/graph/parse/ts.js";

describe("parseTs", () => {
  describe("import edges", () => {
    it("detects named import and creates imports edge to resolved file", () => {
      const content = `import { foo } from './bar';`;
      const { edges } = parseTs("src/app.ts", content, "/project");
      const importEdge = edges.find((e: GraphEdge) => e.kind === "imports");
      expect(importEdge).toBeDefined();
      expect(importEdge!.from).toBe("src/app.ts");
      expect(importEdge!.to).toMatch(/bar/);
    });

    it("detects re-export and creates edge to utils file", () => {
      const content = `export { x } from './utils';`;
      const { edges } = parseTs("src/index.ts", content, "/project");
      const reExportEdge = edges.find((e: GraphEdge) => e.kind === "imports");
      expect(reExportEdge).toBeDefined();
      expect(reExportEdge!.to).toMatch(/utils/);
    });

    it("detects multi-line braced import (regression for dead-code false positives)", () => {
      const content = [
        "import {",
        "  createIssue,",
        "  closeIssue,",
        "  listIssues,",
        "} from './issues.js';",
        "",
        "export function run() {",
        "  createIssue();",
        "  closeIssue();",
        "}",
      ].join("\n");
      const { edges } = parseTs("src/cmd.ts", content, "/project");
      const importEdges = edges.filter((e: GraphEdge) => e.kind === "imports");
      expect(importEdges.length).toBeGreaterThan(0);
      expect(importEdges[0].to).toMatch(/issues/);
      // Calls edges should resolve to the imported file's symbols
      const callEdge = edges.find(
        (e: GraphEdge) => e.kind === "calls" && e.to.includes("createIssue")
      );
      expect(callEdge).toBeDefined();
    });

    it("preserves declaration line numbers when collapsing multi-line imports", () => {
      const content = [
        "import {", // line 1
        "  a,", // line 2
        "  b,", // line 3
        "} from './x';", // line 4
        "", // line 5
        "export function target() {}", // line 6
      ].join("\n");
      const { nodes } = parseTs("src/f.ts", content, "/project");
      const fn = nodes.find((n: GraphNode) => n.symbol === "target");
      expect(fn).toBeDefined();
      expect(fn!.line).toBe(6);
    });
  });

  describe("function nodes", () => {
    it("detects exported function and marks it exported: true", () => {
      const content = `export function doSomething(arg: string): void {}`;
      const { nodes } = parseTs("src/service.ts", content, "/project");
      const fn = nodes.find((n: GraphNode) => n.symbol === "doSomething");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
      expect(fn!.exported).toBe(true);
    });

    it("detects local function and marks it exported: false", () => {
      const content = `function localHelper(x: number): number { return x; }`;
      const { nodes } = parseTs("src/service.ts", content, "/project");
      const fn = nodes.find((n: GraphNode) => n.symbol === "localHelper");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
      expect(fn!.exported).toBe(false);
    });
  });

  describe("class nodes", () => {
    it("detects exported class and marks it exported: true", () => {
      const content = `export class MyService { constructor() {} }`;
      const { nodes } = parseTs("src/service.ts", content, "/project");
      const cls = nodes.find((n: GraphNode) => n.symbol === "MyService");
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe("class");
      expect(cls!.exported).toBe(true);
    });
  });

  describe("declaration files", () => {
    it("returns empty nodes and edges for .d.ts files", () => {
      const content = `export declare function doSomething(): void;`;
      const { nodes, edges } = parseTs("src/types.d.ts", content, "/project");
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });
  });
});
