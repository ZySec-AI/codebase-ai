import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "../types.js";

const CACHE_FILE = ".codebase.cache.json";
const CACHE_VERSION = 1;

const TRACKED_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "tsconfig.build.json",
  "Cargo.toml",
  "Cargo.lock",
  "pyproject.toml",
  "requirements.txt",
  "poetry.lock",
  "go.mod",
  "go.sum",
  "Makefile",
  "Dockerfile",
  "docker-compose.yml",
];

interface CacheData {
  cache_version: number;
  timestamp: string;
  file_count: number;
  file_mtimes: Record<string, number>;
  manifest: Manifest;
}

export function loadCache(root: string): CacheData | null {
  try {
    const raw = readFileSync(join(root, CACHE_FILE), "utf-8");
    const data = JSON.parse(raw) as CacheData;
    if (data.cache_version !== CACHE_VERSION) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveCache(root: string, fileCount: number, manifest: Manifest): void {
  const data: CacheData = {
    cache_version: CACHE_VERSION,
    timestamp: new Date().toISOString(),
    file_count: fileCount,
    file_mtimes: snapshotMtimes(root),
    manifest,
  };
  try {
    writeFileSync(join(root, CACHE_FILE), JSON.stringify(data), "utf-8");
  } catch {
    // Non-critical — scanning still works without cache
  }
}

export function isCacheValid(root: string, cache: CacheData, currentFileCount: number): boolean {
  // File count changed → something was added or deleted
  if (cache.file_count !== currentFileCount) {
    return false;
  }

  // Check tracked file mtimes
  const currentMtimes = snapshotMtimes(root);
  for (const file of Object.keys({ ...cache.file_mtimes, ...currentMtimes })) {
    if ((cache.file_mtimes[file] ?? 0) !== (currentMtimes[file] ?? 0)) {
      return false;
    }
  }

  return true;
}

function snapshotMtimes(root: string): Record<string, number> {
  const mtimes: Record<string, number> = {};
  for (const file of TRACKED_FILES) {
    try {
      const s = statSync(join(root, file));
      mtimes[file] = s.mtimeMs;
    } catch {
      // File doesn't exist — that's fine, don't include it
    }
  }
  return mtimes;
}
