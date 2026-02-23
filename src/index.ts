import { parseArgs } from "./utils/args.js";
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
import type { CLIOptions } from "./types.js";

const options = parseArgs(process.argv.slice(2));

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
  // Keep "scan-only" for hooks that just want manifest refresh
  "scan-only": runScan,
};

const handler = commands[options.command];
if (!handler) {
  console.error(`Unknown command: ${options.command}\nRun 'codebase --help' for usage.`);
  process.exit(1);
}

handler(options).catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
