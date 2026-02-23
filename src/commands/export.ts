import { resolve, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { CLIOptions, Manifest } from "../types.js";
import { error } from "../utils/output.js";

export async function runExport(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const manifestPath = join(root, ".codebase.json");

  let manifest: Manifest;
  try {
    const content = await readFile(manifestPath, "utf-8");
    manifest = JSON.parse(content);
  } catch {
    error("No .codebase.json found (or it's corrupted). Run `npx codebase` first.");
    process.exit(1);
  }

  // Generate output based on format
  let output: string;
  switch (options.format) {
    case "claude-md":
      output = formatClaudeMd(manifest);
      break;
    case "cursor-rules":
      output = formatCursorRules(manifest);
      break;
    case "markdown":
      output = formatMarkdown(manifest);
      break;
    case "yaml":
      output = formatYaml(manifest);
      break;
    default:
      output = JSON.stringify(manifest, null, 2) + "\n";
  }

  // Check if output should go to file
  const outputFile = options.positionals[0];
  if (outputFile) {
    const outputPath = resolve(root, outputFile);
    await writeFile(outputPath, output, "utf-8");
    console.log(`Exported to ${outputPath}`);
  } else {
    process.stdout.write(output);
  }
}

function formatClaudeMd(m: Manifest): string {
  const lines: string[] = ["## Project Context\n"];

  if (m.stack) {
    const parts = [
      m.stack.languages?.join(", "),
      m.stack.frameworks?.join(", "),
    ].filter(Boolean);
    lines.push(`- **Stack**: ${parts.join(", ")}`);
    if (m.stack.database) lines.push(`- **Database**: ${m.stack.database}${m.stack.orm ? ` (${m.stack.orm})` : ""}`);
  }

  if (m.commands) {
    const cmds = Object.entries(m.commands)
      .filter(([, v]) => v)
      .map(([k, v]) => `\`${v}\` (${k})`)
      .join(" | ");
    if (cmds) lines.push(`- **Commands**: ${cmds}`);
  }

  if (m.structure?.entry_points?.length) {
    lines.push(`- **Entry**: ${m.structure.entry_points.join(", ")}`);
  }

  if (m.patterns) {
    const parts = [m.patterns.architecture, m.patterns.state_management, m.patterns.api_style].filter(Boolean);
    if (parts.length) lines.push(`- **Architecture**: ${parts.join(", ")}`);
  }

  if (m.quality) {
    const parts = [m.quality.test_framework, m.quality.linter, m.quality.ci].filter(Boolean);
    if (parts.length) lines.push(`- **Quality**: ${parts.join(", ")}`);
  }

  if (m.status?.issues?.length) {
    const open = m.status.issues.filter(i => i.state === "open");
    lines.push(`\n### Active Issues (${open.length} open)`);
    for (const issue of open.slice(0, 10)) {
      const labels = issue.labels.length ? ` [${issue.labels.join(", ")}]` : "";
      lines.push(`- #${issue.number}: ${issue.title}${labels}`);
    }
  }

  return lines.join("\n") + "\n";
}

function formatCursorRules(m: Manifest): string {
  const lines: string[] = ["# Project Context\n"];

  if (m.stack) {
    lines.push(`Stack: ${[...(m.stack.languages || []), ...(m.stack.frameworks || [])].join(", ")}`);
    if (m.stack.package_manager) lines.push(`Package manager: ${m.stack.package_manager}`);
  }

  if (m.commands) {
    lines.push("\nCommands:");
    for (const [name, cmd] of Object.entries(m.commands)) {
      if (cmd) lines.push(`  ${name}: ${cmd}`);
    }
  }

  if (m.structure?.entry_points?.length) {
    lines.push(`\nEntry points: ${m.structure.entry_points.join(", ")}`);
  }

  if (m.patterns?.architecture) {
    lines.push(`Architecture: ${m.patterns.architecture}`);
  }

  return lines.join("\n") + "\n";
}

function formatMarkdown(m: Manifest): string {
  const lines: string[] = [`# Project: ${m.repo?.url || "Local Project"}\n`];
  lines.push(`Generated: ${m.generated_at}\n`);

  if (m.stack) {
    lines.push("## Tech Stack");
    lines.push(`- Languages: ${m.stack.languages?.join(", ") || "unknown"}`);
    lines.push(`- Frameworks: ${m.stack.frameworks?.join(", ") || "none"}`);
    if (m.stack.database) lines.push(`- Database: ${m.stack.database}`);
    if (m.stack.orm) lines.push(`- ORM: ${m.stack.orm}`);
    lines.push("");
  }

  if (m.commands) {
    lines.push("## Commands");
    for (const [name, cmd] of Object.entries(m.commands)) {
      if (cmd) lines.push(`- **${name}**: \`${cmd}\``);
    }
    lines.push("");
  }

  if (m.status?.issues?.length) {
    const open = m.status.issues.filter(i => i.state === "open");
    lines.push(`## Issues (${open.length} open)`);
    for (const issue of open.slice(0, 15)) {
      lines.push(`- [#${issue.number}] ${issue.title} (${issue.labels.join(", ") || "no labels"})`);
    }
    lines.push("");
  }

  if (m.roadmap?.milestones?.length) {
    lines.push("## Roadmap");
    for (const ms of m.roadmap.milestones) {
      lines.push(`- **${ms.title}**: ${ms.progress.percent}% complete (${ms.progress.closed}/${ms.progress.open + ms.progress.closed})`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}
