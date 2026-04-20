import { relative, dirname, resolve, extname } from "node:path";
import type { ParseResult, GraphNode, GraphEdge } from "../types.js";
import { toRelFile } from "./index.js";

/**
 * Resolve a TS/JS import specifier to a relative-from-root file path.
 * Returns null for external (bare) imports.
 */
function resolveImport(specifier: string, fromFile: string, root: string): string | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return null; // external
  }
  const fromDir = dirname(resolve(root, fromFile));
  const absPath = resolve(fromDir, specifier);
  const rel = relative(root, absPath);
  // Normalise: if no extension, try adding .ts / .tsx / .js / .jsx
  if (!extname(rel)) {
    return rel; // let the caller handle resolution; store as-is
  }
  return rel;
}

// ---- Module-level regex constants ----

// static import/export-from: import ... from 'specifier'
const staticImportRe =
  /^\s*(?:import|export)\s+(?:(?:type\s+)?(?:\*\s+as\s+\w+|\{[^}]*\}|\w+)(?:\s*,\s*(?:\{[^}]*\}|\w+))*\s+from\s+)?['"]([^'"]+)['"]/;
// export { x } from './foo'
const reExportRe = /^\s*export\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/;
// require('./foo')
const requireRe = /(?:^|[^.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/;
// dynamic import('./foo')
const dynamicImportRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/;
// export function / export async function / export default function
const exportFnRe = /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/;
// plain function
const plainFnRe = /^\s*(?:async\s+)?function\s+(\w+)/;
// export class / class
const exportClassRe = /^\s*(export\s+)?(?:abstract\s+)?class\s+(\w+)/;
// export const/let foo = / export const foo = (
const exportVarRe = /^\s*export\s+(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=/;
// unexported const/let (top-level arrow functions)
const unexportedVarRe = /^\s*(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=/;
// top-level const/let/var guard
const topLevelVarRe = /^(?:const|let|var)\s/;
// import alias: import * as X / import { a, b } / import Def from
const aliasRe = /^\s*import\s+(?:(?:\*\s+as\s+(\w+)|\{([^}]*)\}|(\w+)))\s+from\s+['"]([^'"]+)['"]/;
// call site: identifier(
const callRe = /\b(\w+)\s*\(/g;
// skip import/export lines in call scanning
const importExportLineRe = /^\s*(import|export)\s/;

/**
 * Parse a TypeScript or JavaScript file and return nodes + edges.
 */
export function parseTs(filePath: string, content: string, root: string): ParseResult {
  // Skip TypeScript declaration files — they have no runtime call graph
  if (filePath.endsWith(".d.ts")) {
    return { nodes: [], edges: [] };
  }

  const relFile = toRelFile(filePath, root);
  const ext = extname(filePath).toLowerCase();
  const language: GraphNode["language"] =
    ext === ".ts" || ext === ".tsx" ? "typescript" : "javascript";

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const lines = content.split("\n");

  // ---- Import detection ----

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let specifier: string | null = null;

    const staticMatch = staticImportRe.exec(line);
    if (staticMatch) {
      specifier = staticMatch[1];
    }

    const reExportMatch = !specifier ? reExportRe.exec(line) : null;
    if (reExportMatch) {
      specifier = reExportMatch[1];
    }

    const requireMatch = !specifier ? requireRe.exec(line) : null;
    if (requireMatch) {
      specifier = requireMatch[1];
    }

    const dynMatch = !specifier ? dynamicImportRe.exec(line) : null;
    if (dynMatch) {
      specifier = dynMatch[1];
    }

    if (specifier) {
      const resolved = resolveImport(specifier, relFile, root);
      const toId = resolved !== null ? resolved : specifier;
      edges.push({
        from: relFile,
        to: toId,
        kind: "imports",
      });
    }
  }

  // ---- Declaration detection ----

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // exported function
    const efMatch = exportFnRe.exec(line);
    if (efMatch) {
      nodes.push({
        id: `${relFile}:${efMatch[1]}`,
        file: relFile,
        symbol: efMatch[1],
        kind: "function",
        exported: true,
        line: lineNo,
        language,
      });
      continue;
    }

    // plain function
    const pfMatch = plainFnRe.exec(line);
    if (pfMatch) {
      nodes.push({
        id: `${relFile}:${pfMatch[1]}`,
        file: relFile,
        symbol: pfMatch[1],
        kind: "function",
        exported: false,
        line: lineNo,
        language,
      });
      continue;
    }

    // class
    const clMatch = exportClassRe.exec(line);
    if (clMatch) {
      const exported = Boolean(clMatch[1]);
      const name = clMatch[2];
      nodes.push({
        id: `${relFile}:${name}`,
        file: relFile,
        symbol: name,
        kind: "class",
        exported,
        line: lineNo,
        language,
      });
      continue;
    }

    // exported const/let (could be arrow function or plain value)
    const evMatch = exportVarRe.exec(line);
    if (evMatch) {
      nodes.push({
        id: `${relFile}:${evMatch[1]}`,
        file: relFile,
        symbol: evMatch[1],
        kind: "function",
        exported: true,
        line: lineNo,
        language,
      });
      continue;
    }

    // top-level unexported const/let (only at column 0 to avoid inner scope noise)
    if (topLevelVarRe.test(line)) {
      const uvMatch = unexportedVarRe.exec(line);
      if (uvMatch) {
        nodes.push({
          id: `${relFile}:${uvMatch[1]}`,
          file: relFile,
          symbol: uvMatch[1],
          kind: "function",
          exported: false,
          line: lineNo,
          language,
        });
      }
    }
  }

  // ---- File-level node ----
  nodes.unshift({
    id: relFile,
    file: relFile,
    kind: "file",
    exported: false,
    language,
  });

  // ---- Call site detection ----
  // We record calls from this file to imported symbols.
  // Build a set of imported aliases so we can detect call sites.
  const importedAliases = new Map<string, string>(); // alias -> resolved file or specifier

  // Re-scan for import aliases
  for (const line of lines) {
    const m = aliasRe.exec(line);
    if (!m) {
      continue;
    }
    const specifier = m[4];
    const resolved = resolveImport(specifier, relFile, root) ?? specifier;
    if (m[1]) {
      // * as Alias
      importedAliases.set(m[1], resolved);
    } else if (m[2]) {
      // { a, b as c }
      const parts = m[2].split(",").map((s) => s.trim());
      for (const part of parts) {
        const asParts = part.split(/\s+as\s+/);
        const alias = asParts[asParts.length - 1].trim();
        if (alias) {
          importedAliases.set(alias, resolved);
        }
      }
    } else if (m[3]) {
      // default import
      importedAliases.set(m[3], resolved);
    }
  }

  // Detect call sites: identifier(
  if (importedAliases.size > 0) {
    for (const line of lines) {
      // skip import/export lines
      if (importExportLineRe.test(line)) {
        continue;
      }
      callRe.lastIndex = 0;
      let cm: RegExpExecArray | null;
      while ((cm = callRe.exec(line)) !== null) {
        const callee = cm[1];
        if (importedAliases.has(callee)) {
          const toFile = importedAliases.get(callee)!;
          edges.push({
            from: relFile,
            to: `${toFile}:${callee}`,
            kind: "calls",
          });
        }
      }
    }
  }

  return { nodes, edges };
}
