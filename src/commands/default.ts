import { existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function runDefault(root: string): Promise<void> {
  const manifestPath = join(root, ".codebase.json");

  if (!existsSync(manifestPath)) {
    // First run — trigger setup
    console.log("No .codebase.json found. Running setup...\n");
    const { runSetup } = await import("./setup.js");
    await runSetup({
      command: "setup",
      subcommand: "",
      positionals: [],
      path: root,
      quiet: false,
      verbose: false,
      format: "text",
      depth: 4,
      categories: [],
      incremental: false,
      force: false,
      port: 3000,
      tools: [],
      dryRun: false,
      since: "",
      sync: false,
      message: "",
      reason: "",
      examples: false,
      helpCommand: false,
      slim: false,
      model: "",
      provider: "",
    });
    return;
  }

  // Check staleness (> 1 hour)
  const { mtimeMs } = statSync(manifestPath);
  const ageMs = Date.now() - mtimeMs;
  if (ageMs > 60 * 60 * 1000) {
    process.stdout.write("codebase: manifest is stale, rescanning... ");
    const { runScan } = await import("./scan.js");
    await runScan({
      command: "scan",
      subcommand: "",
      positionals: [],
      path: root,
      quiet: true,
      incremental: true,
      verbose: false,
      format: "text",
      depth: 4,
      categories: [],
      force: false,
      port: 3000,
      tools: [],
      dryRun: false,
      since: "",
      sync: false,
      message: "",
      reason: "",
      examples: false,
      helpCommand: false,
      slim: false,
      model: "",
      provider: "",
    });
    console.log("done");
  }

  // Print 3-line status
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      project?: { name?: string };
      stack?: { languages?: string[] };
      status?: {
        priorities?: Array<{ number?: number; title?: string }>;
        kanban?: { in_progress?: unknown[] };
      };
    };
    const name = manifest.project?.name ?? "this project";
    const stack = manifest.stack?.languages?.join(", ") ?? "unknown";
    const nextIssue = manifest.status?.priorities?.[0];
    const blockers = manifest.status?.kanban?.in_progress?.length ?? 0;

    console.log(`✓ ${name} (${stack}) — codebase ready`);
    if (nextIssue) {
      console.log(`  Next: #${nextIssue.number} ${nextIssue.title}`);
    }
    if (blockers > 0) {
      console.log(`  In progress: ${blockers} issue(s)`);
    }
    console.log(`  Run \`codebase brief\` for full context or \`codebase next\` for next task.`);
  } catch {
    console.log("✓ codebase ready — run `codebase brief` for project context");
  }
}
