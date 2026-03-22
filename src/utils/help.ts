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
    description: "Scan project and generate .codebase.json manifest",
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
    description: "Get comprehensive project briefing (AI-facing)",
    usage: "codebase brief",
    examples: [
      { command: "codebase brief", description: "Full project overview in one call" },
      { command: "codebase brief | jq '.stack'", description: "Extract specific section" },
    ],
    seeAlso: ["next", "status"],
  },

  next: {
    description: "Show highest-priority task and what's in progress",
    usage: "codebase next",
    examples: [{ command: "codebase next", description: "Show next task to work on" }],
    seeAlso: ["brief", "status"],
  },

  status: {
    description: "Show kanban board, priorities, and milestones",
    usage: "codebase status",
    examples: [
      { command: "codebase status", description: "Full project status" },
      { command: "codebase status --mine", description: "Show only my assigned tasks" },
    ],
    options: [{ flag: "--mine", description: "Show only your assigned items" }],
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
    description: "Start MCP server for AI tool integration",
    usage: "codebase mcp",
    examples: [{ command: "codebase mcp", description: "Start stdio MCP server" }],
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
};

export function printMainHelp(): void {
  console.log(`
${bold("codebase")} — One command. Every AI tool understands your project instantly.

${bold("QUICK START")}
  ${command("npx codebase")}              ← Run this once. That's it.

${bold("AI INTERFACE")}
  These are the commands your AI tools call:

  ${command("codebase brief")}             Full project briefing — run this first
  ${command("codebase next")}              What should I work on next?
  ${command("codebase status")}            Kanban board, priorities, milestones
  ${command("codebase query <path>")}      Query any field (e.g. ${code("stack.languages")})

${bold("AUTONOMOUS LOOP")}
  After ${command("codebase setup")}, these slash commands are available in Claude Code:

  ${command("/setup")}                     Bootstrap project — labels, milestone, PRODUCT.md
  ${command("/simulate")}                  AI customer journeys (Playwright) + UX audit
  ${command("/build")}                     Autonomous loop — build → test → simulate → repeat
  ${command("/launch")}                    Gate check → tag → release → merge to main
  ${command("/review")}                    Security, quality, deps, accessibility audit

${bold("HUMAN COMMANDS")}
  ${command("codebase init")}              Full setup (scan + AI tools + hooks)
  ${command("codebase scan")}              Generate/update .codebase.json
  ${command("codebase setup")}             Wire AI tools + install slash commands
  ${command("codebase release")}           Gate check → tag → develop→main
  ${command("codebase doctor")}            Health check & diagnostics

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
