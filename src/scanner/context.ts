import { readdir, readFile as fsReadFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execFile } from "node:child_process";
import type { ScanContext } from "../types.js";
import { globFilter } from "../utils/glob.js";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "__pycache__",
  "vendor",
  ".venv",
  "venv",
  "target",
  "coverage",
  ".cache",
  ".turbo",
  ".vercel",
  ".netlify",
  ".parcel-cache",
  ".svelte-kit",
  ".angular",
  "out",
  "bin",
  "obj",
]);

export interface ContextOptions {
  depth?: number;
  ignore?: string[];
}

export async function createScanContext(
  root: string,
  options: ContextOptions = {}
): Promise<ScanContext> {
  const ignoreSet = new Set([...DEFAULT_IGNORE, ...(options.ignore ?? [])]);
  const files = await walkDirectory(root, root, ignoreSet, options.depth ?? 10);
  const fileSet = new Set(files);

  return {
    root,
    files,

    async readFile(path: string): Promise<string> {
      try {
        return await fsReadFile(join(root, path), "utf-8");
      } catch {
        return "";
      }
    },

    fileExists(path: string): boolean {
      // Fast O(1) check against walked files first
      if (fileSet.has(path)) {
        return true;
      }
      // Fallback: actual filesystem check (for files in ignored dirs or outside walk depth)
      return existsSync(join(root, path));
    },

    glob(pattern: string): string[] {
      return globFilter(files, pattern);
    },

    exec(cmd: string, args: string[]): Promise<string> {
      return new Promise((resolve) => {
        execFile(cmd, args, { cwd: root, timeout: 10_000 }, (err, stdout) => {
          resolve(err ? "" : stdout.trim());
        });
      });
    },
  };
}

async function walkDirectory(
  base: string,
  dir: string,
  ignore: Set<string>,
  maxDepth: number,
  currentDepth = 0
): Promise<string[]> {
  if (currentDepth > maxDepth) {
    return [];
  }

  const results: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (ignore.has(entry.name)) {
        continue;
      }
      if (entry.isDirectory() && entry.name.startsWith(".")) {
        // Allow .github, .husky, .circleci — skip other hidden dirs
        const allowedDotDirs = new Set([".github", ".husky", ".circleci"]);
        if (!allowedDotDirs.has(entry.name)) {
          continue;
        }
      }

      const fullPath = join(dir, entry.name);
      const relPath = relative(base, fullPath);

      if (entry.isDirectory()) {
        results.push(relPath + "/");
        const children = await walkDirectory(base, fullPath, ignore, maxDepth, currentDepth + 1);
        results.push(...children);
      } else {
        results.push(relPath);
      }
    }
  } catch {
    // Permission denied, broken symlink, etc.
  }

  return results;
}
