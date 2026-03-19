import { parseArgs, showCommandHelp } from "./utils/args.js";
import { setQuiet, setVerbose } from "./utils/output.js";
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
  // "scan" is now "init" by default — does EVERYTHING in one shot
  scan: runInit,
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
  // Keep "scan-only" for hooks that just want manifest refresh
  "scan-only": runScan,
};

// Non-blocking update check — runs in background, shows prompt if outdated
checkForUpdate().catch(() => {});

const handler = commands[options.command];
if (!handler) {
  console.error(`\n  Unknown command: ${options.command}\n`);
  console.log(`  Run ${bold("codebase --help")} to see all commands.\n`);
  process.exit(1);
}

handler(options).catch((err: Error) => {
  console.error(`\n  ${red("✗")} Error: ${err.message}\n`);

  // Show helpful suggestions based on error message
  const msg = err.message.toLowerCase();
  if (msg.includes("not a git repository")) {
    console.log(`  ${cyan("→")} Initialize git first: ${bold("git init")}\n`);
  } else if (msg.includes("permission denied")) {
    console.log(`  ${cyan("→")} Check file permissions or run with appropriate access\n`);
  } else if (msg.includes("no such file")) {
    console.log(`  ${cyan("→")} Check that the path is correct\n`);
  } else if (msg.includes("github")) {
    console.log(`  ${cyan("→")} Ensure GitHub CLI is installed: ${bold("gh --version")}\n`);
    console.log(`  ${cyan("→")} Authenticate: ${bold("gh auth login")}\n`);
  }

  process.exit(1);
});

function red(text: string): string {
  return `\x1b[31m${text}\x1b[0m`;
}

function cyan(text: string): string {
  return `\x1b[36m${text}\x1b[0m`;
}

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[0m`;
}
