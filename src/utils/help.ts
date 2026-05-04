import { bold, code, command, link, dim } from "./output.js";

interface CommandHelp {
  description: string;
  usage: string;
  examples: Array<{ command: string; description: string }>;
  options?: Array<{ flag: string; description: string }>;
  seeAlso?: string[];
}

const HELP: Record<string, CommandHelp> = {
  scan: {
    description:
      "Scan project and update .codebase.json manifest (lightweight — no AI tool injection)",
    usage: "codebase scan [path] [options]",
    examples: [
      { command: "codebase scan", description: "Scan current directory" },
      { command: "codebase scan ./my-project", description: "Scan specific directory" },
      { command: "codebase scan --depth 6", description: "Include deeper directory structure" },
      {
        command: "codebase scan --categories stack,commands",
        description: "Scan only specific categories",
      },
    ],
    options: [
      { flag: "--path <dir>", description: "Target project directory (default: current)" },
      { flag: "--depth <n>", description: "Directory tree depth (default: 4)" },
      { flag: "--categories <list>", description: "Comma-separated categories to scan" },
      { flag: "--incremental", description: "Only re-scan changed areas" },
      { flag: "--quiet", description: "Suppress stdout output" },
      { flag: "--sync", description: "Sync GitHub data (requires gh CLI)" },
    ],
  },

  init: {
    description: "Initialize codebase with full setup (scan + AI tools + hooks)",
    usage: "codebase init [options]",
    examples: [
      { command: "codebase init", description: "One-time setup for current project" },
      {
        command: "codebase init --dry-run",
        description: "Preview changes without modifying files",
      },
      { command: "codebase init --sync", description: "Include GitHub data sync" },
    ],
    options: [
      { flag: "--dry-run", description: "Preview changes without applying" },
      { flag: "--sync", description: "Sync GitHub data (requires gh CLI)" },
      { flag: "--quiet", description: "Suppress output" },
    ],
    seeAlso: ["scan", "setup"],
  },

  setup: {
    description: "Wire .codebase.json into Claude Code and install slash commands",
    usage: "codebase setup [options]",
    examples: [
      {
        command: "codebase setup",
        description: "Configure Claude Code, git hooks, and slash commands",
      },
    ],
    options: [{ flag: "--dry-run", description: "Preview changes" }],
  },

  brief: {
    description:
      "Get comprehensive project briefing (AI-facing). (GitHub STATUS section requires gh CLI auth)",
    usage: "codebase brief [options]",
    examples: [
      { command: "codebase brief", description: "Full project overview in one call" },
      {
        command: "codebase brief --format json | jq '.stack'",
        description: "Extract specific section as JSON",
      },
      {
        command: "codebase brief --categories stack,commands",
        description: "Only include selected sections",
      },
    ],
    options: [
      {
        flag: "--format <fmt>",
        description: "Output format: text (default), json, markdown",
      },
      {
        flag: "--categories <list>",
        description:
          "Comma-separated sections to include: stack,commands,status,git,roadmap,decisions",
      },
      {
        flag: "--slim",
        description: "Lightweight ~20-line brief (manifest age, next task, blockers, last commits)",
      },
    ],
    seeAlso: ["next", "status", "handoff"],
  },

  next: {
    description: "Show highest-priority task, what's in progress, and what needs verification",
    usage: "codebase next",
    examples: [
      { command: "codebase next", description: "Show next task to work on" },
      {
        command: "# Output blocks: IN PROGRESS | NEXT TASK | NEEDS VERIFY | BLOCKERS",
        description: "Four sections covering current state at a glance",
      },
      {
        command:
          "# Priority order: P0/critical/urgent → vibekit/P1/high/bug → P2/medium/arch → P3/low → feature → unlabeled",
        description: "How issues are ranked",
      },
    ],
    seeAlso: ["brief", "status"],
  },

  status: {
    description: "Show kanban board, priorities, milestones, and decisions",
    usage: "codebase status [view]",
    examples: [
      { command: "codebase status", description: "Kanban board + priorities (default)" },
      { command: "codebase status milestones", description: "Milestone progress bars" },
      { command: "codebase status priorities", description: "Priority queue only" },
      { command: "codebase status decisions", description: "Architecture decisions log" },
      { command: "codebase status --mine", description: "Show only my assigned tasks" },
    ],
    options: [
      { flag: "[view]", description: "One of: (none), milestones, priorities, decisions" },
      { flag: "--mine", description: "Show only your assigned items" },
    ],
    seeAlso: ["brief", "next"],
  },

  query: {
    description: "Query specific field from manifest using dot-path",
    usage: "codebase query <path> [options]",
    examples: [
      { command: "codebase query stack.languages", description: 'Get: ["typescript"]' },
      { command: "codebase query commands.test --force | sh", description: "Run test command" },
      { command: "codebase query dependencies.notable", description: "List notable packages" },
    ],
    options: [{ flag: "--force", description: "Plain text output (no JSON)" }],
  },

  graph: {
    description: "Build and query the persistent call/import graph (.codebase/graph.json)",
    usage: "codebase graph <subcommand> [args]",
    examples: [
      { command: "codebase graph build", description: "Full graph build for this project" },
      { command: "codebase graph update", description: "Incremental update (changed files only)" },
      {
        command: "codebase graph impact src/mcp/server.ts",
        description: "Blast radius for a file",
      },
      { command: "codebase graph impact --pr 42", description: "Blast radius for PR #42 changes" },
      {
        command: "codebase graph query callers src/graph/engine.ts",
        description: "Files that import engine.ts",
      },
      { command: "codebase graph query symbol runGraph", description: "Find nodes named runGraph" },
      { command: "codebase graph query entrypoints", description: "Detected entry points" },
      { command: "codebase graph stats", description: "Node/edge counts per language" },
      { command: "codebase graph dead", description: "Unreachable files + dead exports" },
      { command: "codebase graph cycles", description: "Import cycles (SCCs)" },
      { command: "codebase graph orphans", description: "Files with no importers/imports" },
    ],
    options: [
      { flag: "build", description: "Full rebuild" },
      { flag: "update", description: "Incremental rebuild (diff by content hash)" },
      { flag: "impact <file...>", description: "Transitive callers + covering tests + risk score" },
      { flag: "impact --pr <N>", description: "Impact for PR's changed files (requires gh CLI)" },
      { flag: "query callers|callees|symbol|entrypoints", description: "Graph queries" },
      { flag: "stats", description: "Language breakdown of nodes and edges" },
      { flag: "dead", description: "Reachability-based dead code (files + exports)" },
      { flag: "cycles", description: "Import cycles via Tarjan SCC" },
      { flag: "orphans", description: "Disconnected files (zero in/out edges)" },
    ],
    seeAlso: ["scan", "brief"],
  },

  issue: {
    description: "Manage GitHub issues",
    usage: "codebase issue <subcommand> [args]",
    examples: [
      { command: 'codebase issue create "Fix auth bug"', description: "Create new issue" },
      {
        command: 'codebase issue close 42 --reason "Fixed in PR #123"',
        description: "Close with reason",
      },
      {
        command: 'codebase issue comment 42 --message "Fixed by refactoring auth flow"',
        description: "Add comment",
      },
      { command: "codebase issue list", description: "List all issues" },
      { command: "codebase issue list --mine", description: "List your issues" },
    ],
    options: [
      { flag: "--message <text>", description: "Issue body (for create) or comment text" },
      { flag: "-m <text>", description: "Shorthand for --message" },
      { flag: "--reason <text>", description: "Close reason" },
    ],
  },

  mcp: {
    description:
      "Start MCP server for AI tool integration (Transport: stdio, Protocol: 2024-11-05). .mcp.json is written automatically by `codebase init`",
    usage: "codebase mcp",
    examples: [
      { command: "codebase mcp", description: "Start stdio MCP server" },
      {
        command:
          "# Tools: project_brief, get_codebase, query_codebase, get_next_task, get_blockers,",
        description: "",
      },
      {
        command: "#         create_issue, close_issue, update_issue, get_issue, get_pr,",
        description: "",
      },
      {
        command:
          "#         list_commands, list_skills, get_plan, update_plan, rescan_project, refresh_status",
        description: "16 tools total",
      },
    ],
    seeAlso: ["serve"],
  },

  serve: {
    description: "Start HTTP server (REST alternative to MCP, default port 3000)",
    usage: "codebase serve [--port N]",
    examples: [
      { command: "codebase serve", description: "Start HTTP server on port 3000" },
      { command: "codebase serve --port 8080", description: "Start on custom port" },
    ],
    options: [{ flag: "--port <n>", description: "Port to listen on (default: 3000)" }],
    seeAlso: ["mcp"],
  },

  skills: {
    description: "List installed Claude skills",
    usage: "codebase skills",
    examples: [
      { command: "codebase skills", description: "List all installed skills with descriptions" },
    ],
    seeAlso: ["setup"],
  },

  doctor: {
    description: "Diagnose setup and configuration issues",
    usage: "codebase doctor",
    examples: [{ command: "codebase doctor", description: "Run health check" }],
    seeAlso: ["fix"],
  },

  fix: {
    description: "Auto-repair issues found by doctor",
    usage: "codebase fix",
    examples: [{ command: "codebase fix", description: "Auto-fix all issues" }],
    seeAlso: ["doctor"],
  },

  release: {
    description: "Gate check → tag → merge develop→main → GitHub release",
    usage: "codebase release [version] [options]",
    examples: [
      { command: "codebase release", description: "Auto-increment version and release" },
      { command: "codebase release v1.2.0", description: "Release with explicit version" },
      { command: "codebase release --dry-run", description: "Preview release without tagging" },
    ],
    options: [
      { flag: "--dry-run", description: "Preview release notes without creating tag or merge" },
    ],
    seeAlso: ["doctor"],
  },

  handoff: {
    description: "Generate HANDOFF.md capturing current session state for context transfer",
    usage: "codebase handoff [options]",
    examples: [
      { command: "codebase handoff", description: "Generate HANDOFF.md in project root" },
      {
        command: 'codebase handoff --message "Finished auth, next: billing"',
        description: "Include session notes",
      },
    ],
    options: [
      {
        flag: "--message <text>",
        description: "Session notes to include in HANDOFF.md",
      },
    ],
    seeAlso: ["brief"],
  },

  tokens: {
    description: "Estimate per-session token budget across all context sources",
    usage: "codebase tokens",
    examples: [
      { command: "codebase tokens", description: "Show token budget with A/B/C/D grades" },
    ],
    seeAlso: ["doctor"],
  },

  config: {
    description: "View and set persistent config (~/.config/codebase/config.json)",
    usage: "codebase config [set|get|unset|path] [key] [value]",
    examples: [
      { command: "codebase config", description: "Show current config and effective env vars" },
      {
        command: "codebase config set openrouter-key sk-or-...",
        description: "Store OpenRouter API key",
      },
      {
        command: "codebase config set zai-key <key>",
        description: "Store z.ai API key (GLM models)",
      },
      {
        command: "codebase config set custom-url https://my-proxy/v1",
        description: "Set custom OpenAI-compatible endpoint",
      },
      {
        command: "codebase config set custom-key sk-...",
        description: "API key for custom endpoint",
      },
      {
        command: "codebase config set provider openrouter",
        description: "Remember provider across sessions",
      },
      { command: "codebase config path", description: "Print config file location" },
    ],
    options: [
      { flag: "set <key> <value>", description: "Set a key" },
      { flag: "get <key>", description: "Print a single value" },
      { flag: "unset <key>", description: "Remove a key" },
      { flag: "path", description: "Print config file path" },
    ],
    seeAlso: ["start"],
  },

  uninstall: {
    description: "Remove all codebase artifacts from the project",
    usage: "codebase uninstall --force",
    examples: [
      {
        command: "codebase uninstall --force",
        description: "Remove all codebase files, hooks, and configs",
      },
    ],
    options: [{ flag: "--force", description: "Required — confirms removal of all artifacts" }],
    seeAlso: ["doctor", "fix"],
  },

  start: {
    description: "Launch Claude Code with smart model routing (default command when no args given)",
    usage: "codebase start [options]",
    examples: [
      { command: "codebase", description: "Interactive launcher — detect providers, pick model" },
      { command: "codebase start", description: "Same as above, explicit" },
      {
        command: "codebase start --provider openrouter",
        description: "Use OpenRouter — shows live model browser",
      },
      {
        command: "codebase start --provider zai",
        description: "Use z.ai (GLM models, Anthropic-compatible API)",
      },
      {
        command: "codebase start --model anthropic/claude-haiku-4-5",
        description: "Skip prompt, use specific model via OpenRouter",
      },
      {
        command: "codebase start --provider anthropic",
        description: "Force Anthropic direct (no routing)",
      },
    ],
    options: [
      {
        flag: "--provider <name>",
        description: "anthropic | openrouter | zai | custom — skip interactive prompt",
      },
      {
        flag: "--model <id>",
        description: "Model ID to pass to claude (e.g. anthropic/claude-haiku-4-5)",
      },
    ],
    seeAlso: ["config", "sessions", "brief"],
  },

  sessions: {
    description: "Show recent Claude Code session log (provider, model, project, duration)",
    usage: "codebase sessions",
    examples: [{ command: "codebase sessions", description: "Show last 7 days of sessions" }],
    options: [],
    seeAlso: ["start", "tokens"],
  },

  prompts: {
    description:
      "Audit log of user prompts (.codebase/prompts.jsonl). Captured by the prompt-capture UserPromptSubmit hook.",
    usage: "codebase prompts [list|show|capture] [options]",
    examples: [
      { command: "codebase prompts list", description: "All captured prompts in this project" },
      {
        command: "codebase prompts list --issue 42",
        description: "Prompts that referenced #42",
      },
      {
        command: "codebase prompts list --since 24h --limit 20",
        description: "Recent prompts (relative time: 30m, 24h, 7d)",
      },
      {
        command: "codebase prompts show <id>",
        description: "Full body of a specific prompt",
      },
      {
        command: "echo 'fix #1' | codebase prompts capture",
        description: "Hook entry point — reads prompt from stdin (JSON or raw)",
      },
    ],
    options: [
      { flag: "--issue <n>", description: "Filter by referenced issue number" },
      { flag: "--branch <name>", description: "Filter by git branch" },
      { flag: "--since <dur>", description: "Relative window (e.g. 30m, 24h, 7d)" },
      { flag: "--limit <n>", description: "Cap number of records" },
      { flag: "--json", description: "Emit JSON instead of summary" },
      {
        flag: "--no-mirror",
        description: "(capture) Skip posting to GitHub even if issue refs found",
      },
    ],
    seeAlso: ["doctor", "handoff"],
  },

  context: {
    description: "Lightweight session context — slim brief, force reset, or check manifest age",
    usage: "codebase context [reset|age]",
    examples: [
      { command: "codebase context", description: "Output slim brief (same as brief --slim)" },
      {
        command: "codebase context reset",
        description: "Force re-scan + fresh slim brief; clears hook sentinels",
      },
      {
        command: "codebase context age",
        description: "Print manifest age in seconds (for use in scripts)",
      },
    ],
    options: [
      { flag: "reset", description: "Force re-scan and re-inject context on next prompt" },
      { flag: "age", description: "Print manifest staleness in seconds (−1 if missing)" },
    ],
    seeAlso: ["brief", "doctor"],
  },
};

