import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type { ParseResult, GraphNode, GraphEdge } from "../types.js";
import { toRelFile } from "./index.js";

/**
 * Read the module path from go.mod in or above `dir`.
 */
function readModulePath(root: string): string | null {
  const goModPath = join(root, "go.mod");
  if (!existsSync(goModPath)) {
    return null;
  }
  try {
    const content = readFileSync(goModPath, "utf8");
    const m = /^module\s+([\w./\-]+)/m.exec(content);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function isInternalImport(importPath: string, modulePath: string | null): boolean {
  if (!modulePath) {
    return false;
  }
  return importPath === modulePath || importPath.startsWith(modulePath + "/");
}

function isTestFile(relPath: string): boolean {
  return relPath.endsWith("_test.go");
}

export function parseGo(filePath: string, content: string, root: string): ParseResult {
  const relFile = toRelFile(filePath, root);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const lines = content.split("\n");
  const modulePath = readModulePath(root);
  const isTest = isTestFile(relFile);

  // ---- File node ----
  nodes.push({
    id: relFile,
    file: relFile,
    kind: "file",
    exported: false,
    language: "go",
  });

  // ---- Import detection ----
  // Single: import "pkg/path" / import alias "pkg/path"
  const singleImportRe = /^\s*import\s+(?:(\w+)\s+)?["']([^"']+)["']/;
  // Block import
  const importBlockStartRe = /^\s*import\s*\(/;
  const importBlockEndRe = /^\s*\)/;
  const blockImportLineRe = /^\s*(?:(\w+)\s+)?["']([^"']+)["']/;

  let inImportBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (importBlockStartRe.test(line)) {
      inImportBlock = true;
      continue;
    }

    if (inImportBlock) {
      if (importBlockEndRe.test(line)) {
        inImportBlock = false;
        continue;
      }
      const bm = blockImportLineRe.exec(line);
      if (bm) {
        const importPath = bm[2];
        const internal = isInternalImport(importPath, modulePath);
        if (internal) {
          // Convert import path to relative file path (best-effort)
          const relMod = modulePath ? importPath.slice(modulePath.length + 1) : importPath;
          const candidate = relMod.replace(/\//g, "/");
          edges.push({ from: relFile, to: candidate, kind: "imports" });
        } else {
          edges.push({ from: relFile, to: importPath, kind: "imports" });
        }
      }
      continue;
    }

    const sm = singleImportRe.exec(line);
    if (sm) {
      const importPath = sm[2];
      const internal = isInternalImport(importPath, modulePath);
      if (internal) {
        const relMod = modulePath ? importPath.slice(modulePath.length + 1) : importPath;
        edges.push({ from: relFile, to: relMod, kind: "imports" });
      } else {
        edges.push({ from: relFile, to: importPath, kind: "imports" });
      }
    }
  }

  // ---- Declaration detection ----

  // func FooBar( / func (r *Receiver) FooBar(
  const funcRe = /^func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/;
  // type FooBar struct
  const structRe = /^type\s+(\w+)\s+struct\b/;
  // type FooBar interface
  const interfaceRe = /^type\s+(\w+)\s+interface\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    const funcMatch = funcRe.exec(line);
    if (funcMatch) {
      const name = funcMatch[1];
      const exported = /^[A-Z]/.test(name);
      const isTestFn = isTest && /^Test[A-Z]/.test(name);
      nodes.push({
        id: `${relFile}:${name}`,
        file: relFile,
        symbol: name,
        kind: isTestFn ? "test" : "function",
        exported,
        line: lineNo,
        language: "go",
      });
      if (isTestFn) {
        // Heuristic: test covers sibling package files in same dir
        const dir = dirname(relFile);
        const packageFile = dir === "." ? "" : dir;
        edges.push({ from: relFile, to: packageFile || relFile, kind: "test_covers" });
      }
      continue;
    }

    const structMatch = structRe.exec(line);
    if (structMatch) {
      const name = structMatch[1];
      const exported = /^[A-Z]/.test(name);
      nodes.push({
        id: `${relFile}:${name}`,
        file: relFile,
        symbol: name,
        kind: "struct",
        exported,
        line: lineNo,
        language: "go",
      });
      continue;
    }

    const ifaceMatch = interfaceRe.exec(line);
    if (ifaceMatch) {
      const name = ifaceMatch[1];
      const exported = /^[A-Z]/.test(name);
      nodes.push({
        id: `${relFile}:${name}`,
        file: relFile,
        symbol: name,
        kind: "trait",
        exported,
        line: lineNo,
        language: "go",
      });
      continue;
    }
  }

  // ---- Call site detection ----
  // Collect local symbol names
  const localSymbols = new Set(
    nodes.filter((n) => n.symbol !== undefined).map((n) => n.symbol as string)
  );

  const callRe = /\b(\w+)\s*\(/g;
  for (const line of lines) {
    if (/^(?:func|type|import)\s/.test(line)) {
      continue;
    }
    let cm: RegExpExecArray | null;
    while ((cm = callRe.exec(line)) !== null) {
      const callee = cm[1];
      if (localSymbols.has(callee)) {
        edges.push({ from: relFile, to: `${relFile}:${callee}`, kind: "calls" });
      }
    }
  }

  return { nodes, edges };
}
