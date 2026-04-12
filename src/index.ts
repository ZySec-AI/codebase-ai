import { parseArgs, showCommandHelp } from "./utils/args.js";
import { setQuiet, setVerbose, error, info, bold } from "./utils/output.js";
import { checkForUpdate } from "./utils/update-check.js";
import { runScan } from "./commands/scan.js";
import { runSetup } from "./commands/setup.js";
import { runInit } from "./commands/init.js";
import { runBrief } from "./commands/brief.js";
import { runNext } from "./commands/next.js";
import { runQuery } from "./commands/query.js";
import { runIssue } from "./commands/issue.js";
import { runStatus } from "./commands/status.js";
import { runMcp } from "./commands/mcp.js";
import { runDoctor } from "./commands/doctor.js";
import { runFix } from "./commands/fix.js";
import { runRelease } from "./commands/release.js";
import { runPlan } from "./commands/plan.js";
import { runSkills } from "./commands/skills.js";
import { runTokens } from "./commands/tokens.js";
import { runHandoff } from "./commands/handoff.js";
import { runContext } from "./commands/context.js";
import { runStart, runSessions } from "./commands/start.js";
import { runConfig } from "./commands/config.js";
import { startServer } from "./server/index.js";
import { runUninstall } from "./commands/uninstall.js";
import { runGraph } from "./commands/graph.js";
import type { CLIOptions } from "./types.js";

const options = parseArgs(process.argv.slice(2));

// Set global output options
setQuiet(options.quiet);
setVerbose(options.verbose);

// Show command-specific help if requested
if (options.helpCommand && options.command) {
  showCommandHelp(options.command);
}

const commands: Record<string, (opts: CLIOptions) => Promise<void>> = {
  // "scan" updates .codebase.json only — lightweight, no AI tool injection
  scan: runScan,
  init: runInit,
  // AI-facing commands — these are the interface
  brief: runBrief,
  next: runNext,
  setup: runSetup,
  query: runQuery,
  issue: runIssue,
  status: runStatus,
  mcp: runMcp,
  doctor: runDoctor,
  fix: runFix,
  release: runRelease,
  plan: runPlan,
  skills: runSkills,
  tokens: runTokens,
  handoff: runHandoff,
  context: runContext,
  start: runStart,
  sessions: () => {
    runSessions();
    return Promise.resolve();
  },
  config: runConfig,
  uninstall: runUninstall,
  graph: runGraph,
  serve: (opts: CLIOptions) => {
    startServer(opts.path, opts.port ?? 3000);
    return Promise.resolve();
  },
  // Keep "scan-only" for hooks that just want manifest refresh
  "scan-only": runScan,
};

// ─── Global error handlers ────────────────────────────────────────
process.on("uncaughtException", (err: Error) => {
  error(`Uncaught exception: ${err.message}`);
  if (err.stack) {
    info(err.stack.split("\n").slice(1, 4).join("\n"));
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  error(`Unhandled promise rejection: ${msg}`);
  process.exit(1);
});

// Non-blocking update check — runs in background, shows prompt if outdated
checkForUpdate().catch(() => {});

// Node.js version check
const [major] = process.versions.node.split(".").map(Number);
if (major < 20) {
  console.error(
    `Error: Node.js 20 or higher is required. You are running v${process.versions.node}.`
  );
  console.error("Upgrade: https://nodejs.org");
  process.exit(1);
}

const handler = commands[options.command];
if (!handler) {
  error(`Unknown command: ${options.command}`);
  info(`Run ${bold("codebase --help")} to see all commands.`);
  process.exit(1);
}

handler(options).catch((err: Error) => {
  error(`Error: ${err.message}`);

  // Show helpful suggestions based on error message
  const msg = err.message.toLowerCase();
  if (msg.includes("not a git repository")) {
    info(`Initialize git first: ${bold("git init")}`);
  } else if (msg.includes("permission denied")) {
    info("Check file permissions or run with appropriate access");
  } else if (msg.includes("enoent") && msg.includes("gh")) {
    info(
      `GitHub CLI (gh) is not installed. Install it: ${bold("brew install gh && gh auth login")}`
    );
  } else if (msg.includes("no such file")) {
    info("Check that the path is correct");
  } else if (msg.includes("github")) {
    info(`Ensure GitHub CLI is installed: ${bold("gh --version")}`);
    info(`Authenticate: ${bold("gh auth login")}`);
  }

  process.exit(1);
});
