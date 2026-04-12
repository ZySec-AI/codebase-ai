import { readFileSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";

/**
 * Detect project entry points — files that should always be considered reachable.
 * Returns relative paths from root.
 */
export function detectEntrypoints(files: string[], root: string): string[] {
  const entrypoints = new Set<string>();
  const fileSet = new Set(files);

  // ---- TS/JS well-known entry points ----
  const tsJsEntries = [
    "src/index.ts",
    "src/index.js",
    "index.ts",
    "index.js",
    "main.ts",
    "main.js",
    "src/app.ts",
    "src/app.js",
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "middleware.ts",
    "middleware.js",
  ];

  for (const e of tsJsEntries) {
    if (fileSet.has(e)) {
      entrypoints.add(e);
    }
  }

  // Next.js App Router / Pages Router
  for (const f of files) {
    if (
      /^(?:pages|app)\//.test(f) ||
      /\/route\.[jt]sx?$/.test(f) ||
      /\/page\.[jt]sx?$/.test(f) ||
      /\/layout\.[jt]sx?$/.test(f)
    ) {
      entrypoints.add(f);
    }
  }

  // package.json main / bin fields
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(raw) as Record<string, unknown>;

      if (typeof pkg["main"] === "string") {
        const rel = relative(root, resolve(root, pkg["main"] as string));
        if (fileSet.has(rel)) {
          entrypoints.add(rel);
        }
      }

      const bin = pkg["bin"];
      if (bin && typeof bin === "object" && bin !== null) {
        for (const v of Object.values(bin as Record<string, string>)) {
          if (typeof v === "string") {
            const rel = relative(root, resolve(root, v));
            if (fileSet.has(rel)) {
              entrypoints.add(rel);
            }
          }
        }
      } else if (typeof bin === "string") {
        const rel = relative(root, resolve(root, bin));
        if (fileSet.has(rel)) {
          entrypoints.add(rel);
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // ---- Python well-known entry points ----
  const pyEntries = ["__main__.py", "manage.py", "app.py", "main.py", "wsgi.py", "asgi.py"];

  for (const e of pyEntries) {
    if (fileSet.has(e)) {
      entrypoints.add(e);
    }
  }

  // Python files with __main__ guard or Flask/FastAPI decorators
  for (const f of files) {
    if (!f.endsWith(".py")) {
      continue;
    }
    try {
      const content = readFileSync(join(root, f), "utf8");
      if (
        content.includes('if __name__ == "__main__"') ||
        content.includes("if __name__ == '__main__'") ||
        /@app\.route/.test(content) ||
        /@router\.(get|post|put|delete|patch|options|head)/.test(content)
      ) {
        entrypoints.add(f);
      }
    } catch {
      // skip unreadable files
    }
  }

  // ---- Go: package main with func main ----
  for (const f of files) {
    if (!f.endsWith(".go")) {
      continue;
    }
    try {
      const content = readFileSync(join(root, f), "utf8");
      if (/^package\s+main\b/m.test(content) && /^func\s+main\s*\(/m.test(content)) {
        entrypoints.add(f);
      }
    } catch {
      // skip
    }
  }

  // ---- Rust well-known entry points ----
  const rustEntries = ["src/main.rs", "src/lib.rs"];
  for (const e of rustEntries) {
    if (fileSet.has(e)) {
      entrypoints.add(e);
    }
  }

  // Rust bin/*.rs
  for (const f of files) {
    if (/^(?:src\/)?bin\/[^/]+\.rs$/.test(f)) {
      entrypoints.add(f);
    }
  }

  // ---- Test files (always reachable) ----
  for (const f of files) {
    if (isTestFile(f)) {
      entrypoints.add(f);
    }
  }

  return Array.from(entrypoints);
}

function isTestFile(f: string): boolean {
  return (
    f.endsWith("_test.go") ||
    f.endsWith("_test.ts") ||
    f.endsWith(".test.ts") ||
    f.endsWith(".spec.ts") ||
    f.endsWith(".test.js") ||
    f.endsWith(".spec.js") ||
    f.endsWith("_test.tsx") ||
    f.endsWith(".test.tsx") ||
    f.endsWith(".spec.tsx") ||
    /(?:^|\/)test_[^/]+\.py$/.test(f) ||
    /_test\.py$/.test(f) ||
    f.endsWith("tests.rs") ||
    f.endsWith("_test.rs")
  );
}