export function printMainHelp(): void {
  console.log(`
${bold("codebase")} — One command. Every AI tool understands your project instantly.

${bold("QUICK START")}
  ${command("codebase")}                  ← Default: smart launcher → picks provider/model → starts Claude Code
  ${command("npx codebase")}              ← First time setup (init + start)

${bold("AI INTERFACE")}
  These are the commands your AI tools call:

  ${command("codebase brief")}             Full project briefing — run this first
  ${command("codebase brief --slim")}      Lightweight brief (~20 lines) for session-start hooks
  ${command("codebase context")}           Slim brief shorthand — used by session hooks
  ${command("codebase context reset")}     Force re-scan + fresh context injection
  ${command("codebase next")}              What should I work on next?
  ${command("codebase status")}            Kanban board, priorities, milestones
  ${command("codebase query <path>")}      Query any field (e.g. ${code("stack.languages")})
  ${command("codebase handoff")}           Generate HANDOFF.md for session transfer

${bold("AUTONOMOUS LOOP")}
  After ${command("codebase setup")}, these slash commands are available in Claude Code:

  ${command("/vibeloop")}                  Full autonomous run — simulate → build → launch (zero intervention)
  ${command("/setup")}                     Bootstrap project — labels, milestone, PRODUCT.md
  ${command("/simulate")}                  AI customer journeys (agent-browser) + UX audit
  ${command("/build")}                     Autonomous loop — build → test → simulate → repeat
  ${command("/launch")}                    Gate check → tag → release → merge to main
  ${command("/review")}                    Security, quality, deps, accessibility audit

  ${command("codebase skills")}            List installed Claude skills

${bold("HUMAN COMMANDS")}
  ${command("codebase init")}              Full setup (scan + AI tools + hooks)
  ${command("codebase scan")}              Update .codebase.json only (lightweight)
  ${command("codebase setup")}             Wire AI tools + install slash commands
  ${command("codebase release")}           Gate check → tag → develop→main
  ${command("codebase doctor")}            Health check & diagnostics
  ${command("codebase fix")}               Auto-repair issues found by doctor
  ${command("codebase tokens")}            Token budget report (A/B/C/D grades)
  ${command("codebase sessions")}          Recent Claude Code session log (provider, model, duration)
  ${command("codebase uninstall --force")} Remove all codebase artifacts

${bold("PROVIDER SETUP")}
  ${command("codebase config")}            Show stored keys and effective env vars
  ${command("codebase config set openrouter-key sk-or-...")}
  ${command("codebase config set zai-key <key>")}
  ${command("codebase config set custom-url https://my-proxy/v1")}
  ${command("codebase start --provider openrouter")}    Skip prompt, use OpenRouter
  ${command("codebase start --provider zai")}           Skip prompt, use z.ai

${bold("OPTIONS")}
  ${code("--help, -h")}                    Show this help or command-specific help
  ${code("--version, -v")}                 Show version
  ${code("--verbose")}                     Show detailed progress
  ${code("--quiet")}                       Suppress output

${bold("EXAMPLES")}
  ${command("npx codebase")}                              # One-time setup
  ${command("codebase brief")}                            # Project overview
  ${command("codebase next")}                             # Next task
  ${command("codebase query commands.test --force | sh")}   # Run tests
  ${command('codebase issue create "Fix bug"')}        # Track work

${bold("GLOBAL OPTIONS")}
  ${code("--path <dir>")}               Target directory (default: current)
  ${code("--verbose")}                   Show detailed output
  ${code("--quiet")}                     Minimal output

${bold("LEARN MORE")}
  Docs:     ${link("https://github.com/ZySec-AI/codebase#readme", "README.md")}
  Issues:   ${link("https://github.com/ZySec-AI/codebase/issues", "Report a bug")}
  Commands: ${command("codebase <command> --help")}  Show command-specific help
`);
}

