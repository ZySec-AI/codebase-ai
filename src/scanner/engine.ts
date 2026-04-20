import type { Manifest } from "../types.js";
import { createScanContext } from "./context.js";
import { detectors } from "../detectors/index.js";
import { syncGitHub } from "../github/sync.js";
import { warn } from "../utils/output.js";
import { loadCache, saveCache, isCacheValid } from "./cache.js";

export interface ScanOptions {
  depth?: number;
  categories?: string[];
  incremental?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  sync?: boolean;
}

export async function scan(root: string, options: ScanOptions = {}): Promise<Manifest> {
  const ctx = await createScanContext(root, { depth: options.depth });

  // Incremental: return cached manifest if nothing changed
  if (options.incremental) {
    const cache = loadCache(root);
    if (cache && (await isCacheValid(root, cache, ctx.files.length))) {
      return cache.manifest;
    }
  }

  let activeDetectors = detectors;
  if (options.categories?.length) {
    activeDetectors = detectors.filter((d) => options.categories!.includes(d.category));
  }

  const scanStart = performance.now();

  // Run all detectors in parallel, recording timing for each
  const results = await Promise.allSettled(
    activeDetectors.map(async (d) => {
      const t0 = performance.now();
      const data = await d.detect(ctx);
      const elapsedMs = performance.now() - t0;
      return { name: d.name, category: d.category, data, elapsedMs };
    })
  );

  const now = new Date().toISOString();
  const manifest: Manifest = {
    version: "1.0",
    generated_at: now,
    last_scan_time: now,
    manifest_version: "0.5.0",
  };

  const warnings: Array<{ detector: string; category: string; error: string }> = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      (manifest as unknown as Record<string, unknown>)[result.value.category] = result.value.data;
    } else {
      const d = activeDetectors[i];
      const errorMsg =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      warnings.push({ detector: d.name, category: d.category, error: errorMsg });
    }
  }

  // Print per-detector timings when CODEBASE_DEBUG=1 or verbose
  if (process.env.CODEBASE_DEBUG === "1" || options.verbose === true) {
    const totalScanMs = performance.now() - scanStart;
    const timings: Array<{ category: string; elapsedMs: number }> = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        timings.push({ category: result.value.category, elapsedMs: result.value.elapsedMs });
      }
    }
    timings.sort((a, b) => b.elapsedMs - a.elapsedMs);
    const maxMs = timings.length > 0 ? timings[0].elapsedMs : 0;
    const maxCatLen = timings.reduce((m, t) => Math.max(m, t.category.length), 0);
    const lines: string[] = ["  \u23F1  Detector timings:"];
    for (const t of timings) {
      const padded = t.category.padEnd(maxCatLen);
      const ms = `${Math.round(t.elapsedMs)}ms`;
      const slowest = t.elapsedMs === maxMs && timings.length > 1 ? "  \u2190 slowest" : "";
      lines.push(`     ${padded}  ${ms}${slowest}`);
    }
    lines.push(`  total scan: ${Math.round(totalScanMs)}ms  |  files: ${ctx.files.length}`);
    process.stderr.write(lines.join("\n") + "\n");
  }

  if (warnings.length > 0) {
    manifest._warnings = warnings;
    if (!options.quiet) {
      if (options.verbose) {
        for (const w of warnings) {
          warn(`[${w.detector}] ${w.category}: ${w.error}`);
        }
      } else {
        warn(`${warnings.length} warning(s) — run with --verbose to see details`);
      }
    }
  }

  // GitHub sync (optional, requires `gh` CLI)
  if (options.sync) {
    try {
      const ghData = await syncGitHub(root);
      if (ghData) {
        manifest.status = ghData.status;
        manifest.roadmap = ghData.roadmap;
        manifest.decisions = ghData.decisions;
      }
    } catch {
      if (!options.quiet) {
        warn("GitHub sync failed (is `gh` CLI installed and authenticated?)");
      }
    }
  }

  // Incremental: save cache for next run
  if (options.incremental) {
    await saveCache(root, ctx.files.length, manifest);
  }

  return manifest;
}

export function summarizeCategory(category: string, data: Record<string, unknown>): string {
  switch (category) {
    case "project": {
      const name = data.name as string;
      const desc = data.description as string;
      return desc ? `${name} — ${desc.slice(0, 60)}` : name || "unknown";
    }
    case "repo": {
      const url = data.url as string;
      const branch = data.default_branch as string;
      const short = url ? url.replace(/.*[:/]/, "").replace(/\.git$/, "") : "local";
      return `${short}, ${branch || "unknown branch"}`;
    }
    case "structure": {
      const entries = data.entry_points as string[];
      const tree = data.tree as Record<string, string[]>;
      const buildOut = data.build_output as string[];
      const dirs = Object.keys(tree || {}).filter((k) => k !== "./");
      const parts: string[] = [];
      if (entries?.length) {
        parts.push(`${entries.length} entry points`);
      }
      if (dirs.length) {
        parts.push(`${dirs.length} top-level dirs`);
      }
      if (buildOut?.length) {
        parts.push(`build: ${buildOut.join(", ")}`);
      }
      return parts.join(", ") || "empty";
    }
    case "stack": {
      const langs = data.languages as string[];
      const frameworks = data.frameworks as string[];
      const buildTool = data.build_tool as string | null;
      const parts = [...(langs || []), ...(frameworks || [])];
      if (buildTool) {
        parts.push(buildTool);
      }
      return parts.join(", ") || "unknown";
    }
    case "commands": {
      const cmds = Object.entries(data)
        .filter(([, v]) => v)
        .map(([k]) => k);
      return cmds.join(", ") || "none detected";
    }
    case "dependencies": {
      const count = data.direct_count as number;
      const devCount = data.dev_count as number;
      const lock = data.lock_file as string;
      const parts: string[] = [];
      if (count) {
        parts.push(`${count} direct`);
      }
      if (devCount) {
        parts.push(`${devCount} dev`);
      }
      if (!count && !devCount) {
        parts.push("0 deps");
      }
      if (lock) {
        parts.push(lock);
      }
      return parts.join(", ");
    }
    case "config": {
      const envs = data.env_files as string[];
      return `${envs?.length || 0} env files`;
    }
    case "git": {
      const commits = data.recent_commits as string[];
      const changes = data.uncommitted_changes as boolean | string[];
      const hasChanges = Array.isArray(changes) ? changes.length > 0 : !!changes;
      return `${commits?.length || 0} recent commits${hasChanges ? ", uncommitted changes" : ""}`;
    }
    case "quality": {
      const parts: string[] = [];
      if (data.test_framework) {
        parts.push(data.test_framework as string);
      }
      if (data.linter) {
        parts.push(data.linter as string);
      }
      if (data.ci) {
        parts.push(data.ci as string);
      }
      return parts.join(", ") || "none detected";
    }
    case "patterns": {
      const arch = data.architecture as string;
      const state = data.state_management as string;
      return [arch, state].filter(Boolean).join(", ") || "unknown";
    }
    case "status": {
      const issues = (data.issues as unknown[]) || [];
      const prs = (data.pull_requests as unknown[]) || [];
      return `${issues.length} issues, ${prs.length} PRs`;
    }
    default:
      return JSON.stringify(data).slice(0, 60);
  }
}
