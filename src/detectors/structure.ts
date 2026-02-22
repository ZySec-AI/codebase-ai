import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Detector, ScanContext } from "../types.js";

const KNOWN_ENTRY_POINTS = [
  "src/index.ts", "src/index.js", "src/main.ts", "src/main.js",
  "src/app.ts", "src/app.js", "src/server.ts", "src/server.js",
  "src/app/layout.tsx", "src/app/page.tsx", "app/layout.tsx",
  "pages/_app.tsx", "pages/_app.js", "pages/index.tsx",
  "index.ts", "index.js", "main.ts", "main.js",
  "app/main.py", "main.py", "app.py", "manage.py",
  "main.go", "cmd/main.go",
  "src/main.rs", "src/lib.rs",
  "lib/main.dart",
  "Program.cs",
];

const KNOWN_BUILD_OUTPUTS = [
  "dist", "build", ".next", "out", "target", "bin", "obj",
  ".output", ".nuxt", ".svelte-kit", ".vercel",
];

export const structureDetector: Detector = {
  name: "structure",
  category: "structure",

  async detect(ctx: ScanContext) {
    const entryPoints = KNOWN_ENTRY_POINTS.filter(ep => ctx.fileExists(ep));
    const buildOutput = KNOWN_BUILD_OUTPUTS.filter(d => existsSync(join(ctx.root, d)));
    const tree = buildTree(ctx.files, 4);

    return {
      entry_points: entryPoints,
      build_output: buildOutput,
      tree,
    };
  },
};

function buildTree(files: string[], maxDepth: number): Record<string, string[]> {
  const tree: Record<string, Set<string>> = {};
  const topLevelFiles: string[] = [];

  for (const file of files) {
    const clean = file.replace(/\/$/, "");
    const parts = clean.split("/");

    // Top-level files (no directory)
    if (parts.length === 1 && !file.endsWith("/")) {
      topLevelFiles.push(parts[0]);
      continue;
    }

    if (parts.length < 2) continue;

    const topDir = parts[0] + "/";

    // Add second-level entries (files or dirs)
    if (parts.length === 2 && !file.endsWith("/")) {
      // File directly in top-level dir
      if (!tree[topDir]) tree[topDir] = new Set();
      tree[topDir].add(parts[1]);
    } else if (parts.length >= 3) {
      // Subdirectory
      if (!tree[topDir]) tree[topDir] = new Set();
      tree[topDir].add(parts[1] + "/");
    }
  }

  // Convert sets to sorted arrays, limit children
  const result: Record<string, string[]> = {};

  // Add top-level files as "./" entry (config files, package.json, etc.)
  if (topLevelFiles.length > 0) {
    const sorted = topLevelFiles.sort();
    result["./"] = sorted.length > 15
      ? [...sorted.slice(0, 13), `... (${sorted.length} files)`]
      : sorted;
  }

  // Add directory entries
  for (const [dir, children] of Object.entries(tree)) {
    const arr = [...children].sort();
    result[dir] = arr.length > 20
      ? [...arr.slice(0, 18), `... (${arr.length} items)`]
      : arr;
  }

  return result;
}
