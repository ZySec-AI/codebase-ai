import { relative, dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { ParseResult, GraphNode, GraphEdge } from "../types.js";
import { toRelFile } from "./index.js";

function resolveModPath(modName: string, fromFile: string, root: string): string | null {
  const dir = dirname(resolve(root, fromFile));
  // foo.rs
  const rs = resolve(dir, `${modName}.rs`);
  if (existsSync(rs)) {
    return relative(root, rs);
  }
  // foo/mod.rs
  const modRs = resolve(dir, modName, "mod.rs");
  if (existsSync(modRs)) {
    return relative(root, modRs);
  }
  return null;
}

function isTestFile(relPath: string): boolean {
  return relPath.endsWith("_test.rs") || relPath === "tests.rs" || relPath.includes("/tests/");
}

/**
 * Expand `use foo::{bar, baz}` into ["foo::bar", "foo::baz"].
 * Handles one level of braces only.
 */
function expandUse(usePath: string): string[] {
  const braceMatch = /^([\w:]*::\{([^}]+)\})$/.exec(usePath);
  if (!braceMatch) {
    return [usePath];
  }
  const prefix = braceMatch[0].split("::{")[0];
  const items = braceMatch[2].split(",").map((s) => s.trim());
  return items.map((item) => {
    const asParts = item.split(/\s+as\s+/);
    const name = asParts[0].trim();
    return `${prefix}::${name}`;
  });
}

function isExternalCrate(usePath: string): boolean {
  // stdlib / language preludes are not internal
  const top = usePath.split("::")[0];
  return top === "std" || top === "core" || top === "alloc";
}

export function parseRust(filePath: string, content: string, root: string): ParseResult {
  const relFile = toRelFile(filePath, root);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const lines = content.split("\n");
  const isTest = isTestFile(relFile);

  // ---- File node ----
  nodes.push({
    id: relFile,
    file: relFile,
    kind: "file",
    exported: false,
    language: "rust",
  });

  // ---- Import detection ----

  // use foo::bar; / pub use foo::bar; / use foo::bar as baz;
  const useRe = /^\s*(?:pub\s+)?use\s+([\w:{}*]+)(?:\s+as\s+\w+)?;/;
  // use foo::{bar, baz};
  const useGroupRe = /^\s*(?:pub\s+)?use\s+([\w:]+::\{[^}]+\});/;
  // mod foo;
  const modRe = /^\s*(?:pub\s+)?mod\s+(\w+)\s*;/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const groupMatch = useGroupRe.exec(line);
    if (groupMatch) {
      const expanded = expandUse(groupMatch[1]);
      for (const u of expanded) {
        if (!isExternalCrate(u)) {
          edges.push({ from: relFile, to: u, kind: "imports" });
        }
      }
      continue;
    }

    const useMatch = useRe.exec(line);
    if (useMatch) {
      if (!isExternalCrate(useMatch[1])) {
        edges.push({ from: relFile, to: useMatch[1], kind: "imports" });
      }
      continue;
    }

    const modMatch = modRe.exec(line);
    if (modMatch) {
      const modName = modMatch[1];
      const resolved = resolveModPath(modName, relFile, root);
      edges.push({ from: relFile, to: resolved ?? modName, kind: "imports" });
    }
  }

  // ---- Declaration detection ----

  // fn foo( / pub fn foo( / pub async fn foo(
  const fnRe = /^\s*(pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/;
  // struct Foo / pub struct Foo
  const structRe = /^\s*(pub\s+)?struct\s+(\w+)/;
  // enum Foo / pub enum Foo
  const enumRe = /^\s*(pub\s+)?enum\s+(\w+)/;
  // trait Foo / pub trait Foo
  const traitRe = /^\s*(pub\s+)?trait\s+(\w+)/;
  // impl Foo / impl Trait for Foo
  const implRe = /^\s*impl(?:<[^>]*>)?\s+(?:(\w+)\s+for\s+)?(\w+)/;
  // #[test]
  const testAttrRe = /^\s*#\[(?:test|cfg\(test\))\]/;

  let nextIsTest = false;
  let inCfgTest = false;
  let braceDepth = 0;
  let cfgTestDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // Track #[cfg(test)] module depth
    if (/^\s*#\[cfg\(test\)\]/.test(line)) {
      inCfgTest = true;
      cfgTestDepth = braceDepth;
    }

    // Track brace depth for cfg(test)
    for (const ch of line) {
      if (ch === "{") {
        braceDepth++;
      } else if (ch === "}") {
        braceDepth--;
        if (inCfgTest && braceDepth <= cfgTestDepth) {
          inCfgTest = false;
        }
      }
    }

    if (testAttrRe.test(line)) {
      nextIsTest = true;
      continue;
    }

    const fnMatch = fnRe.exec(line);
    if (fnMatch) {
      const exported = Boolean(fnMatch[1]);
      const name = fnMatch[2];
      const isTestFn = nextIsTest || inCfgTest || (isTest && name.startsWith("test_"));
      nextIsTest = false;

      nodes.push({
        id: `${relFile}:${name}`,
        file: relFile,
        symbol: name,
        kind: isTestFn ? "test" : "function",
        exported,
        line: lineNo,
        language: "rust",
      });

      if (isTestFn) {
        // Heuristic: test covers sibling module (same file without _test suffix)
        const siblingFile = relFile.replace(/_test\.rs$/, ".rs");
        const testedFile =
          siblingFile !== relFile && existsSync(resolve(root, siblingFile)) ? siblingFile : relFile;
        edges.push({ from: relFile, to: testedFile, kind: "test_covers" });
      }
      continue;
    }

    nextIsTest = false;

    const structMatch = structRe.exec(line);
    if (structMatch) {
      nodes.push({
        id: `${relFile}:${structMatch[2]}`,
        file: relFile,
        symbol: structMatch[2],
        kind: "struct",
        exported: Boolean(structMatch[1]),
        line: lineNo,
        language: "rust",
      });
      continue;
    }

    const enumMatch = enumRe.exec(line);
    if (enumMatch) {
      nodes.push({
        id: `${relFile}:${enumMatch[2]}`,
        file: relFile,
        symbol: enumMatch[2],
        kind: "enum",
        exported: Boolean(enumMatch[1]),
        line: lineNo,
        language: "rust",
      });
      continue;
    }

    const traitMatch = traitRe.exec(line);
    if (traitMatch) {
      nodes.push({
        id: `${relFile}:${traitMatch[2]}`,
        file: relFile,
        symbol: traitMatch[2],
        kind: "trait",
        exported: Boolean(traitMatch[1]),
        line: lineNo,
        language: "rust",
      });
      continue;
    }

    const implMatch = implRe.exec(line);
    if (implMatch) {
      const name = implMatch[1] ? `${implMatch[1]}_for_${implMatch[2]}` : implMatch[2];
      nodes.push({
        id: `${relFile}:impl_${name}`,
        file: relFile,
        symbol: `impl_${name}`,
        kind: "impl",
        exported: false,
        line: lineNo,
        language: "rust",
      });
    }
  }

  // ---- Call site detection ----
  const localSymbols = new Set(
    nodes.filter((n) => n.symbol !== undefined).map((n) => n.symbol as string)
  );

  const callRe = /\b(\w+)\s*\(/g;
  for (const line of lines) {
    if (/^\s*(?:pub\s+)?(?:async\s+)?fn\s/.test(line)) {
      continue;
    }
    if (/^\s*(?:pub\s+)?(?:struct|enum|trait|impl)\s/.test(line)) {
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
