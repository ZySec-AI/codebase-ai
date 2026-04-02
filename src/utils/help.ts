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
};

export function printMainHelp(): void {
  console.log(`
${bold("codebase")} — One command. Every AI tool understands your project instantly.

${bold("QUICK START")}
  ${command("npx codebase")}              ← Run this once. That's it.

${bold("AI INTERFACE")}
  These are the commands your AI tools call:

  ${command("codebase brief")}             Full project briefing — run this first
  ${command("codebase brief --slim")}      Lightweight brief (~20 lines) for session-start hooks
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
  ${command("codebase tokens")}            Token budget report (A/B/C/D grades)

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
