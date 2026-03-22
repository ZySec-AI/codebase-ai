import { resolve, join } from "node:path";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import type { CLIOptions, Integration } from "../types.js";
import { scan, summarizeCategory } from "../scanner/engine.js";
import { detectTools } from "../integrations/index.js";
import { claudeIntegration } from "../integrations/claude.js";
import { updateGitignore } from "../integrations/gitignore.js";
import { installHooks } from "../integrations/githook.js";
import { log, success, info, warn, heading, setQuiet } from "../utils/output.js";

/**
 * `npx codebase` — the ONE command that does everything:
 *
 * 1. Scans the project (code structure, stack, commands, patterns)
 * 2. Auto-detects `gh` CLI and syncs GitHub data (issues, PRs, milestones, decisions)
 * 3. Writes .codebase.json
 * 4. Detects all AI tools (project + global configs) and injects smart instructions
 * 5. Auto-configures MCP server in Claude Code
 * 6. Installs git hooks (post-commit + post-checkout) for auto-updates
 * 7. Updates .gitignore
 *
 * After this, the user never runs another codebase command manually.
 * Everything stays alive through hooks, MCP, and AI tool integrations.
 */
/**
 * Detect if the project has already been initialized:
 * .codebase.json exists AND at least one AI tool has injection markers present.
 */
function isAlreadyInitialized(root: string): boolean {
  if (!existsSync(join(root, ".codebase.json"))) {
    return false;
  }
  // Check for Claude injection marker in CLAUDE.md — require BOTH start AND end markers
  const claudeMd = join(root, "CLAUDE.md");
  if (existsSync(claudeMd)) {
    try {
      const content = readFileSync(claudeMd, "utf-8");
      const hasHtmlMarkers =
        content.includes("<!-- codebase:start -->") && content.includes("<!-- codebase:end -->");
      const hasHashMarkers =
        content.includes("# codebase:start") && content.includes("# codebase:end");
      if (hasHtmlMarkers || hasHashMarkers) {
        return true;
      }
    } catch {
      /* unreadable */
    }
  }
  return false;
}

export async function runInit(options: CLIOptions): Promise<void> {
  setQuiet(options.quiet);
  const root = resolve(options.path);

  // If already initialized and not forced, just refresh the manifest
  if (isAlreadyInitialized(root) && !options.force) {
    heading("codebase — refreshing project manifest\n");
    const ghStatus = await checkGhDetailed();
    const ghAvailable = ghStatus === "authenticated";
    log(`Scanning ${root}...`);
    const manifest = await scan(root, {
      depth: options.depth,
      categories: options.categories.length ? options.categories : undefined,
      quiet: options.quiet,
      sync: ghAvailable,
    });
    const outputPath = join(root, ".codebase.json");
    const content = JSON.stringify(manifest, null, 2);
    await writeFile(outputPath, content, "utf-8");
    const sizeKB = (Buffer.byteLength(content) / 1024).toFixed(1);
    success(`Manifest refreshed — .codebase.json (${sizeKB} KB)`);
    info("Already initialized. Run with --force to force full re-setup.");
    return;
  }

  heading("codebase — activating project intelligence\n");

  // ─── Step 1: Detect GitHub CLI ──────────────────────────────────
  const ghStatus = await checkGhDetailed();

  if (ghStatus === "authenticated") {
    success("GitHub CLI — authenticated");
  } else if (ghStatus === "not-authenticated") {
    warn("GitHub CLI installed but not logged in");
    info("Run: gh auth login");
    info("After login, re-run `npx codebase` for full GitHub integration\n");
  } else {
    info("GitHub CLI not found — GitHub features disabled");
    info("To enable: brew install gh && gh auth login\n");
  }

  const ghAvailable = ghStatus === "authenticated";

  // ─── Step 2: Full scan + GitHub sync ───────────────────────────
  log(`Scanning ${root}...`);

  const manifest = await scan(root, {
    depth: options.depth,
    categories: options.categories.length ? options.categories : undefined,
    quiet: options.quiet,
    sync: ghAvailable,
  });

  for (const [category, data] of Object.entries(manifest)) {
    if (category === "version" || category === "generated_at") {
      continue;
    }
    if (typeof data !== "object" || data === null) {
      continue;
    }
    success(
      `${capitalize(category)} (${summarizeCategory(category, data as Record<string, unknown>)})`
    );
  }

  // Write manifest
  const outputPath = join(root, ".codebase.json");
  const content = JSON.stringify(manifest, null, 2);
  await writeFile(outputPath, content, "utf-8");

  const sizeKB = (Buffer.byteLength(content) / 1024).toFixed(1);
  log(`\nWritten: .codebase.json (${sizeKB} KB)`);

  // ─── Step 3: AI tool detection + integration ───────────────────
  heading("AI Tool Integration");

  let tools = detectTools(root);
  const globalTools = detectGlobalTools();

  // Merge: project-level detection + global config detection
  const toolNames = new Set(tools.map((t) => t.name));
  for (const gt of globalTools) {
    if (!toolNames.has(gt.name)) {
      tools.push(gt);
      toolNames.add(gt.name);
    }
  }

  if (tools.length === 0) {
    // Nothing detected anywhere — create CLAUDE.md as universal default
    info("No AI tool detected in project or system configs");
    info("Creating CLAUDE.md as default (works with Claude Code, and readable by all tools)");
    writeFileSync(join(root, "CLAUDE.md"), "# Project Rules\n\n", "utf-8");
    tools = [claudeIntegration];
  } else {
    log(`  Detected: ${tools.map((t) => t.name).join(", ")}`);
  }

  for (const tool of tools) {
    const result = await tool.inject(root);
    if (result.ok) {
      success(`${tool.name} — instructions injected`);
    } else {
      warn(`${tool.name} — injection failed: ${result.message || "unknown error"}`);
    }
  }

  // ─── Step 4: Auto-configure MCP in supported tools ─────────────
  heading("MCP Server (native AI tool access)");

  const mcpConfigured = await autoConfigureMcp(root, toolNames);
  if (mcpConfigured.length) {
    for (const tool of mcpConfigured) {
      success(`${tool} — MCP server auto-configured`);
    }
    info("AI tools can now call project_brief, get_next_task, create_issue, etc. natively");
  } else {
    info("AI tools will read .codebase.json directly.");
    info("To enable MCP later, add to your tool's MCP config:");
    log('  { "command": "npx", "args": ["codebase", "mcp"] }');
  }

  // ─── Step 5: Git hooks (post-commit + post-checkout) ───────────
  heading("Auto-Update Hooks");

  const hooksInstalled = installHooks(root, ghAvailable);
  if (hooksInstalled) {
    success("post-commit hook — manifest updates on every commit");
    success("post-checkout hook — manifest updates on branch switch");
    if (ghAvailable) {
      success("hooks include GitHub sync — issues/PRs stay current");
    }
  } else {
    info("Not a git repository — skipping hooks");
  }

  // ─── Step 6: Gitignore ─────────────────────────────────────────
  updateGitignore(root);
  success(".gitignore updated");

  // ─── Summary ───────────────────────────────────────────────────
  heading("Ready!\n");
  log("Your project is now fully activated. Here's what happens automatically:\n");
  log("  On every commit     → .codebase.json updates (code + GitHub data)");
  log("  On branch switch    → .codebase.json updates");
  log("  When AI starts      → reads .codebase.json or calls project_brief via MCP");
  log("  AI knows            → stack, commands, open issues, priorities, blockers, decisions");
  log("  AI can              → create issues, close issues, get next task, check blockers\n");

  if (ghAvailable) {
    const issueCount = manifest.status?.issues?.filter((i) => i.state === "open").length || 0;
    const prCount = manifest.status?.pull_requests?.filter((pr) => pr.state === "open").length || 0;
    if (issueCount || prCount) {
      log(`  GitHub synced: ${issueCount} open issues, ${prCount} open PRs`);
    }
  }

  log("\n  You don't need to run this again. Everything stays alive.\n");
}

