import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { spawn, execFileSync } from "node:child_process";
import type { CLIOptions, Manifest } from "../types.js";
import { log, info, warn, success, error, bold } from "../utils/output.js";
import { runInit } from "./init.js";

// ─── Provider config ──────────────────────────────────────────────

// Claude Code appends /v1/messages to ANTHROPIC_BASE_URL.
// OPENROUTER_BASE_URL env var may be set to https://openrouter.ai/api/v1 — strip trailing /v1 so
// Claude Code constructs the correct path: https://openrouter.ai/api/v1/messages
function getOpenRouterBase(): string {
  const envBase = process.env.OPENROUTER_BASE_URL || "";
  if (envBase) {
    // Strip trailing /v1 if present — Claude Code will add /v1/messages
    return envBase.replace(/\/v1\/?$/, "");
  }
  return "https://openrouter.ai/api";
}

/** Curated model list shown in "pick a model" mode. */
const POPULAR_MODELS = [
  { id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5", price: "$3/M in · $15/M out" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5", price: "$0.80/M in · $4/M out" },
  { id: "anthropic/claude-opus-4-5", label: "Claude Opus 4.5", price: "$15/M in · $75/M out" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", price: "$1.25/M in · $10/M out" },
  { id: "openai/gpt-4o", label: "GPT-4o", price: "$2.50/M in · $10/M out" },
  { id: "meta-llama/llama-4-maverick:free", label: "Llama 4 Maverick", price: "free" },
] as const;

// ─── Main entry ───────────────────────────────────────────────────

/**
 * `codebase start` (and the default `codebase` command) —
 *
 * Smart Claude Code launcher with optional OpenRouter model routing.
 *
 *   1. Ensures .codebase.json exists (runs init if needed)
 *   2. Detects available providers from env vars
 *   3. Shows a DX-friendly startup banner
 *   4. If OpenRouter key is set, offers model selection
 *   5. Spawns `claude` in the same terminal with the right env vars
 *
 * Non-interactive flags:
 *   --model <id>        Skip prompt, use this OpenRouter model ID
 *   --provider <name>   Skip prompt, use "anthropic" or "openrouter"
 */
export async function runStart(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  // ── 1. Ensure manifest exists ─────────────────────────────────
  const manifestPath = join(root, ".codebase.json");
  if (!existsSync(manifestPath)) {
    info("No .codebase.json found — running init first...");
    log("");
    await runInit(options);
    log("");
  }

  // ── 2. Check claude CLI is available ─────────────────────────
  const claudePath = findClaude();
  if (!claudePath) {
    error("Claude Code CLI not found.");
    info("Install it: npm install -g @anthropic-ai/claude-code  or  brew install claude");
    process.exit(1);
  }

  // ── 3. Load project info for banner ──────────────────────────
  const { name: projectName, branch, uncommitted } = loadProjectInfo(root);

  // ── 4. Detect providers ───────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
  const openrouterKey = process.env.OPENROUTER_API_KEY || "";
  const customUrl = process.env.CODEBASE_PROVIDER_URL || "";
  const customKey = process.env.CODEBASE_PROVIDER_KEY || "";

  const hasAnthropic = !!anthropicKey;
  const hasOpenRouter = !!openrouterKey;
  const hasCustom = !!customUrl;

  // ── 5. Print startup banner ───────────────────────────────────
  printBanner(projectName, branch, uncommitted);

  // Provider status lines — use console.log directly to avoid dim()/bold() void-in-template issue
  if (hasAnthropic) {
    console.log(`    \x1b[1mAnthropic\x1b[0m   \x1b[2mANTHROPIC_API_KEY ✓\x1b[0m`);
  } else {
    console.log(`    \x1b[2mAnthropic   (no ANTHROPIC_API_KEY)\x1b[0m`);
  }
  if (hasOpenRouter) {
    console.log(`    \x1b[1mOpenRouter\x1b[0m  \x1b[2mOPENROUTER_API_KEY ✓\x1b[0m — 200+ models`);
  } else {
    console.log(
      `    \x1b[2mOpenRouter  (no OPENROUTER_API_KEY — export OPENROUTER_API_KEY=sk-or-... to enable)\x1b[0m`
    );
  }
  if (hasCustom) {
    console.log(`    \x1b[1mCustom\x1b[0m      \x1b[2m${customUrl}\x1b[0m`);
  }
  log("");

  if (!hasAnthropic && !hasOpenRouter && !hasCustom) {
    error("No API keys found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.");
    info("Get keys at: https://console.anthropic.com  or  https://openrouter.ai/keys");
    process.exit(1);
  }

  // ── 6. Resolve provider + model ───────────────────────────────
  let providerMode: "anthropic" | "openrouter" | "custom" = "anthropic";
  let selectedModel = "";

  // Fast path: --provider flag given
  if (options.provider === "openrouter" && hasOpenRouter) {
    providerMode = "openrouter";
    selectedModel = options.model || POPULAR_MODELS[0].id;
  } else if (options.provider === "anthropic" || (!hasOpenRouter && !hasCustom)) {
    providerMode = "anthropic";
  } else if (options.provider === "custom" && hasCustom) {
    providerMode = "custom";
    selectedModel = options.model;
  } else if (options.model) {
    // --model given without --provider → infer OpenRouter
    providerMode = "openrouter";
    selectedModel = options.model;
  } else if (hasOpenRouter || hasCustom) {
    // Interactive selection
    const result = await promptModeSelection(hasAnthropic, hasOpenRouter, hasCustom);
    providerMode = result.mode;
    selectedModel = result.model;
  }

  // ── 7. Build env vars ─────────────────────────────────────────
  const env: NodeJS.ProcessEnv = { ...process.env };

  if (providerMode === "openrouter") {
    env.ANTHROPIC_BASE_URL = getOpenRouterBase();
    env.ANTHROPIC_AUTH_TOKEN = openrouterKey;
    // Suppress Claude Code's own key validation
    env.ANTHROPIC_API_KEY = "openrouter";
  } else if (providerMode === "custom") {
    env.ANTHROPIC_BASE_URL = customUrl;
    env.ANTHROPIC_AUTH_TOKEN = customKey || anthropicKey;
    env.ANTHROPIC_API_KEY = customKey || anthropicKey;
  }

  if (selectedModel) {
    env.ANTHROPIC_CUSTOM_MODEL_OPTION = selectedModel;
    env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME = selectedModel;
  }

  // ── 8. Print launch confirmation ──────────────────────────────
  log("");
  const providerLabel =
    providerMode === "openrouter"
      ? "OpenRouter"
      : providerMode === "custom"
        ? `Custom (${customUrl})`
        : "Anthropic";
  const modelLabel = selectedModel || "default";
  const contextActive = existsSync(join(root, ".claude", "hooks", "context-inject.sh"));

  success(`Launching Claude Code`);
  info(`Provider: ${bold(providerLabel)} | Model: ${bold(modelLabel)}`);
  if (contextActive) {
    info("codebase context active — slim brief will be injected on session start");
  } else {
    warn("context-inject.sh not found — run `codebase setup` for auto-context injection");
  }
  log("");

  // ── 9. Spawn claude ───────────────────────────────────────────
  const child = spawn(claudePath, [], { stdio: "inherit", env });

  child.on("error", (err) => {
    error(`Failed to start Claude Code: ${err.message}`);
    info("Make sure `claude` is in your PATH: which claude");
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

// ─── Interactive mode selector ────────────────────────────────────

async function promptModeSelection(
  hasAnthropic: boolean,
  hasOpenRouter: boolean,
  hasCustom: boolean
): Promise<{ mode: "anthropic" | "openrouter" | "custom"; model: string }> {
  const options: Array<{ label: string; mode: "anthropic" | "openrouter" | "custom" }> = [];

  if (hasAnthropic) {
    options.push({ label: "Claude direct       → Anthropic API", mode: "anthropic" });
  }
  if (hasOpenRouter) {
    options.push({ label: "Pick a model        → OpenRouter (200+ models)", mode: "openrouter" });
  }
  if (hasCustom) {
    options.push({
      label: "Custom endpoint     → " + (process.env.CODEBASE_PROVIDER_URL || ""),
      mode: "custom",
    });
  }

  log("  Select provider:");
  options.forEach((o, i) => log(`    ${bold(String(i + 1))}. ${o.label}`));
  log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const idx = await new Promise<number>((res) => {
    rl.question("  > ", (answer) => {
      rl.close();
      const n = parseInt(answer.trim(), 10);
      res(isNaN(n) || n < 1 || n > options.length ? 1 : n);
    });
  });

  const chosen = options[idx - 1];

  if (chosen.mode === "openrouter") {
    const model = await promptModelSelection();
    return { mode: "openrouter", model };
  }

  return { mode: chosen.mode, model: "" };
}

async function promptModelSelection(): Promise<string> {
  log("");
  log("  Popular models:");
  POPULAR_MODELS.forEach((m, i) => {
    console.log(`    ${bold(String(i + 1))}. ${m.label.padEnd(28)} \x1b[2m${m.price}\x1b[0m`);
    console.log(`       \x1b[2m${m.id}\x1b[0m`);
  });
  log(`    ${bold(String(POPULAR_MODELS.length + 1))}. Enter model ID manually`);
  log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const answer = await new Promise<string>((res) => {
    rl.question("  > ", (a) => {
      rl.close();
      res(a.trim());
    });
  });

  const n = parseInt(answer, 10);
  if (!isNaN(n) && n >= 1 && n <= POPULAR_MODELS.length) {
    return POPULAR_MODELS[n - 1].id;
  }

  if (!isNaN(n) && n === POPULAR_MODELS.length + 1) {
    // Manual entry
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const customModel = await new Promise<string>((res) => {
      rl2.question("  Model ID (e.g. mistralai/mistral-large): ", (a) => {
        rl2.close();
        res(a.trim());
      });
    });
    return customModel || POPULAR_MODELS[0].id;
  }

  // If they typed a model ID directly
  if (answer.includes("/")) {
    return answer;
  }

  return POPULAR_MODELS[0].id;
}

// ─── Helpers ──────────────────────────────────────────────────────

function printBanner(project: string, branch: string, uncommitted: boolean): void {
  const version = typeof __VERSION__ !== "undefined" ? __VERSION__ : "";
  const versionStr = version ? `v${version}` : "";
  const branchStr = uncommitted ? `${branch} (uncommitted changes)` : branch;

  const line1 = `  codebase ${versionStr}`;
  const line2 = `  Project: ${project}`;
  const line3 = `  Branch:  ${branchStr}`;
  const width = Math.max(line1.length, line2.length, line3.length) + 2;
  const border = "─".repeat(width);

  log(`\n  ┌${border}┐`);
  log(`  │ ${line1.slice(2).padEnd(width - 1)}│`);
  log(`  │ ${line2.slice(2).padEnd(width - 1)}│`);
  log(`  │ ${line3.slice(2).padEnd(width - 1)}│`);
  log(`  └${border}┘\n`);
}

function loadProjectInfo(root: string): {
  name: string;
  branch: string;
  uncommitted: boolean;
} {
  const manifestPath = join(root, ".codebase.json");
  try {
    const m: Manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return {
      name: m.project?.name || "unknown",
      branch: m.repo?.default_branch || "main",
      uncommitted: !!m.git?.uncommitted_changes,
    };
  } catch {
    return { name: "unknown", branch: "main", uncommitted: false };
  }
}

function findClaude(): string | null {
  // Common locations
  const candidates = ["claude", "/usr/local/bin/claude", "/usr/bin/claude"];
  for (const c of candidates) {
    try {
      execFileSync("which", [c === "claude" ? "claude" : c], { stdio: "ignore" });
      return c;
    } catch {
      // try next
    }
  }
  try {
    execFileSync("which", ["claude"], { stdio: "pipe" });
    return "claude";
  } catch {
    return null;
  }
}
