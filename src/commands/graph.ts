import { resolve } from "node:path";
import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CLIOptions } from "../types.js";
import { heading, log, dim, bold, success, error as printError, warn } from "../utils/output.js";
import {
  buildGraph,
  saveGraph,
  loadGraph,
  updateGraph,
  getImpactRadius,
  getCallers,
  getCallees,
  querySymbol,
  getEntrypoints,
} from "../graph/index.js";

const execFileAsync = promisify(_execFile);

/**
 * `codebase graph <subcommand> [args]`
 *
 * Subcommands:
 *   build                   – Full rebuild of .codebase/graph.json
 *   update                  – Incremental update (re-parse changed files only)
 *   impact <file...>        – Print blast radius for one or more files
 *   impact --pr <N>         – Blast radius for the files changed in PR #N
 *   query callers <file>    – Files that import/call the given file
 *   query callees <file>    – Files imported by the given file
 *   query symbol <name>     – Nodes matching the symbol name
 *   query entrypoints       – Detected entry points
 *   stats                   – Node/edge counts per language
 */
export async function runGraph(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const sub = options.subcommand || options.positionals[0] || "";

  switch (sub) {
    case "build":
      await runBuild(root);
      break;
    case "update":
      await runUpdate(root);
      break;
    case "impact":
      await runImpact(root, options);
      break;
    case "query":
      await runQuery(root, options);
      break;
    case "stats":
      await runStats(root);
      break;
    default:
      printUsage();
  }
}

// ─── build ────────────────────────────────────────────────────────

async function runBuild(root: string): Promise<void> {
  heading("codebase graph build\n");
  log("  Building call/import graph…");
  const start = Date.now();
  const graph = await buildGraph(root);
  await saveGraph(root, graph);
  const ms = Date.now() - start;
  success(`Done — ${graph.nodes.length} nodes, ${graph.edges.length} edges in ${ms}ms`);
  dim(`  Saved to .codebase/graph.json`);
}

// ─── update ───────────────────────────────────────────────────────

async function runUpdate(root: string): Promise<void> {
  heading("codebase graph update\n");
  const existing = await loadGraph(root);
  if (!existing) {
    warn("  No existing graph found — running full build instead.");
    return runBuild(root);
  }
  log("  Updating graph (incremental)…");
  const start = Date.now();
  const graph = await updateGraph(root);
  const ms = Date.now() - start;
  success(`Done — ${graph.nodes.length} nodes, ${graph.edges.length} edges in ${ms}ms`);
}

// ─── impact ───────────────────────────────────────────────────────

async function runImpact(root: string, options: CLIOptions): Promise<void> {
  heading("codebase graph impact\n");

  const graph = await loadGraph(root);
  if (!graph) {
    printError("No graph found. Run: codebase graph build");
    process.exit(1);
  }

  let targetFiles: string[] = [];

  // --pr N: fetch changed files from GitHub
  const prFlag = options.positionals.find((_, i) => options.positionals[i - 1] === "--pr");
  const prNum = prFlag ? parseInt(prFlag, 10) : NaN;

  if (!isNaN(prNum)) {
    log(`  Fetching changed files from PR #${prNum}…`);
    try {
      const { stdout } = await execFileAsync("gh", [
        "pr",
        "view",
        String(prNum),
        "--json",
        "files",
      ]);
      const data = JSON.parse(stdout) as { files: Array<{ path: string }> };
      targetFiles = data.files.map((f) => f.path);
    } catch {
      printError("Failed to fetch PR files. Is gh CLI authenticated?");
      process.exit(1);
    }
  } else {
    // Positional file args (skip subcommand and "--pr N")
    targetFiles = options.positionals
      .filter((a) => a !== "impact" && a !== "--pr" && isNaN(parseInt(a, 10)))
      .map((f) => (f.startsWith("/") ? f.replace(root + "/", "") : f));
  }

  if (targetFiles.length === 0) {
    printError("Provide file paths or --pr <N>.");
    printUsage();
    process.exit(1);
  }

  const hops = 2;
  const result = getImpactRadius(graph, targetFiles, hops);

  log(`  Changed files (${result.changed.length}):`);
  for (const f of result.changed) {
    log(`    ${f}`);
  }

  log(`\n  Direct callers (${result.direct_callers.length}):`);
  for (const f of result.direct_callers) {
    log(`    ${f}`);
  }

  if (result.transitive_callers.length > 0) {
    log(`\n  Transitive callers up to ${hops} hops (${result.transitive_callers.length}):`);
    for (const f of result.transitive_callers) {
      log(`    ${f}`);
    }
  }

  if (result.covering_tests.length > 0) {
    log(`\n  Covering tests (${result.covering_tests.length}):`);
    for (const f of result.covering_tests) {
      log(`    ${f}`);
    }
  }

  log(`\n  Risk score: ${bold(String(result.risk_score))}/100`);
  success("Done");
}

