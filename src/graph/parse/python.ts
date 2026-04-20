import { relative, dirname, resolve, join } from "node:path";
import { toRelFile } from "./index.js";
import { existsSync } from "node:fs";
import type { ParseResult, GraphNode, GraphEdge } from "../types.js";

function isTestFile(relPath: string): boolean {
  return (
    relPath.includes("/test/") ||
    relPath.includes("/tests/") ||
    /(?:^|\/)test_[^/]+\.py$/.test(relPath) ||
    /_test\.py$/.test(relPath)
  );
}

/**
 * Heuristic: given a test file, guess which module it tests.
 * E.g. test_foo.py -> foo.py, foo_test.py -> foo.py
 */
function guessTestedModule(relPath: string, _root: string): string | null {
  const parts = relPath.split("/");
  const filename = parts[parts.length - 1];
  let base = filename.replace(/\.py$/, "");
  if (base.startsWith("test_")) {
    base = base.slice(5);
  } else if (base.endsWith("_test")) {
    base = base.slice(0, -5);
  } else {
    return null;
  }

  const dir = parts.slice(0, -1).join("/");
  const candidate = dir ? `${dir}/${base}.py` : `${base}.py`;
  // Return candidate regardless — caller can verify existence if needed
  return candidate;
}

/**
 * Resolve a Python relative import to a file path.
 * E.g. from .foo import bar -> "pkg/foo.py" (if it exists)
 */
function resolveRelativeImport(
  dotLevel: number,
  modulePart: string,
  fromFile: string,
  root: string
): string | null {
  let dir = dirname(resolve(root, fromFile));
  for (let i = 1; i < dotLevel; i++) {
    dir = dirname(dir);
  }
  const modPath = modulePart ? modulePart.replace(/\./g, "/") : "";
  const candidate = modPath ? join(dir, `${modPath}.py`) : join(dir, "__init__.py");
  const rel = relative(root, candidate);
  if (existsSync(candidate)) {
    return rel;
  }
  // Maybe it's a package (directory with __init__.py)
  const initCandidate = modPath ? join(dir, modPath, "__init__.py") : join(dir, "__init__.py");
  if (existsSync(initCandidate)) {
    return relative(root, initCandidate);
  }
  return rel; // return best guess even if file doesn't exist
}

/**
 * Resolve absolute Python import "foo.bar" to a file relative to root.
 */
function resolveAbsoluteImport(module: string, root: string): string | null {
  const modPath = module.replace(/\./g, "/");
  const candidates = [resolve(root, `${modPath}.py`), resolve(root, modPath, "__init__.py")];
  for (const c of candidates) {
    if (existsSync(c)) {
      return relative(root, c);
    }
  }
  return null;
}

// Well-known Python stdlib top-level module names (subset sufficient for filtering)
const STDLIB_MODULES = new Set([
  "os",
  "sys",
  "re",
  "io",
  "abc",
  "ast",
  "csv",
  "dis",
  "gc",
  "json",
  "math",
  "time",
  "copy",
  "enum",
  "glob",
  "gzip",
  "hash",
  "hmac",
  "html",
  "http",
  "idna",
  "ipaddress",
  "itertools",
  "keyword",
  "linecache",
  "logging",
  "mimetypes",
  "numbers",
  "operator",
  "pathlib",
  "pickle",
  "platform",
  "pprint",
  "queue",
  "random",
  "secrets",
  "select",
  "shlex",
  "shutil",
  "signal",
  "socket",
  "sqlite3",
  "ssl",
  "stat",
  "statistics",
  "string",
  "struct",
  "subprocess",
  "tarfile",
  "tempfile",
  "textwrap",
  "threading",
  "traceback",
  "types",
  "typing",
  "unittest",
  "urllib",
  "uuid",
  "warnings",
  "weakref",
  "xml",
  "xmlrpc",
  "zipfile",
  "zipimport",
  "zlib",
  "builtins",
  "collections",
  "functools",
  "contextlib",
  "dataclasses",
  "decimal",
  "difflib",
  "email",
  "encodings",
  "fractions",
  "ftplib",
  "getopt",
  "getpass",
  "gettext",
  "hashlib",
  "heapq",
  "imaplib",
  "importlib",
  "inspect",
  "multiprocessing",
  "ntpath",
  "optparse",
  "posixpath",
  "profile",
  "pstats",
  "pty",
  "pwd",
  "readline",
  "reprlib",
  "resource",
  "rlcompleter",
  "runpy",
  "sched",
  "shelve",
  "smtplib",
  "sndhdr",
  "socketserver",
  "spwd",
  "sre_compile",
  "sre_constants",
  "sre_parse",
  "stringer",
  "string",
  "sysconfig",
  "syslog",
  "tabnanny",
  "telnetlib",
  "test",
  "timeit",
  "token",
  "tokenize",
  "trace",
  "tracemalloc",
  "tty",
  "turtle",
  "turtledemo",
  "uu",
  "venv",
  "wave",
  "webbrowser",
  "wsgiref",
  "xdrlib",
]);

