import { resolve, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CLIOptions, Manifest } from "../types.js";
import { setQuiet, success, info } from "../utils/output.js";

const execFileAsync = promisify(execFile);

/**
 * Run a git command and return stdout, or empty string on failure.
 */
async function git(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root, timeout: 10_000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

/**
 * `codebase handoff` — generates HANDOFF.md capturing current session state.
 *
 * Collects git state (branch, recent commits, diff stat, uncommitted changes, stashes)
 * and manifest data (in-progress issues, next task, blockers) into a structured
 * markdown document for the next agent or human to pick up where you left off.
 *
 * Usage: codebase handoff [--message "session notes"]
 */
export async function runHandoff(options: CLIOptions): Promise<void> {
  setQuiet(options.quiet);
  const root = resolve(options.path);

  // ── Git data ─────────────────────────────────────────────────
  const [branch, diffStat, logLines, statusOutput, stashList] = await Promise.all([
    git(root, ["branch", "--show-current"]),
    git(root, ["diff", "--stat", "HEAD"]),
    git(root, ["log", "--oneline", "-10"]),
    git(root, ["status", "--porcelain"]),
    git(root, ["stash", "list"]),
  ]);

  const recentCommits = logLines
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const changedFiles = diffStat
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) => l && !l.includes("changed") && !l.includes("insertion") && !l.includes("deletion")
    );
  const hasUncommitted = statusOutput.trim().length > 0;
  const stashes = stashList
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // ── Manifest data ─────────────────────────────────────────────
  let manifest: Manifest | null = null;
  try {
    const raw = readFileSync(join(root, ".codebase.json"), "utf-8");
    manifest = JSON.parse(raw) as Manifest;
  } catch {
    /* no manifest — degrade gracefully */
  }

  const inProgress = manifest?.status?.kanban?.in_progress ?? [];
  const priorities = manifest?.status?.priorities ?? [];
  const nextTask = priorities[0] ?? null;
  const blockers = (manifest?.status?.issues ?? []).filter(
    (i) =>
      i.state === "open" &&
      i.labels.some(
        (l) => l.toLowerCase().includes("blocked") || l.toLowerCase().includes("blocker")
      )
  );

  // ── PLAN.md ───────────────────────────────────────────────────
  const planPath = join(root, "PLAN.md");
  let planSnippet = "";
  if (existsSync(planPath)) {
    const planContent = readFileSync(planPath, "utf-8");
    // Include up to the first 20 lines of PLAN.md
    planSnippet = planContent.split("\n").slice(0, 20).join("\n").trim();
  }

  // ── Build HANDOFF.md ──────────────────────────────────────────
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("# HANDOFF.md — Session Transfer");
  lines.push("");
  lines.push(`> Generated: ${now}  `);
  lines.push(`> Branch: \`${branch || "unknown"}\``);
  lines.push("");

  // Recent work
  lines.push("## What Happened");
  if (recentCommits.length > 0) {
    for (const c of recentCommits.slice(0, 7)) {
      lines.push(`- ${c}`);
    }
  } else {
    lines.push("- No recent commits");
  }
  lines.push("");

  // Files changed
  if (changedFiles.length > 0) {
    lines.push("## Files Changed");
    for (const f of changedFiles.slice(0, 15)) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  // Current state
  lines.push("## Current State");
  lines.push(`- **Branch:** ${branch || "unknown"}`);
  if (hasUncommitted) {
    lines.push("- **Uncommitted changes:** yes — review before continuing");
  } else {
    lines.push("- **Uncommitted changes:** none");
  }
  if (stashes.length > 0) {
    lines.push(`- **Stashed work:** ${stashes.length} stash${stashes.length > 1 ? "es" : ""}`);
    for (const s of stashes.slice(0, 3)) {
      lines.push(`  - ${s}`);
    }
  } else {
    lines.push("- **Stashed work:** none");
  }
  lines.push("");

  // In flight
  if (inProgress.length > 0) {
    lines.push("## In Flight (from GitHub)");
    for (const i of inProgress) {
      lines.push(`- #${i.number}: ${i.title}`);
    }
    lines.push("");
  }

  // Next priority
  if (nextTask) {
    const labels = nextTask.labels.length ? ` [${nextTask.labels.join(", ")}]` : "";
    lines.push("## Next Priority");
    lines.push(`#${nextTask.number}: ${nextTask.title}${labels}`);
    lines.push("");
  }

  // Blockers
  if (blockers.length > 0) {
    lines.push("## Blockers");
    for (const b of blockers) {
      lines.push(`- #${b.number}: ${b.title}`);
    }
    lines.push("");
  }

  // PLAN.md snippet
  if (planSnippet) {
    lines.push("## Active Plan (from PLAN.md)");
    lines.push("```");
    lines.push(planSnippet);
    lines.push("```");
    lines.push("");
  }

  // Session notes from --message flag
  if (options.message) {
    lines.push("## Session Notes");
    lines.push(options.message);
    lines.push("");
  }

  // Instructions for next session
  lines.push("## For Next Session");
  lines.push("1. Run `codebase brief` to load full project context");
  lines.push("2. Run `git status` to see any uncommitted work");
  if (branch) {
    lines.push(`3. You are on branch \`${branch}\``);
  }
  if (nextTask) {
    lines.push(`4. Highest priority: #${nextTask.number}`);
  }
  lines.push("");

  // Write file
  const handoffPath = join(root, "HANDOFF.md");
  writeFileSync(handoffPath, lines.join("\n"), "utf-8");

  success(`HANDOFF.md written`);
  info(`  Branch: ${branch || "unknown"}`);
  info(`  Commits captured: ${recentCommits.length}`);
  if (inProgress.length > 0) {
    info(`  In progress: ${inProgress.map((i) => `#${i.number}`).join(", ")}`);
  }
  if (nextTask) {
    info(`  Next task: #${nextTask.number}: ${nextTask.title}`);
  }
}
