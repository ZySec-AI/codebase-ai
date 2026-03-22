import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import type { CLIOptions } from "../types.js";
import { log, info } from "../utils/output.js";

function extractSkillMd(skillPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("unzip", ["-p", skillPath, "*/SKILL.md"], (err, stdout) => {
      if (err && !stdout) {
        reject(err);
      } else {
        resolve(stdout ?? "");
      }
    });
  });
}

function parseYamlFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

export async function runSkills(_options: CLIOptions): Promise<void> {
  const skillsDir = join(process.env["HOME"] ?? "~", ".claude", "skills");

  if (!existsSync(skillsDir)) {
    log("No skills installed. Run: codebase setup");
    return;
  }

  const files = readdirSync(skillsDir).filter((f) => f.endsWith(".skill"));

  if (files.length === 0) {
    log("No skills installed. Run: codebase setup");
    return;
  }

  const rows: Array<{ name: string; description: string; file: string }> = [];

  for (const file of files) {
    const skillPath = join(skillsDir, file);
    let name = file.replace(/\.skill$/, "");
    let description = "";

    try {
      const content = await extractSkillMd(skillPath);
      const fm = parseYamlFrontmatter(content);
      if (fm["name"]) {
        name = fm["name"];
      }
      if (fm["description"]) {
        description = fm["description"];
      }
    } catch {
      // If unzip fails (e.g. not a zip), fall back to filename
    }

    rows.push({ name, description, file });
  }

  if (rows.length === 0) {
    log("No skills installed. Run: codebase setup");
    return;
  }

  // Calculate column widths
  const nameWidth = Math.max(4, ...rows.map((r) => r.name.length));
  const descWidth = Math.max(11, ...rows.map((r) => r.description.length));
  const fileWidth = Math.max(4, ...rows.map((r) => r.file.length));

  const pad = (s: string, w: number): string => s.padEnd(w);
  const sep = `  ${"─".repeat(nameWidth)}  ${"─".repeat(descWidth)}  ${"─".repeat(fileWidth)}`;

  info(`\n  ${pad("Name", nameWidth)}  ${pad("Description", descWidth)}  ${"File"}`);
  log(sep);
  for (const row of rows) {
    log(`  ${pad(row.name, nameWidth)}  ${pad(row.description, descWidth)}  ${row.file}`);
  }
  log("");
}
