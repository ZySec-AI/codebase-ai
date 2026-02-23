import type { CLIOptions } from "../types.js";
import { printMainHelp, printCommandHelp } from "./help.js";

const DEFAULTS: CLIOptions = {
  command: "scan",
  subcommand: "",
  positionals: [],
  path: process.cwd(),
  format: "text",
  depth: 4,
  categories: [],
  incremental: false,
  quiet: false,
  raw: false,
  verbose: false,
  port: 7432,
  tools: [],
  dryRun: false,
  debounce: 2000,
  watch: false,
  since: "",
  sync: false,
  message: "",
  reason: "",
  examples: false,
  helpCommand: false,
};

const COMMANDS = new Set([
  "scan", "setup", "query", "watch", "mcp", "serve",
  "hook", "diff", "export", "issue", "status", "init", "scan-only",
  "brief", "next", "doctor", "fix", "pr",
]);

export function parseArgs(argv: string[]): CLIOptions {
  const opts: CLIOptions = { ...DEFAULTS };
  const positionals: string[] = [];

  // First pass: check for command to enable --help for specific commands
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-") && COMMANDS.has(arg)) {
      opts.command = arg;
      // Check if next arg is --help
      if (argv[i + 1] === "--help" || argv[i + 1] === "-h") {
        opts.helpCommand = true;
        return opts;
      }
      break;
    }
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    // Global help (no command specified yet)
    if ((arg === "--help" || arg === "-h") && !opts.command) {
      printMainHelp();
      process.exit(0);
    }

    if (arg === "--version" || arg === "-v") {
      console.log("codebase 0.1.0");
      process.exit(0);
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);

      if (key === "quiet" || key === "q") { opts.quiet = true; continue; }
      if (key === "raw") { opts.raw = true; continue; }
      if (key === "verbose" || key === "V") { opts.verbose = true; continue; }
      if (key === "incremental") { opts.incremental = true; continue; }
      if (key === "dry-run") { opts.dryRun = true; continue; }
      if (key === "watch") { opts.watch = true; continue; }
      if (key === "sync") { opts.sync = true; continue; }
      if (key === "examples") { opts.examples = true; continue; }
      if (key === "mine") { positionals.push("mine"); continue; }

      const next = argv[i + 1];
      if (!next || next.startsWith("--")) continue;
      i++;

      if (key === "path") opts.path = next;
      else if (key === "format") opts.format = next;
      else if (key === "depth") opts.depth = parseInt(next, 10) || 4;
      else if (key === "categories") opts.categories = next.split(",").map(s => s.trim());
      else if (key === "port") opts.port = parseInt(next, 10) || 7432;
      else if (key === "tools") opts.tools = next.split(",").map(s => s.trim());
      else if (key === "debounce") opts.debounce = parseInt(next, 10) || 2000;
      else if (key === "since") opts.since = next;
      else if (key === "message" || key === "m") opts.message = next;
      else if (key === "reason") opts.reason = next;

      continue;
    }

    positionals.push(arg);
  }

  // First positional is command (if recognized)
  if (positionals.length > 0 && COMMANDS.has(positionals[0])) {
    opts.command = positionals.shift()!;
  }

  // Second positional could be subcommand (for hook install/uninstall, issue create/close/list)
  if (positionals.length > 0) {
    const sub = positionals[0];
    if (["install", "uninstall", "create", "close", "list", "map"].includes(sub)) {
      opts.subcommand = positionals.shift()!;
    }
  }

  opts.positionals = positionals;

  // If remaining positional looks like a path (starts with / or . or ~), use it
  if (positionals.length > 0 && /^[\/\.~]/.test(positionals[0])) {
    opts.path = positionals[0];
  }

  // Env var overrides
  if (process.env.CODEBASE_OUTPUT) opts.path = process.env.CODEBASE_OUTPUT;
  if (process.env.CODEBASE_PORT) opts.port = parseInt(process.env.CODEBASE_PORT, 10) || 7432;
  if (process.env.CODEBASE_DEPTH) opts.depth = parseInt(process.env.CODEBASE_DEPTH, 10) || 4;
  if (process.env.CODEBASE_QUIET === "true") opts.quiet = true;

  return opts;
}

export function showCommandHelp(commandName: string): void {
  printCommandHelp(commandName);
  process.exit(0);
}

function printHelp(): void {
  console.log(`
codebase - One command. Every AI tool understands your project instantly.

USAGE
  npx codebase              ← Run this once. That's it. Everything activates.

WHAT HAPPENS
  1. Scans your project (stack, commands, structure, patterns)
  2. Syncs GitHub data (issues, PRs, milestones, decisions) if \`gh\` CLI is available
  3. Writes .codebase.json (your project's brain — ~4KB, ~500 tokens)
  4. Injects smart instructions into all detected AI tools (Claude, Cursor, Windsurf, etc.)
  5. Auto-configures MCP server so AI tools get native access
  6. Installs git hooks — manifest auto-updates on every commit and branch switch
  7. Updates .gitignore

  After this, you never run codebase again. It stays alive through git hooks.
  Your AI tools automatically know what to work on, what's blocked, and what was decided.

AI INTERFACE (what your AI tools call)
  codebase brief             Full project briefing — AI runs this first
  codebase next              Highest-priority task + what's in progress
  codebase status            Kanban board, priorities, milestones
  codebase query <path>      Any data point (e.g. stack.languages, commands.test)
  codebase issue create      Create a GitHub issue
  codebase issue close <n>   Close a GitHub issue with reason

HUMAN COMMANDS
  codebase                   Full activation (default — does everything above)
  codebase watch             Watch files and re-scan on changes
  codebase diff              Show changes since last scan
  codebase export            Export to tool-specific formats
  codebase mcp               Start MCP server (stdio)
  codebase serve             Start HTTP API server
  codebase doctor            Health check — diagnose setup issues
  codebase fix               Auto-repair anything doctor flags
  codebase hook uninstall    Remove git hooks

OPTIONS
  --path <dir>             Target project directory (default: cwd)
  --depth <n>              Directory tree depth (default: 4)
  --quiet                  No stdout output
  --raw                    Plain text output for piping
  --port <n>               HTTP server port (default: 7432)
  --format <format>        Export format (json, claude-md, cursor-rules, markdown)
  -h, --help               Show this help
  -v, --version            Show version

EXAMPLES
  npx codebase                              # activate everything (one time)
  codebase brief                            # what AI tools call at session start
  codebase next                             # what should I work on?
  codebase query commands.test --raw | sh   # run tests directly
  codebase issue create "Fix login bug"     # track a bug
`);
}
