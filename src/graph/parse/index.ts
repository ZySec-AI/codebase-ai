import { relative } from "node:path";
import { parseTs } from "./ts.js";
import { parsePython } from "./python.js";
import { parseGo } from "./go.js";
import { parseRust } from "./rust.js";
import type { ParseResult } from "../types.js";

/** Ensure we always have a root-relative path, regardless of whether filePath is absolute or already relative. */
export function toRelFile(filePath: string, root: string): string {
  if (filePath.startsWith("/") || filePath.match(/^[A-Za-z]:\\/)) {
    return relative(root, filePath);
  }
  return filePath;
}

export function parseFile(filePath: string, content: string, root: string): ParseResult {
  if (filePath.match(/\.[jt]sx?$/) && !filePath.endsWith(".d.ts")) {
    return parseTs(filePath, content, root);
  }
  if (filePath.endsWith(".py")) {
    return parsePython(filePath, content, root);
  }
  if (filePath.endsWith(".go")) {
    return parseGo(filePath, content, root);
  }
  if (filePath.endsWith(".rs")) {
    return parseRust(filePath, content, root);
  }
  return { nodes: [], edges: [] };
}