export function printCommandHelp(commandName: string): void {
  const help = HELP[commandName];

  if (!help) {
    console.error(`\n  ${bold("✗")} Unknown command: ${commandName}\n`);
    console.log(`  Run ${command("codebase --help")} to see all commands.\n`);
    process.exit(1);
  }

  console.log(`
${bold(commandName)} — ${help.description}

${bold("USAGE")}
  ${code(help.usage)}
${
  help.examples.length > 0
    ? `
${bold("EXAMPLES")}
${help.examples.map((ex) => `  ${command(ex.command)}${dim(" # " + ex.description)}`).join("\n")}
`
    : ""
}${
    help.options
      ? `
${bold("OPTIONS")}
${help.options.map((opt) => `  ${code(opt.flag.padEnd(25))} ${opt.description}`).join("\n")}
`
      : ""
  }${
    help.seeAlso
      ? `
${bold("SEE ALSO")}
  ${help.seeAlso.map((c) => command(c)).join(", ")}
`
      : ""
  }${bold("MORE HELP")}
  ${command("codebase --help")}  Show all commands
  ${link("https://github.com/ZySec-AI/codebase/docs", "Full documentation")}
`);
}

// Error messages with helpful suggestions
export const ERROR_SUGGESTIONS: Record<string, { message: string; suggestion: string }> = {
  E_NO_GIT: {
    message: "Not a git repository",
    suggestion: "Initialize git first: " + command("git init"),
  },
  E_NO_PACKAGE_JSON: {
    message: "No package.json found",
    suggestion: "Initialize project: " + command("npm init") + " or " + command("pnpm init"),
  },
  E_GH_NOT_AUTHENTICATED: {
    message: "GitHub CLI not authenticated",
    suggestion: "Run: " + command("gh auth login"),
  },
  E_MANIFEST_NOT_FOUND: {
    message: ".codebase.json not found",
    suggestion: "Run: " + command("codebase init") + " to generate it",
  },
  E_INVALID_PATH: {
    message: "Invalid directory path",
    suggestion: "Use absolute path or path relative to current directory",
  },
  E_PERMISSION_DENIED: {
    message: "Permission denied",
    suggestion: "Check file permissions or run with appropriate access",
  },
};

export function getErrorSuggestion(
  errorCode: string
): { message: string; suggestion: string } | undefined {
  return ERROR_SUGGESTIONS[errorCode];
}
