import { resolve, join } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { spawn, execFileSync } from "node:child_process";
import type { CLIOptions, Manifest } from "../types.js";
import { log, info, warn, success, error, bold } from "../utils/output.js";
import { resolveProviderConfig, saveConfig, loadConfig, ZAI_BASE_URL } from "../utils/config.js";
import { estimateTokens } from "../utils/tokens.js";
import { runInit } from "./init.js";
import { runSetup } from "./setup.js";

// ─── Provider config ──────────────────────────────────────────────

/** Curated model list shown in "pick a model" mode. */
const POPULAR_MODELS = [
  {
    id: "anthropic/claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    price: "$3/$15 per Mtok",
    ctx: "200k",
  },
  {
    id: "anthropic/claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    price: "$0.80/$4 per Mtok",
    ctx: "200k",
  },
  {
    id: "anthropic/claude-opus-4-5",
    label: "Claude Opus 4.5",
    price: "$15/$75 per Mtok",
    ctx: "200k",
  },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", price: "$1.25/$10 per Mtok", ctx: "1M" },
  { id: "openai/gpt-4o", label: "GPT-4o", price: "$2.50/$10 per Mtok", ctx: "128k" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", price: "free tier", ctx: "1M" },
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
  const projectInfo = loadProjectInfo(root);
  const { name: projectName, branch, uncommitted } = projectInfo;

  // ── 4. Detect providers (env vars > stored config) ───────────
  const resolved = resolveProviderConfig();
  const { anthropicKey, openrouterKey, openrouterBase, zaiKey, customUrl, customKey } = resolved;

  const hasAnthropic = !!anthropicKey;
  const hasOpenRouter = !!openrouterKey;
  const hasZai = !!zaiKey;
  const hasCustom = !!customUrl;

  // Detect Claude plan subscription (claude auth status)
  const claudeAuth = getClaudeAuthStatus();
  const hasClaudePlan = claudeAuth.loggedIn && claudeAuth.apiProvider === "firstParty";

  // ── 5. Print startup banner ───────────────────────────────────
  printBanner(projectName, branch, uncommitted, projectInfo);

  // Provider status lines
  if (hasClaudePlan) {
    const plan = claudeAuth.subscriptionType ? ` (${claudeAuth.subscriptionType})` : "";
    console.log(
      `    \x1b[1mClaude Plan\x1b[0m \x1b[32m✓\x1b[0m \x1b[2mLogged in as ${claudeAuth.email}${plan} — no API key needed\x1b[0m`
    );
  } else if (hasAnthropic) {
    console.log(
      `    \x1b[1mAnthropic\x1b[0m   \x1b[32m✓\x1b[0m \x1b[2mANTHROPIC_API_KEY set — Claude direct\x1b[0m`
    );
  } else {
    console.log(
      `    \x1b[2mAnthropic   ✗ no API key  →  set ANTHROPIC_API_KEY or subscribe at claude.ai\x1b[0m`
    );
  }
  if (hasOpenRouter) {
    const src = process.env.OPENROUTER_API_KEY ? "env" : "config";
    console.log(
      `    \x1b[1mOpenRouter\x1b[0m  \x1b[32m✓\x1b[0m \x1b[2mkey set (${src}) — 200+ models, often cheaper\x1b[0m`
    );
  } else {
    console.log(
      `    \x1b[2mOpenRouter  ✗ not set  →  codebase config set openrouter-key sk-or-...\x1b[0m`
    );
  }
  if (hasZai) {
    const src = process.env.ZAI_API_KEY ? "env" : "config";
    console.log(
      `    \x1b[1mz.ai\x1b[0m        \x1b[32m✓\x1b[0m \x1b[2mkey set (${src}) — GLM models via Anthropic-compatible API\x1b[0m`
    );
  } else {
    console.log(`    \x1b[2mz.ai        ✗ not set  →  codebase config set zai-key <key>\x1b[0m`);
  }
  if (hasCustom) {
    console.log(`    \x1b[1mCustom\x1b[0m      \x1b[32m✓\x1b[0m \x1b[2m${customUrl}\x1b[0m`);
  }
  log("");

  if (!hasClaudePlan && !hasAnthropic && !hasOpenRouter && !hasZai && !hasCustom) {
    error("No API keys found and not logged in to Claude.");
    info("Option 1:  claude auth login  (Claude subscription)");
    info("Option 2:  codebase config set openrouter-key sk-or-...");
    info("Option 3:  export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }

  // ── 6. Resolve provider + model ───────────────────────────────
  let providerMode: "anthropic" | "openrouter" | "zai" | "custom" = "anthropic";
  let selectedModel = "";

  // Priority: CLI flags > saved config > interactive
  const savedProvider = resolved.savedProvider as
    | "anthropic"
    | "openrouter"
    | "zai"
    | "custom"
    | "";
  const savedModel = resolved.savedModel;

  if (options.provider === "openrouter" && hasOpenRouter) {
    providerMode = "openrouter";
    selectedModel = options.model || savedModel || POPULAR_MODELS[0].id;
  } else if (options.provider === "zai" && hasZai) {
    providerMode = "zai";
    selectedModel = options.model;
  } else if (options.provider === "anthropic") {
    providerMode = "anthropic";
  } else if (options.provider === "custom" && hasCustom) {
    providerMode = "custom";
    selectedModel = options.model;
  } else if (options.model) {
    // --model without --provider → infer OpenRouter
    providerMode = "openrouter";
    selectedModel = options.model;
  } else if (
    savedProvider === "anthropic" ||
    hasClaudePlan ||
    (!hasOpenRouter && !hasZai && !hasCustom)
  ) {
    providerMode = "anthropic";
  } else {
    // Interactive selection — always prompt so user can confirm or change
    const result = await promptModeSelection(
      hasAnthropic,
      hasOpenRouter,
      hasZai,
      hasCustom,
      savedProvider,
      savedModel
    );
    providerMode = result.mode;
    selectedModel = result.model;
    // Persist choice for next time
    const cfg = loadConfig();
    cfg.provider = result.mode;
    if (result.model) {
      cfg.lastModel = result.model;
    }
    saveConfig(cfg);
  }

  // ── 7. Build env vars ─────────────────────────────────────────
  const env: NodeJS.ProcessEnv = { ...process.env };

  if (providerMode === "openrouter") {
    env.ANTHROPIC_BASE_URL = openrouterBase;
    env.ANTHROPIC_AUTH_TOKEN = openrouterKey;
    env.ANTHROPIC_API_KEY = "openrouter";
  } else if (providerMode === "zai") {
    env.ANTHROPIC_BASE_URL = ZAI_BASE_URL;
    env.ANTHROPIC_AUTH_TOKEN = zaiKey;
    env.ANTHROPIC_API_KEY = "zai";
  } else if (providerMode === "custom") {
    env.ANTHROPIC_BASE_URL = customUrl;
    env.ANTHROPIC_AUTH_TOKEN = customKey || anthropicKey;
    env.ANTHROPIC_API_KEY = customKey || anthropicKey;
  }

  // ── 8. Ensure context-inject hook is installed ────────────────
  const contextHookPath = join(root, ".claude", "hooks", "context-inject.sh");
  if (!existsSync(contextHookPath)) {
    info("Installing context hook — running setup...");
    log("");
    await runSetup({ ...options, path: root });
    log("");
  }

  // ── 9. Print launch confirmation ──────────────────────────────
  log("");
  const providerLabel =
    providerMode === "openrouter"
      ? "OpenRouter"
      : providerMode === "zai"
        ? "z.ai"
        : providerMode === "custom"
          ? `Custom (${customUrl})`
          : "Anthropic";
  const modelLabel = selectedModel || "default";
  const contextActive = existsSync(contextHookPath);

  // Model context window info
  const modelMeta = POPULAR_MODELS.find((m) => m.id === selectedModel);

  success(`Launching Claude Code`);
  log(
    `  \x1b[2mProvider:\x1b[0m ${bold(providerLabel)}  \x1b[2mModel:\x1b[0m ${bold(modelLabel)}${modelMeta ? `  \x1b[2m(${modelMeta.ctx} context · ${modelMeta.price})\x1b[0m` : ""}`
  );

  if (contextActive) {
    const savings = computeTokenSavings(root);
    const manifestAge = projectInfo.manifestAgeSec;
    const ageLabel =
      manifestAge < 0
        ? ""
        : manifestAge < 60
          ? ` · manifest ${manifestAge}s old`
          : manifestAge < 3600
            ? ` · manifest ${Math.floor(manifestAge / 60)}m old`
            : ` · manifest ${Math.floor(manifestAge / 3600)}h old — consider \`codebase scan\``;
    log(
      `  \x1b[32m✓\x1b[0m \x1b[2mcodebase context: ${savings.slimTokens} tokens injected (${savings.savedPct}% less than full brief${ageLabel})\x1b[0m`
    );
  } else {
    warn("context-inject.sh not found — run `codebase setup` manually");
  }

  if (projectInfo.nextTask) {
    log(`  \x1b[2mNext task:\x1b[0m ${projectInfo.nextTask}`);
  }
  if (projectInfo.openIssues > 0) {
    log(
      `  \x1b[2mOpen issues:\x1b[0m ${projectInfo.openIssues}  \x1b[2m(run \`codebase status\` for details)\x1b[0m`
    );
  }
  log("");

  // ── 10. Build claude args ──────────────────────────────────────
  const claudeArgs: string[] = [];
  if (selectedModel) {
    claudeArgs.push("--model", selectedModel);
  }

  // ── 11. Spawn claude ───────────────────────────────────────────
  const child = spawn(claudePath, claudeArgs, { stdio: "inherit", env });

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
  hasZai: boolean,
  hasCustom: boolean,
  savedProvider?: string,
  savedModel?: string
): Promise<{ mode: "anthropic" | "openrouter" | "zai" | "custom"; model: string }> {
  // If there's a saved OpenRouter model, offer quick-confirm or change
  if (savedProvider === "openrouter" && savedModel && hasOpenRouter) {
    const modelInfo = POPULAR_MODELS.find((m) => m.id === savedModel);
    const priceLabel = modelInfo ? `  \x1b[2m${modelInfo.price}\x1b[0m` : "";
    log(`  Model: \x1b[1m${savedModel}\x1b[0m${priceLabel}`);
    log(`  \x1b[2mPress Enter to continue, or type a number to switch:\x1b[0m`);
    log("");
    POPULAR_MODELS.forEach((m, i) => {
      const marker = m.id === savedModel ? " \x1b[32m←\x1b[0m" : "";
      console.log(
        `    ${bold(String(i + 1))}. ${m.label.padEnd(22)} \x1b[2m${m.ctx} ctx · ${m.price}\x1b[0m${marker}`
      );
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

    // Enter with no input → use saved model
    if (!answer) {
      return { mode: "openrouter", model: savedModel };
    }
    const n = parseInt(answer, 10);
    if (!isNaN(n) && n >= 1 && n <= POPULAR_MODELS.length) {
      return { mode: "openrouter", model: POPULAR_MODELS[n - 1].id };
    }
    if (!isNaN(n) && n === POPULAR_MODELS.length + 1) {
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      const customModel = await new Promise<string>((res) => {
        rl2.question("  Model ID: ", (a) => {
          rl2.close();
          res(a.trim());
        });
      });
      return { mode: "openrouter", model: customModel || savedModel };
    }
    if (answer.includes("/")) {
      return { mode: "openrouter", model: answer };
    }
    return { mode: "openrouter", model: savedModel };
  }

  // No saved config — full provider + model selection
  const options: Array<{ label: string; mode: "anthropic" | "openrouter" | "zai" | "custom" }> = [];

  if (hasAnthropic) {
    options.push({ label: "Claude direct       → Anthropic API", mode: "anthropic" });
  }
  if (hasOpenRouter) {
    options.push({ label: "Pick a model        → OpenRouter (200+ models)", mode: "openrouter" });
  }
  if (hasZai) {
    options.push({ label: "z.ai                → GLM models (Anthropic-compatible)", mode: "zai" });
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
    console.log(
      `    ${bold(String(i + 1))}. ${m.label.padEnd(22)} \x1b[2m${m.ctx} ctx · ${m.price}\x1b[0m`
    );
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

function printBanner(
  project: string,
  branch: string,
  uncommitted: boolean,
  info: { stack: string }
): void {
  const version = typeof __VERSION__ !== "undefined" ? __VERSION__ : "";
  const versionStr = version ? `v${version}` : "";
  const branchStr = uncommitted ? `${branch} *` : branch;

  const line1 = `  codebase ${versionStr}`;
  const line2 = `  Project: ${project}${info.stack ? `  (${info.stack})` : ""}`;
  const line3 = `  Branch:  ${branchStr}`;
  const width = Math.max(line1.length, line2.length, line3.length) + 2;
  const border = "─".repeat(width);

  log(`\n  ┌${border}┐`);
  log(`  │ ${line1.slice(2).padEnd(width - 1)}│`);
  log(`  │ ${line2.slice(2).padEnd(width - 1)}│`);
  log(`  │ ${line3.slice(2).padEnd(width - 1)}│`);
  log(`  └${border}┘\n`);
}

function computeTokenSavings(root: string): {
  slimTokens: number;
  fullTokens: number;
  savedPct: number;
} {
  const manifestPath = join(root, ".codebase.json");
  if (!existsSync(manifestPath)) {
    return { slimTokens: 400, fullTokens: 400, savedPct: 0 };
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    // Full manifest token count
    const fullTokens = estimateTokens(JSON.stringify(manifest));
    // Slim brief: project identity + stack + commands (the fields codebase context outputs)
    const slim = {
      project: manifest.project,
      stack: manifest.stack,
      commands: manifest.commands,
      git: manifest.git,
    };
    const slimTokens = estimateTokens(JSON.stringify(slim));
    const savedPct =
      fullTokens > 0 ? Math.round(((fullTokens - slimTokens) / fullTokens) * 100) : 0;
    return { slimTokens, fullTokens, savedPct };
  } catch {
    return { slimTokens: 400, fullTokens: 400, savedPct: 0 };
  }
}

function loadProjectInfo(root: string): {
  name: string;
  branch: string;
  uncommitted: boolean;
  stack: string;
  openIssues: number;
  nextTask: string;
  manifestAgeSec: number;
} {
  const manifestPath = join(root, ".codebase.json");
  const defaults = {
    name: "unknown",
    branch: "main",
    uncommitted: false,
    stack: "",
    openIssues: 0,
    nextTask: "",
    manifestAgeSec: -1,
  };
  try {
    const m: Manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const langs: string[] = (m.stack as unknown as { languages?: string[] })?.languages ?? [];
    const issues =
      (m as unknown as { github?: { issues?: { open?: unknown[] } } })?.github?.issues?.open ?? [];
    const nextTask = (m as unknown as { next_task?: { title?: string } }).next_task?.title ?? "";
    let manifestAgeSec = -1;
    try {
      manifestAgeSec = Math.floor((Date.now() - statSync(manifestPath).mtimeMs) / 1000);
    } catch {
      /* ignore */
    }
    return {
      name: m.project?.name || "unknown",
      branch: m.repo?.default_branch || "main",
      uncommitted: !!m.git?.uncommitted_changes,
      stack: langs.slice(0, 3).join(", "),
      openIssues: issues.length,
      nextTask,
      manifestAgeSec,
    };
  } catch {
    return defaults;
  }
}

function getClaudeAuthStatus(): {
  loggedIn: boolean;
  authMethod: string;
  apiProvider: string;
  email: string;
  subscriptionType: string;
} {
  const defaults = {
    loggedIn: false,
    authMethod: "",
    apiProvider: "",
    email: "",
    subscriptionType: "",
  };
  try {
    const out = execFileSync("claude", ["auth", "status", "--output-format", "json"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    return { ...defaults, ...JSON.parse(out) };
  } catch {
    // claude auth status without --output-format flag (older versions)
    try {
      const out = execFileSync("claude", ["auth", "status"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3000,
      });
      // Try JSON parse; falls back gracefully
      return { ...defaults, ...JSON.parse(out) };
    } catch {
      return defaults;
    }
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
