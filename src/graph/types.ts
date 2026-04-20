export interface GraphNode {
  id: string; // "<file>:<symbol>" or "<file>" for file nodes
  file: string; // relative path from project root
  symbol?: string; // function/class/struct name, undefined for file-level
  kind: "function" | "class" | "struct" | "trait" | "impl" | "enum" | "module" | "file" | "test";
  exported: boolean;
  line?: number; // 1-based line number of declaration
  hash?: string; // content hash of the file, used for incremental updates
  language: "typescript" | "javascript" | "python" | "go" | "rust" | "unknown";
}

export interface GraphEdge {
  from: string; // node id
  to: string; // node id or "<file>" if unresolved
  kind: "imports" | "calls" | "extends" | "implements" | "test_covers";
}

export interface Graph {
  version: 1;
  root: string; // absolute project root
  built_at: string; // ISO timestamp
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ImpactResult {
  changed: string[]; // input files
  direct_callers: string[]; // files that directly import/call changed files
  transitive_callers: string[]; // files reachable via further hops
  covering_tests: string[]; // test files that cover the changed symbols
  risk_score: number; // 0–100: higher = more callers + exported symbols
}

export interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
