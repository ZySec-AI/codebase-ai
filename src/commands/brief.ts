import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { CLIOptions, Manifest } from "../types.js";
import { generateBrief, generateSlimBrief } from "../mcp/brief.js";
import { error, warn } from "../utils/output.js";

/**
 * `codebase brief` — outputs a complete project briefing for AI consumption.
 *
 * This is THE interface for AI tools. They run this command and get back
 * everything they need to start working: project identity, stack, commands,
 * current status, next task, blockers, decisions, and available actions.
 *
 * Supports:
 * - --categories <list>: filter to specific sections (e.g., "stack,commands,status")
 * - --format <fmt>: output format (text, json, markdown) - default is text (markdown)
 *
 * No file reading. No JSON parsing. Just run the command, get the answer.
 */
export async function runBrief(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const manifestPath = join(root, ".codebase.json");

  if (!existsSync(manifestPath)) {
    console.error("No manifest found. Run 'codebase init' to set up this project first.");
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    const content = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(content);
  } catch {
    error("No .codebase.json found (or it's corrupted). Run `npx codebase` first.");
    process.exit(1);
  }

  // Warn if GitHub data is absent
  if (!options.quiet && !manifest.status && !manifest.roadmap) {
    warn(
      "GitHub data unavailable (gh not authenticated or --sync not used). Issues, PRs and milestones not included."
    );
  }

  // Filter by categories if specified
  let filteredManifest = manifest;
  if (options.categories.length > 0) {
    filteredManifest = filterManifest(manifest, options.categories);
  }

  // Generate output based on format
  const output = options.slim
    ? generateSlimBrief(filteredManifest)
    : generateOutput(filteredManifest, options.format);
  process.stdout.write(output + "\n");
}

/**
 * Filter manifest to only include specified categories.
 * Always includes 'project' for title/header context.
 *
 * Categories: repo, structure, stack, commands, dependencies,
 *             config, git, quality, patterns, status, roadmap, decisions
 */
function filterManifest(manifest: Manifest, categories: string[]): Manifest {
  const result: Manifest = {
    version: manifest.version,
    generated_at: manifest.generated_at,
    // Always include project for header
    project: manifest.project,
  };

  const categoryMap: Record<string, keyof Manifest> = {
    project: "project",
    repo: "repo",
    structure: "structure",
    stack: "stack",
    commands: "commands",
    dependencies: "dependencies",
    config: "config",
    git: "git",
    quality: "quality",
    patterns: "patterns",
    status: "status",
    roadmap: "roadmap",
    decisions: "decisions",
  };

  for (const cat of categories) {
    const key = categoryMap[cat.toLowerCase()];
    if (key && manifest[key]) {
      (result as unknown as Record<string, unknown>)[key] = manifest[key];
    }
  }

  return result;
}

/**
 * Generate output in the specified format.
 */
function generateOutput(manifest: Manifest, format: string): string {
  if (format === "json") {
    return JSON.stringify(manifest, null, 2);
  }

  // Both "text" and "markdown" use the brief generator (markdown format)
  return generateBrief(manifest);
}
