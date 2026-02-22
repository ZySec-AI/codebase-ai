import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import type { CLIOptions, Manifest } from "../types.js";
import { syncGitHub } from "../github/sync.js";
import { log, heading, error, info, bold } from "../utils/output.js";

export async function runStatus(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  // Try to read existing manifest first
  let manifest: Manifest | null = null;
  try {
    manifest = JSON.parse(await readFile(join(root, ".codebase.json"), "utf-8"));
  } catch {}

  // If no status data, sync from GitHub
  if (!manifest?.status) {
    info("Syncing from GitHub...");
    const ghData = await syncGitHub(root);
    if (!ghData) {
      error("Could not sync. Is `gh` CLI installed and authenticated?");
      process.exit(1);
    }
    if (manifest) {
      manifest.status = ghData.status;
      manifest.roadmap = ghData.roadmap;
      manifest.decisions = ghData.decisions;
    }
  }

  const status = manifest?.status;
  if (!status) {
    error("No status data available.");
    return;
  }

  // Query specific view
  const view = options.positionals[0];

  if (view === "kanban" || !view) {
    printKanban(status);
  }

  if (view === "priorities" || !view) {
    printPriorities(status);
  }

  if (view === "milestones" && manifest?.roadmap) {
    printMilestones(manifest.roadmap);
  }

  if (view === "decisions" && manifest?.decisions) {
    printDecisions(manifest.decisions);
  }
}

function printKanban(status: NonNullable<Manifest["status"]>): void {
  heading("Kanban Board");

  const { kanban } = status;

  log(`\n${bold("BACKLOG")} (${kanban.backlog.length})`);
  for (const i of kanban.backlog.slice(0, 10)) {
    log(`  #${i.number} ${i.title}`);
  }

  log(`\n${bold("IN PROGRESS")} (${kanban.in_progress.length})`);
  for (const i of kanban.in_progress.slice(0, 10)) {
    const assignee = i.assignee ? ` @${i.assignee}` : "";
    log(`  #${i.number} ${i.title}${assignee}`);
  }

  log(`\n${bold("DONE")} (${kanban.done.length} recent)`);
  for (const i of kanban.done.slice(0, 5)) {
    log(`  #${i.number} ${i.title}`);
  }
}

function printPriorities(status: NonNullable<Manifest["status"]>): void {
  heading("Priority Queue");

  for (const i of status.priorities.slice(0, 15)) {
    const labels = i.labels.length ? ` [${i.labels.join(", ")}]` : "";
    const assignee = i.assignee ? ` → @${i.assignee}` : "";
    log(`  #${i.number} ${i.title}${labels}${assignee}`);
  }
}

function printMilestones(roadmap: NonNullable<Manifest["roadmap"]>): void {
  heading("Milestones");

  for (const ms of roadmap.milestones) {
    const bar = progressBar(ms.progress.percent);
    const due = ms.due_date ? ` (due: ${ms.due_date.split("T")[0]})` : "";
    log(`\n  ${bold(ms.title)} ${bar} ${ms.progress.percent}%${due}`);
    log(`  ${ms.progress.closed}/${ms.progress.open + ms.progress.closed} issues closed`);
  }
}

function printDecisions(decisions: NonNullable<Manifest["decisions"]>): void {
  heading("Decisions");

  const all = [
    ...decisions.from_prs.map(d => ({ ...d, type: "PR" })),
    ...decisions.from_adrs.map(d => ({ ...d, type: "ADR" })),
    ...decisions.manual.map(d => ({ ...d, type: "Manual" })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  for (const d of all.slice(0, 15)) {
    log(`  [${d.type}] ${d.title}`);
    if (d.summary) log(`    ${d.summary.slice(0, 100)}`);
  }
}

function progressBar(percent: number): string {
  const filled = Math.round(percent / 5);
  const empty = 20 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}