// ─── Helpers ─────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type GhStatus = "authenticated" | "not-authenticated" | "not-installed";

/**
 * Check gh CLI: not installed → installed but not logged in → fully authenticated.
 */
export function checkGhDetailed(): Promise<GhStatus> {
  return new Promise((resolve) => {
    // First check if gh is even installed
    execFile("sh", ["-c", "which gh 2>/dev/null"], { timeout: 5_000 }, (err) => {
      if (err) {
        resolve("not-installed");
        return;
      }
      // gh exists, check auth
      execFile(
        "sh",
        ["-c", "gh auth status 2>&1"],
        { timeout: 10_000 },
        (authErr, stdout, stderr) => {
          const output = (stdout || "") + (stderr || "");
          if (!authErr && output.includes("Logged in")) {
            resolve("authenticated");
          } else {
            resolve("not-authenticated");
          }
        }
      );
    });
  });
}

/**
 * Detect AI tools from global/system-level config files.
 * Checks if Claude Code is installed globally.
 */
export function detectGlobalTools(): Integration[] {
  const home = homedir();
  const found: Integration[] = [];

  if (existsSync(join(home, ".claude"))) {
    found.push(claudeIntegration);
  }

  return found;
}

/**
 * Auto-configure MCP server in Claude Code via project-level .mcp.json.
 */
export async function autoConfigureMcp(
  root: string,
  detectedTools: Set<string>
): Promise<string[]> {
  const configured: string[] = [];
  const mcpEntry = {
    command: "npx",
    args: ["codebase", "mcp"],
    cwd: root,
  };

  if (detectedTools.has("claude") || detectedTools.size === 0) {
    const projectMcpPath = join(root, ".mcp.json");
    if (await configureMcpFile(projectMcpPath, "codebase", mcpEntry)) {
      configured.push("Claude Code (project .mcp.json)");
    }
  }

  return configured;
}

export async function configureMcpFile(
  filePath: string,
  serverName: string,
  entry: Record<string, unknown>
): Promise<boolean> {
  let config: Record<string, unknown> = {};

  if (existsSync(filePath)) {
    try {
      config = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      config = {};
    }

    // Already configured?
    const servers = config.mcpServers as Record<string, unknown> | undefined;
    if (servers && servers[serverName]) {
      return false;
    }
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  (config.mcpServers as Record<string, unknown>)[serverName] = entry;

  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  await rename(tmpPath, filePath);
  return true;
}
