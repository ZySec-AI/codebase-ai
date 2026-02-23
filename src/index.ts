import { parseArgs, showCommandHelp } from "./utils/args.js";
import { setQuiet, setVerbose } from "./utils/output.js";
import { runScan } from "./commands/scan.js";
import { runSetup } from "./commands/setup.js";
import { runInit } from "./commands/init.js";
import { runBrief } from "./commands/brief.js";
import { runNext } from "./commands/next.js";
import { runQuery } from "./commands/query.js";
import { runWatch } from "./commands/watch.js";
import { runDiff } from "./commands/diff.js";
import { runExport } from "./commands/export.js";
import { runHook } from "./commands/hook.js";
import { runIssue } from "./commands/issue.js";
import { runStatus } from "./commands/status.js";
import { runMcp } from "./commands/mcp.js";
import { runServe } from "./commands/serve.js";
import { runDoctor } from "./commands/doctor.js";
import { runFix } from "./commands/fix.js";
import { runPr } from "./commands/pr.js";
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
  watch: runWatch,
  diff: runDiff,
  export: runExport,
  hook: runHook,
  issue: runIssue,
  status: runStatus,
  mcp: runMcp,
  serve: runServe,
  doctor: runDoctor,
  fix: runFix,
  pr: runPr,
  release: runRelease,
  // Keep "scan-only" for hooks that just want manifest refresh
  "scan-only": runScan,
};

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
