import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { CLIOptions, Manifest } from "../types.js";
import { error, log, bold, info } from "../utils/output.js";
import { rankIssues } from "../github/sync.js";

function priorityReason(labels: string[]): string {
  for (const label of labels) {
    const l = label.toLowerCase();
    if (l.startsWith("status:")) {
      continue;
    }
    if (l.includes("p0") || l.includes("critical") || l.includes("urgent")) {
      return "critical (P0)";
    }
  }
  for (const label of labels) {
    const l = label.toLowerCase();
    if (l.startsWith("status:")) {
      continue;
    }
    if (l === "vibekit" || l.includes("p1") || l.includes("high") || l.includes("bug")) {
      return "high (P1)";
    }
  }
  for (const label of labels) {
    const l = label.toLowerCase();
    if (l.startsWith("status:")) {
      continue;
    }
    if (l.includes("p2") || l.includes("medium") || l === "arch") {
      return "medium (P2)";
    }
  }
  for (const label of labels) {
    const l = label.toLowerCase();
    if (l.startsWith("status:")) {
      continue;
    }
    if (l.includes("p3") || l.includes("low")) {
      return "low (P3)";
    }
  }
  for (const label of labels) {
    const l = label.toLowerCase();
    if (l.includes("feature")) {
      return "feature";
    }
  }
  return "unlabeled (lowest)";
}

/**
 * `codebase next` — returns the highest-priority task to work on.
 *
 * Output is structured for both human and AI consumption:
 *   - Issue number, title, labels
 *   - Mapped files (where to start)
 *   - What's currently in progress (so you don't collide)
 */
export async function runNext(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  if (!existsSync(join(root, ".codebase.json"))) {
    console.error("No manifest found. Run 'codebase init' to set up this project first.");
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    const content = await readFile(join(root, ".codebase.json"), "utf-8");
    manifest = JSON.parse(content);
  } catch {
    error("No .codebase.json found (or it's corrupted). Run `npx codebase` first.");
    process.exit(1);
  }

  const status = manifest.status;
  if (!status || !status.github_available) {
    info("No GitHub data. Run `npx codebase` with `gh` CLI authenticated.");
    return;
  }

  // Show what's in progress first (awareness)
  const inProgress = status.kanban?.in_progress || [];
  if (inProgress.length) {
    log(bold("IN PROGRESS (don't duplicate):"));
    for (const i of inProgress) {
      const assignee = i.assignee ? ` → @${i.assignee}` : "";
      log(`  #${i.number}: ${i.title}${assignee}`);
    }
    log("");
  }

  // Show next task — fall back to live ranking if priorities list is stale/empty
  let priorities = status.priorities ?? [];
  if (!priorities.length) {
    const allOpen = (manifest.status?.issues ?? []).filter((i) => i.state === "open");
    priorities = rankIssues(allOpen);
  }
  const next = priorities[0];
  if (!next) {
    log("No open tasks in the backlog. Create one:");
    log('  codebase issue create "task title"');
    return;
  }

  log(bold("NEXT TASK:"));
  log(`  #${next.number}: ${next.title}`);
  if (next.labels.length) {
    log(`  Labels: ${next.labels.join(", ")}`);
  }
  log(`  Priority: ${priorityReason(next.labels)}`);
  if (next.effort) {
    const effortLabel = { S: "Small (hours)", M: "Medium (days)", L: "Large (weeks)" }[next.effort];
    log(`  Effort: ${effortLabel}`);
  }
  if (next.assignee) {
    log(`  Assignee: @${next.assignee}`);
  }
  if (next.milestone) {
    log(`  Milestone: ${next.milestone}`);
  }
  if (next.mapped_files?.length) {
    log(`  Start in: ${next.mapped_files.join(", ")}`);
  }

  // Show needs-verify queue
  const needsVerify = status.kanban?.needs_verify ?? [];
  if (needsVerify.length > 0) {
    log(`\n${bold("NEEDS VERIFY (simulate to close):")}`);
    for (const i of needsVerify.slice(0, 5)) {
      log(`  #${i.number}: ${i.title}`);
    }
  }

  // Show blockers
  const blocked =
    status.issues?.filter(
      (i) =>
        i.state === "open" &&
        i.labels.some(
          (l) => l.toLowerCase().includes("blocked") || l.toLowerCase().includes("blocker")
        )
    ) || [];

  if (blocked.length) {
    log(`\n${bold("BLOCKERS:")}`);
    for (const i of blocked) {
      log(`  #${i.number}: ${i.title} [${i.labels.join(", ")}]`);
    }
  }
}
