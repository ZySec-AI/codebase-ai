import { resolve, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { CLIOptions } from "../types.js";
import { log, heading, info, bold } from "../utils/output.js";

const PLAN_FILENAME = "PLAN.md";

/**
 * `codebase plan` — read or update PLAN.md, Claude's persistent working memory.
 *
 * Usage:
 *   codebase plan              → print current PLAN.md
 *   codebase plan --message "text"  → append a status update to PLAN.md
 */
export async function runPlan(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const planPath = join(root, PLAN_FILENAME);

  // Write mode: append a status update
  if (options.message) {
    await appendPlanUpdate(planPath, options.message);
    return;
  }

  // Read mode: print PLAN.md
  if (!existsSync(planPath)) {
    info("No PLAN.md found. Create one by running:");
    log("");
    log('  codebase plan --message "Started sprint. Working on auth refactor."');
    log("");
    log("Or create PLAN.md manually with the vibeloop schema:");
    log("  ## Current Sprint");
    log("  ## In Flight");
    log("  ## Decisions Log");
    log("  ## Blocked");
    return;
  }

  const content = await readFile(planPath, "utf-8");
  heading("PLAN.md");
  log(content);
}

async function appendPlanUpdate(planPath: string, message: string): Promise<void> {
  const timestamp = new Date().toISOString().split("T")[0];
  const entry = `\n<!-- updated: ${timestamp} -->\n${message.trim()}\n`;

  if (!existsSync(planPath)) {
    // Bootstrap PLAN.md with vibeloop schema
    const initial = `# PLAN.md — Autonomous Loop State

> Managed by Claude. Updated each build/simulate cycle.

## Current Sprint


## In Flight


## Decisions Log


## Blocked


## Update Log
${entry}`;
    await writeFile(planPath, initial, "utf-8");
    log(`${bold("Created")} PLAN.md`);
    return;
  }

  // Append to Update Log section or end of file
  let content = await readFile(planPath, "utf-8");
  if (content.includes("## Update Log")) {
    content = content.replace(/(## Update Log\n)/, `$1${entry}`);
  } else {
    content += `\n## Update Log\n${entry}`;
  }

  await writeFile(planPath, content, "utf-8");
  log(`${bold("Updated")} PLAN.md`);
}