// ─── query ────────────────────────────────────────────────────────

async function runQuery(root: string, options: CLIOptions): Promise<void> {
  const graph = await loadGraph(root);
  if (!graph) {
    printError("No graph found. Run: codebase graph build");
    process.exit(1);
  }

  // positionals: ["query", "<kind>", "<arg>"]
  const kind = options.positionals[1] ?? "";
  const arg = options.positionals[2] ?? "";

  switch (kind) {
    case "callers": {
      if (!arg) {
        printError("Usage: codebase graph query callers <file>");
        process.exit(1);
      }
      const results = getCallers(graph, arg);
      heading(`Callers of ${arg}\n`);
      if (results.length === 0) {
        dim("  (none)");
      } else {
        for (const f of results) {
          log(`  ${f}`);
        }
      }
      break;
    }
    case "callees": {
      if (!arg) {
        printError("Usage: codebase graph query callees <file>");
        process.exit(1);
      }
      const results = getCallees(graph, arg);
      heading(`Callees of ${arg}\n`);
      if (results.length === 0) {
        dim("  (none)");
      } else {
        for (const f of results) {
          log(`  ${f}`);
        }
      }
      break;
    }
    case "symbol": {
      if (!arg) {
        printError("Usage: codebase graph query symbol <name>");
        process.exit(1);
      }
      const results = querySymbol(graph, arg);
      heading(`Nodes matching "${arg}"\n`);
      if (results.length === 0) {
        dim("  (none)");
      } else {
        for (const n of results) {
          log(`  ${n.file}:${n.symbol ?? "(file)"} [${n.kind}] exported=${n.exported}`);
        }
      }
      break;
    }
    case "entrypoints": {
      const results = getEntrypoints(graph);
      heading("Entry points\n");
      if (results.length === 0) {
        dim("  (none detected)");
      } else {
        for (const f of results) {
          log(`  ${f}`);
        }
      }
      break;
    }
    default:
      printError(`Unknown query kind: "${kind}". Use: callers | callees | symbol | entrypoints`);
      process.exit(1);
  }

  success("Done");
}

// ─── stats ────────────────────────────────────────────────────────

async function runStats(root: string): Promise<void> {
  heading("codebase graph stats\n");

  const graph = await loadGraph(root);
  if (!graph) {
    warn("  No graph found. Run: codebase graph build");
    return;
  }

  const byLang: Record<string, { nodes: number; edges: number }> = {};
  for (const node of graph.nodes) {
    const l = node.language ?? "unknown";
    if (!byLang[l]) {
      byLang[l] = { nodes: 0, edges: 0 };
    }
    byLang[l].nodes++;
  }
  for (const edge of graph.edges) {
    // Attribute edge to the language of its "from" node
    const fromNode = graph.nodes.find((n) => n.id === edge.from);
    const l = fromNode?.language ?? "unknown";
    if (!byLang[l]) {
      byLang[l] = { nodes: 0, edges: 0 };
    }
    byLang[l].edges++;
  }

  const LANG_W = 14;
  const NUM_W = 8;
  log(`  ${"Language".padEnd(LANG_W)} ${"Nodes".padStart(NUM_W)} ${"Edges".padStart(NUM_W)}`);
  dim(`  ${"─".repeat(LANG_W + NUM_W * 2 + 2)}`);
  for (const [lang, counts] of Object.entries(byLang).sort((a, b) => b[1].nodes - a[1].nodes)) {
    log(
      `  ${lang.padEnd(LANG_W)} ${String(counts.nodes).padStart(NUM_W)} ${String(counts.edges).padStart(NUM_W)}`
    );
  }
  dim(`  ${"─".repeat(LANG_W + NUM_W * 2 + 2)}`);
  log(
    `  ${bold("Total".padEnd(LANG_W))} ${bold(String(graph.nodes.length).padStart(NUM_W))} ${bold(String(graph.edges.length).padStart(NUM_W))}`
  );
  log("");
  dim(`  Built: ${graph.built_at}`);
  success("Done");
}

// ─── usage ────────────────────────────────────────────────────────

function printUsage(): void {
  log("");
  log("  Usage: codebase graph <subcommand>");
  log("");
  log("  Subcommands:");
  log("    build                        Full rebuild of .codebase/graph.json");
  log("    update                       Incremental update (changed files only)");
  log("    impact <file...>             Blast radius for the given files");
  log("    impact --pr <N>              Blast radius for files changed in PR #N");
  log("    query callers <file>         Files that import/call the given file");
  log("    query callees <file>         Files imported by the given file");
  log("    query symbol <name>          Nodes matching the symbol name");
  log("    query entrypoints            Detected project entry points");
  log("    stats                        Node/edge counts per language");
  log("");
}