function isStdlib(module: string): boolean {
  const top = module.split(".")[0];
  return STDLIB_MODULES.has(top);
}

// ---- Module-level regex constants ----

// import foo / import foo as bar / import foo.bar
const simpleImportRe = /^\s*import\s+([\w.]+)(?:\s+as\s+\w+)?/;
// from foo import bar / from .foo import bar / from ..foo import baz, qux
const fromImportRe = /^\s*from\s+(\.+)([\w.]*)\s+import\s+(.+)/;
const fromAbsImportRe = /^\s*from\s+([\w.]+)\s+import\s+(.+)/;
// function and class declarations
const funcRe = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/;
const classRe = /^(\s*)class\s+(\w+)/;
// call sites
const pyCallRe = /\b(\w+)\s*\(/g;
// skip declaration lines in call scanning
const pySkipLineRe = /^\s*(?:def|class|import|from)\s/;

export function parsePython(filePath: string, content: string, root: string): ParseResult {
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
    language: "python",
  });

  // ---- Import detection ----

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // relative import
    const relMatch = fromImportRe.exec(line);
    if (relMatch) {
      const dotLevel = relMatch[1].length;
      const modulePart = relMatch[2];
      const resolved = resolveRelativeImport(dotLevel, modulePart, relFile, root);
      edges.push({ from: relFile, to: resolved ?? modulePart, kind: "imports" });
      continue;
    }

    // absolute from import — skip stdlib
    const absFromMatch = fromAbsImportRe.exec(line);
    if (absFromMatch) {
      const module = absFromMatch[1];
      if (!isStdlib(module)) {
        const resolved = resolveAbsoluteImport(module, root);
        if (resolved) {
          edges.push({ from: relFile, to: resolved, kind: "imports" });
        }
      }
      continue;
    }

    // simple import — skip stdlib
    const simpleMatch = simpleImportRe.exec(line);
    if (simpleMatch) {
      const module = simpleMatch[1];
      if (!isStdlib(module)) {
        const resolved = resolveAbsoluteImport(module, root);
        if (resolved) {
          edges.push({ from: relFile, to: resolved, kind: "imports" });
        }
      }
      continue;
    }
  }

  // ---- Declaration detection ----

  const localSymbols = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    const classMatch = classRe.exec(line);
    if (classMatch) {
      const indent = classMatch[1].length;
      const name = classMatch[2];
      const exported = indent === 0 && !name.startsWith("_");
      nodes.push({
        id: `${relFile}:${name}`,
        file: relFile,
        symbol: name,
        kind: "class",
        exported,
        line: lineNo,
        language: "python",
      });
      if (indent === 0) {
        localSymbols.add(name);
      }

      // test_covers edge for Test* classes in test files
      if (isTest && name.startsWith("Test")) {
        const testedModule = guessTestedModule(relFile, root);
        if (testedModule) {
          edges.push({ from: relFile, to: testedModule, kind: "test_covers" });
        }
      }
      continue;
    }

    const funcMatch = funcRe.exec(line);
    if (funcMatch) {
      const indent = funcMatch[1].length;
      const name = funcMatch[2];
      const exported = indent === 0 && !name.startsWith("_");
      const isTestFn = isTest && (name.startsWith("test_") || name.startsWith("Test"));
      nodes.push({
        id: `${relFile}:${name}`,
        file: relFile,
        symbol: name,
        kind: isTestFn ? "test" : "function",
        exported,
        line: lineNo,
        language: "python",
      });
      if (indent === 0) {
        localSymbols.add(name);
      }

      // test_covers edge for test_ functions in test files
      if (isTest && name.startsWith("test_")) {
        const testedModule = guessTestedModule(relFile, root);
        if (testedModule) {
          edges.push({ from: relFile, to: testedModule, kind: "test_covers" });
        }
      }
    }
  }

  // ---- Call site detection ----
  for (const line of lines) {
    if (pySkipLineRe.test(line)) {
      continue;
    }
    pyCallRe.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = pyCallRe.exec(line)) !== null) {
      const callee = cm[1];
      if (localSymbols.has(callee)) {
        edges.push({ from: relFile, to: `${relFile}:${callee}`, kind: "calls" });
      }
    }
  }

  return { nodes, edges };
}
