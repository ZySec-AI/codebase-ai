import { resolve, join } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import type { CLIOptions, Manifest } from "../types.js";
import { log, info, warn, success, error, bold } from "../utils/output.js";
import { resolveProviderConfig, saveConfig, loadConfig, ZAI_BASE_URL } from "../utils/config.js";
import { estimateTokens } from "../utils/tokens.js";
import { runInit } from "./init.js";
import { runSetup } from "./setup.js";

// ─── Provider config ──────────────────────────────────────────────

/** Curated model list shown in "pick a model" mode. */
// Fallback list used when OpenRouter API fetch fails.
// Keep IDs in sync with what OpenRouter actually serves.
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
  {
    id: "google/gemini-2.0-flash-001",
    label: "Gemini 2.0 Flash",
    price: "free tier",
    ctx: "1M",
  },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", price: "$0.55/$2.19 per Mtok", ctx: "64k" },
  {
    id: "meta-llama/llama-4-maverick",
    label: "Llama 4 Maverick",
    price: "$0.18/$0.59 per Mtok",
    ctx: "128k",
  },
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
    const who = claudeAuth.email ? claudeAuth.email : "subscription auth";
    const plan =
      claudeAuth.subscriptionType && claudeAuth.subscriptionType !== "plan"
        ? ` (${claudeAuth.subscriptionType})`
        : "";
    console.log(
      `    \x1b[1mClaude Plan\x1b[0m \x1b[32m✓\x1b[0m \x1b[2m${who}${plan} — use /model inside to switch Claude models\x1b[0m`
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
    // First-run wizard — interactively collect a provider key instead of hard-exiting
    const wizardResult = await runFirstRunWizard(claudePath);
    if (!wizardResult) {
      process.exit(1);
    }
    // Re-resolve config now that the wizard has saved keys
    const fresh = resolveProviderConfig();
    if (wizardResult.provider === "openrouter") {
      resolved.openrouterKey = fresh.openrouterKey;
    } else if (wizardResult.provider === "zai") {
      resolved.zaiKey = fresh.zaiKey;
    } else if (wizardResult.provider === "anthropic") {
      resolved.anthropicKey = fresh.anthropicKey;
    } else if (wizardResult.provider === "custom") {
      resolved.customUrl = fresh.customUrl;
      resolved.customKey = fresh.customKey;
    }
    // Jump straight to launch with the chosen provider
    const env2: NodeJS.ProcessEnv = { ...process.env };
    if (wizardResult.provider === "openrouter") {
      env2.ANTHROPIC_BASE_URL = fresh.openrouterBase;
      env2.ANTHROPIC_AUTH_TOKEN = fresh.openrouterKey;
      delete env2.ANTHROPIC_API_KEY;
    } else if (wizardResult.provider === "zai") {
      env2.ANTHROPIC_BASE_URL = ZAI_BASE_URL;
      env2.ANTHROPIC_AUTH_TOKEN = fresh.zaiKey;
      delete env2.ANTHROPIC_API_KEY;
    } else if (wizardResult.provider === "custom") {
      env2.ANTHROPIC_BASE_URL = fresh.customUrl.replace(/\/v1\/?$/, "");
      env2.ANTHROPIC_AUTH_TOKEN = fresh.customKey;
      delete env2.ANTHROPIC_API_KEY;
    }
    const contextHookPath2 = join(root, ".claude", "hooks", "context-inject.sh");
    if (!existsSync(contextHookPath2)) {
      await runSetup({ ...options, path: root });
    }
    const claudeArgs2: string[] = [];
    if (wizardResult.model) {
      claudeArgs2.push("--model", wizardResult.model);
    }
    log("");
    success("Launching Claude Code");
    log(
      `  \x1b[2mProvider:\x1b[0m ${bold(wizardResult.provider)}  \x1b[2mModel:\x1b[0m ${bold(wizardResult.model || "default")}`
    );
    log("");
    const sessionStart2 = Date.now();
    const child2 = spawn(claudePath, claudeArgs2, { stdio: "inherit", env: env2 });
    child2.on("error", (err) => {
      error(`Failed to start Claude Code: ${err.message}`);
      process.exit(1);
    });
    child2.on("exit", (code) => {
      logSession({
        provider: wizardResult.provider,
        model: wizardResult.model || "default",
        project: projectName,
        durationSec: Math.round((Date.now() - sessionStart2) / 1000),
        exitCode: code ?? 0,
      });
      process.exit(code ?? 0);
    });
    return;
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
    // Only auto-select when exactly one provider is available (no choice to make)
    (hasClaudePlan && !hasOpenRouter && !hasZai && !hasCustom) ||
    (hasAnthropic && !hasClaudePlan && !hasOpenRouter && !hasZai && !hasCustom) ||
    (!hasAnthropic && !hasClaudePlan && hasOpenRouter && !hasZai && !hasCustom) ||
    (!hasAnthropic && !hasClaudePlan && !hasOpenRouter && hasZai && !hasCustom) ||
    (!hasAnthropic && !hasClaudePlan && !hasOpenRouter && !hasZai && hasCustom)
  ) {
    // Single provider — use it directly
    if (hasOpenRouter) {
      providerMode = "openrouter";
      selectedModel = savedModel || POPULAR_MODELS[0].id;
    } else if (hasZai) {
      providerMode = "zai";
    } else if (hasCustom) {
      providerMode = "custom";
    } else {
      providerMode = "anthropic";
    }
  } else {
    // Interactive selection — always prompt so user can confirm or change
    const result = await promptModeSelection(
      hasAnthropic || hasClaudePlan,
      hasOpenRouter,
      hasZai,
      hasCustom,
      savedProvider,
      savedModel,
      hasClaudePlan,
      openrouterKey
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
    delete env.ANTHROPIC_API_KEY;
  } else if (providerMode === "zai") {
    env.ANTHROPIC_BASE_URL = ZAI_BASE_URL;
    env.ANTHROPIC_AUTH_TOKEN = zaiKey;
    delete env.ANTHROPIC_API_KEY;
  } else if (providerMode === "custom") {
    // Strip trailing /v1 — Claude Code appends /v1/messages itself
    env.ANTHROPIC_BASE_URL = customUrl.replace(/\/v1\/?$/, "");
    env.ANTHROPIC_AUTH_TOKEN = customKey || anthropicKey;
    delete env.ANTHROPIC_API_KEY;
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
  const sessionStart = Date.now();
  const child = spawn(claudePath, claudeArgs, { stdio: "inherit", env });

  child.on("error", (err) => {
    error(`Failed to start Claude Code: ${err.message}`);
    info("Make sure `claude` is in your PATH: which claude");
    process.exit(1);
  });

  child.on("exit", (code) => {
    const durationSec = Math.round((Date.now() - sessionStart) / 1000);
    logSession({
      provider: providerMode,
      model: selectedModel || "default",
      project: projectInfo.name,
      durationSec,
      exitCode: code ?? 0,
    });
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
  savedModel?: string,
  hasClaudePlan?: boolean,
  openrouterKey?: string
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
    const enterManuallyIdx = POPULAR_MODELS.length + 1;
    log(`    ${bold(String(enterManuallyIdx))}. Enter model ID manually`);
    // "Change provider" only shown when other providers are available
    const hasOtherProviders = hasZai || hasCustom || hasAnthropic || hasClaudePlan;
    const changeProviderIdx = hasOtherProviders ? POPULAR_MODELS.length + 2 : -1;
    if (hasOtherProviders) {
      log(
        `    ${bold(String(changeProviderIdx))}. \x1b[2mChange provider (z.ai / Custom / Anthropic...)\x1b[0m`
      );
    }
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
    if (!isNaN(n) && n === enterManuallyIdx) {
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      const customModel = await new Promise<string>((res) => {
        rl2.question("  Model ID: ", (a) => {
          rl2.close();
          res(a.trim());
        });
      });
      return { mode: "openrouter", model: customModel || savedModel };
    }
    if (!isNaN(n) && n === changeProviderIdx) {
      // Fall through to full provider selection below
    } else if (answer.includes("/")) {
      return { mode: "openrouter", model: answer };
    } else {
      return { mode: "openrouter", model: savedModel };
    }
  }

  // No saved config — full provider + model selection
  const options: Array<{ label: string; mode: "anthropic" | "openrouter" | "zai" | "custom" }> = [];

  if (hasClaudePlan) {
    options.push({
      label: "Claude Plan         → your Max/Pro subscription (use /model inside)",
      mode: "anthropic",
    });
  } else if (hasAnthropic) {
    options.push({ label: "Anthropic API       → direct Claude access", mode: "anthropic" });
  }
  if (hasOpenRouter) {
    options.push({
      label: "OpenRouter          → 200+ models (Gemini, GPT-4o, Llama...)",
      mode: "openrouter",
    });
  }
  if (hasZai) {
    options.push({
      label: "z.ai                → GLM models via Anthropic-compatible API",
      mode: "zai",
    });
  }
  if (hasCustom) {
    const customUrlDisplay =
      process.env.CODEBASE_PROVIDER_URL || resolveProviderConfig().customUrl || "";
    options.push({
      label: `Custom endpoint     → ${customUrlDisplay}`,
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
    const model = await promptModelSelection(openrouterKey);
    return { mode: "openrouter", model };
  }

  if (chosen.mode === "custom") {
    const model = await promptCustomModelSelection(
      resolveProviderConfig().customUrl,
      resolveProviderConfig().customKey
    );
    return { mode: "custom", model };
  }

  return { mode: chosen.mode, model: "" };
}

interface LiveModel {
  id: string;
  name: string;
  ctx: string;
  price: string;
  isFree: boolean;
}

async function fetchOpenRouterModels(apiKey: string): Promise<LiveModel[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      return [];
    }
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    return (json.data || [])
      .filter(
        (m) => m.id && !m.id.includes("whisper") && !m.id.includes("embed") && !m.id.includes("tts")
      )
      .map((m) => {
        const promptPer1M = parseFloat(m.pricing?.prompt || "0") * 1_000_000;
        const compPer1M = parseFloat(m.pricing?.completion || "0") * 1_000_000;
        const isFree = promptPer1M === 0 && compPer1M === 0;
        const ctx = m.context_length
          ? m.context_length >= 1_000_000
            ? `${Math.round(m.context_length / 1_000_000)}M`
            : `${Math.round(m.context_length / 1000)}k`
          : "?";
        const price = isFree
          ? "free"
          : `$${promptPer1M.toFixed(2)}/$${compPer1M.toFixed(2)} per Mtok`;
        return { id: m.id, name: m.name || m.id, ctx, price, isFree };
      });
  } catch {
    return [];
  }
}

function groupModels(models: LiveModel[]): Array<{ heading: string; models: LiveModel[] }> {
  const groups: Record<string, LiveModel[]> = {
    "Claude (Anthropic)": [],
    "GPT / o-series (OpenAI)": [],
    "Gemini (Google)": [],
    DeepSeek: [],
    "Qwen / Llama / Other": [],
    "Free tier": [],
  };
  for (const m of models) {
    if (m.isFree) {
      groups["Free tier"].push(m);
      continue;
    }
    const id = m.id.toLowerCase();
    if (id.startsWith("anthropic/")) {
      groups["Claude (Anthropic)"].push(m);
    } else if (id.startsWith("openai/") || id.startsWith("o1") || id.startsWith("o3")) {
      groups["GPT / o-series (OpenAI)"].push(m);
    } else if (id.startsWith("google/")) {
      groups["Gemini (Google)"].push(m);
    } else if (id.startsWith("deepseek")) {
      groups["DeepSeek"].push(m);
    } else {
      groups["Qwen / Llama / Other"].push(m);
    }
  }
  return Object.entries(groups)
    .filter(([, ms]) => ms.length > 0)
    .map(([heading, ms]) => ({ heading, models: ms.slice(0, 10) }));
}

async function promptModelSelection(openrouterKey?: string): Promise<string> {
  log("");

  let liveModels: LiveModel[] = [];
  if (openrouterKey) {
    process.stdout.write("  \x1b[2mFetching models from OpenRouter...\x1b[0m");
    liveModels = await fetchOpenRouterModels(openrouterKey);
    process.stdout.write("\r" + " ".repeat(46) + "\r");
  }

  if (liveModels.length === 0) {
    // Fallback to hardcoded list
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
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      const custom = await new Promise<string>((res) => {
        rl2.question("  Model ID: ", (a) => {
          rl2.close();
          res(a.trim());
        });
      });
      return custom || POPULAR_MODELS[0].id;
    }
    if (answer.includes("/")) {
      return answer;
    }
    return POPULAR_MODELS[0].id;
  }

  // Show grouped live models
  const groups = groupModels(liveModels);
  const flat: LiveModel[] = [];

  log(`  ${liveModels.length} models available on OpenRouter:\n`);
  for (const g of groups) {
    console.log(`  \x1b[1m${g.heading}\x1b[0m`);
    for (const m of g.models) {
      const idx = flat.length + 1;
      flat.push(m);
      const nameStr = m.name.slice(0, 32).padEnd(33);
      console.log(
        `    ${bold(String(idx).padStart(3))}. ${nameStr} \x1b[2m${m.ctx} ctx · ${m.price}\x1b[0m`
      );
      console.log(`         \x1b[2m${m.id}\x1b[0m`);
    }
    log("");
  }

  const manualIdx = flat.length + 1;
  log(`    ${bold(String(manualIdx))}. \x1b[2mEnter model ID manually\x1b[0m`);
  log("");
  log(
    `  \x1b[2mTip: type a model ID directly (e.g. mistralai/mistral-large) or pick a number\x1b[0m`
  );
  log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((res) => {
    rl.question("  > ", (a) => {
      rl.close();
      res(a.trim());
    });
  });

  if (!answer) {
    return flat[0].id;
  }
  const n = parseInt(answer, 10);
  if (!isNaN(n) && n >= 1 && n <= flat.length) {
    return flat[n - 1].id;
  }
  if (!isNaN(n) && n === manualIdx) {
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const manual = await new Promise<string>((res) => {
      rl2.question("  Model ID: ", (a) => {
        rl2.close();
        res(a.trim());
      });
    });
    return manual || flat[0].id;
  }
  if (answer.includes("/") || answer.includes(":")) {
    return answer;
  }
  return flat[0].id;
}

async function promptCustomModelSelection(customUrl: string, customKey: string): Promise<string> {
  log("");

  // Try to fetch models from the endpoint's /v1/models
  const baseUrl = customUrl.replace(/\/v1\/?$/, "");
  let fetchedModels: string[] = [];

  try {
    process.stdout.write("  \x1b[2mFetching models from endpoint...\x1b[0m");
    // Use Node's built-in fetch (available Node 18+)
    const res = await fetch(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${customKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ id: string }> };
      fetchedModels = (json.data || []).map((m) => m.id).filter(Boolean);
    }
    process.stdout.write("\r" + " ".repeat(40) + "\r"); // clear the fetching line
  } catch {
    process.stdout.write("\r" + " ".repeat(40) + "\r");
  }

  if (fetchedModels.length > 0) {
    log(`  Available models on ${baseUrl}:\n`);
    fetchedModels.forEach((id, i) => {
      console.log(`    ${bold(String(i + 1))}. ${id}`);
    });
    log(`    ${bold(String(fetchedModels.length + 1))}. Enter model ID manually`);
    log("");

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((res) => {
      rl.question("  > ", (a) => {
        rl.close();
        res(a.trim());
      });
    });

    const n = parseInt(answer, 10);
    if (!isNaN(n) && n >= 1 && n <= fetchedModels.length) {
      return fetchedModels[n - 1];
    }
    if (!isNaN(n) && n === fetchedModels.length + 1) {
      // fall through to manual entry
    } else if (answer) {
      return answer; // typed a model ID directly
    }
  }

  // Manual entry fallback
  log("  Enter model ID:");
  const rl2 = createInterface({ input: process.stdin, output: process.stdout });
  const manual = await new Promise<string>((res) => {
    rl2.question("  > ", (a) => {
      rl2.close();
      res(a.trim());
    });
  });
  return manual;
}

// ─── First-run wizard ─────────────────────────────────────────────

/**
 * Interactive setup wizard shown when no provider is configured.
 * Guides the user through picking a provider and entering their key,
 * then saves it to config so the normal launch flow can proceed.
 */
async function runFirstRunWizard(
  _claudePath: string
): Promise<{ provider: "anthropic" | "openrouter" | "zai" | "custom"; model: string } | null> {
  log("");
  log("  \x1b[1mWelcome to codebase!\x1b[0m  No provider is configured yet.");
  log("  Let's set one up — this takes about 30 seconds and is saved for next time.");
  log("");

  const providerChoices = [
    {
      label: "Claude Plan (Max/Pro subscription)",
      hint: "Run  claude auth login  in your terminal — free if you already subscribe",
      mode: "claude-login" as const,
    },
    {
      label: "Anthropic API key",
      hint: "Get yours at console.anthropic.com  →  API Keys",
      mode: "anthropic" as const,
    },
    {
      label: "OpenRouter  (200+ models, often cheaper)",
      hint: "Get yours at openrouter.ai/keys",
      mode: "openrouter" as const,
    },
    {
      label: "z.ai  (GLM models, Anthropic-compatible)",
      hint: "Get yours at z.ai",
      mode: "zai" as const,
    },
    {
      label: "Custom endpoint  (any Anthropic-compatible API)",
      hint: "E.g. a local Ollama or LM Studio instance",
      mode: "custom" as const,
    },
  ];

  providerChoices.forEach((p, i) => {
    console.log(`    \x1b[1m${i + 1}.\x1b[0m ${p.label}`);
    console.log(`       \x1b[2m${p.hint}\x1b[0m`);
  });
  log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const idxStr = await new Promise<string>((res) => {
    rl.question("  Pick a provider [1]: ", (a) => {
      rl.close();
      res(a.trim());
    });
  });

  const idx = parseInt(idxStr, 10);
  const chosen =
    providerChoices[!isNaN(idx) && idx >= 1 && idx <= providerChoices.length ? idx - 1 : 0];
  log("");

  if (chosen.mode === "claude-login") {
    log("  Run this command in your terminal, then re-run \x1b[1mcodebase\x1b[0m:");
    log("");
    log("    \x1b[1mclaude auth login\x1b[0m");
    log("");
    return null;
  }

  if (chosen.mode === "anthropic") {
    log(`  \x1b[2m${chosen.hint}\x1b[0m`);
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const key = await new Promise<string>((res) => {
      rl2.question("  Paste your Anthropic API key (sk-ant-...): ", (a) => {
        rl2.close();
        res(a.trim());
      });
    });
    if (!key) {
      error("No key entered. Run `codebase` again to retry.");
      return null;
    }
    // Store in env for this process (won't persist across processes, but the Claude launch uses env directly)
    process.env.ANTHROPIC_API_KEY = key;
    log("");
    success("Anthropic API key set for this session.");
    log("  \x1b[2mTo persist it, add to your shell profile: export ANTHROPIC_API_KEY=...\x1b[0m");
    log("");
    return { provider: "anthropic", model: "" };
  }

  if (chosen.mode === "openrouter") {
    log(`  \x1b[2m${chosen.hint}\x1b[0m`);
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const key = await new Promise<string>((res) => {
      rl2.question("  Paste your OpenRouter key (sk-or-...): ", (a) => {
        rl2.close();
        res(a.trim());
      });
    });
    if (!key) {
      error("No key entered. Run `codebase` again to retry.");
      return null;
    }
    const cfg = loadConfig();
    cfg.openrouterKey = key;
    saveConfig(cfg);
    log("");
    success("OpenRouter key saved to config.");
    log("");
    // Now let the user pick a model
    const model = await promptModelSelection(key);
    const cfg2 = loadConfig();
    cfg2.provider = "openrouter";
    cfg2.lastModel = model;
    saveConfig(cfg2);
    return { provider: "openrouter", model };
  }

  if (chosen.mode === "zai") {
    log(`  \x1b[2m${chosen.hint}\x1b[0m`);
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const key = await new Promise<string>((res) => {
      rl2.question("  Paste your z.ai API key: ", (a) => {
        rl2.close();
        res(a.trim());
      });
    });
    if (!key) {
      error("No key entered. Run `codebase` again to retry.");
      return null;
    }
    const cfg = loadConfig();
    cfg.zaiKey = key;
    cfg.provider = "zai";
    saveConfig(cfg);
    log("");
    success("z.ai key saved to config.");
    log("");
    return { provider: "zai", model: "" };
  }

  if (chosen.mode === "custom") {
    log(`  \x1b[2m${chosen.hint}\x1b[0m`);
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const url = await new Promise<string>((res) => {
      rl2.question("  Endpoint URL (e.g. http://localhost:11434): ", (a) => {
        rl2.close();
        res(a.trim());
      });
    });
    if (!url) {
      error("No URL entered. Run `codebase` again to retry.");
      return null;
    }
    const rl3 = createInterface({ input: process.stdin, output: process.stdout });
    const key = await new Promise<string>((res) => {
      rl3.question("  API key (leave blank if not required): ", (a) => {
        rl3.close();
        res(a.trim());
      });
    });
    const cfg = loadConfig();
    cfg.customUrl = url;
    cfg.customKey = key;
    cfg.provider = "custom";
    saveConfig(cfg);
    // Try to pick a model from the endpoint
    const model = await promptCustomModelSelection(url, key);
    const cfg2 = loadConfig();
    cfg2.lastModel = model;
    saveConfig(cfg2);
    log("");
    success("Custom endpoint saved to config.");
    log("");
    return { provider: "custom", model };
  }

  return null;
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
    // claude auth status may exit non-zero on subscription auth (keychain-based).
    // Check both stdout and stderr for JSON output.
    const result = spawnSync("claude", ["auth", "status"], {
      encoding: "utf-8",
      timeout: 3000,
    });
    const raw = result.stdout?.trim() || result.stderr?.trim() || "";
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw);
    const auth = { ...defaults, ...parsed };

    // Only trust loggedIn if authMethod is not "none" — "firstParty" + authMethod:"none"
    // means no credentials at all, not subscription auth.
    if (!auth.loggedIn && auth.authMethod !== "none" && auth.apiProvider === "firstParty") {
      auth.loggedIn = true;
      auth.authMethod = "subscription";
      auth.subscriptionType = "plan";
    }
    return auth;
  } catch {
    return defaults;
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

// ─── Session logging ───────────────────────────────────────────────

const SESSION_LOG_DIR = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "codebase",
  "sessions"
);

function getSessionLogPath(): string {
  // One file per day: sessions/2026-04-06.jsonl
  const date = new Date().toISOString().slice(0, 10);
  return join(SESSION_LOG_DIR, `${date}.jsonl`);
}

interface SessionEntry {
  ts: string; // ISO timestamp of session start
  provider: string;
  model: string;
  project: string;
  durationSec: number;
  exitCode: number;
}

/** Fire-and-forget async write — never blocks the exit path */
function logSession(entry: Omit<SessionEntry, "ts">): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  const logPath = getSessionLogPath();
  mkdir(SESSION_LOG_DIR, { recursive: true })
    .then(() => appendFile(logPath, line, "utf-8"))
    .catch(() => {
      /* non-fatal */
    });
}

/**
 * `codebase sessions` — show recent session log.
 * Reads ~/.config/codebase/sessions/<date>.jsonl (one file per day).
 */
export function runSessions(days = 7): void {
  if (!existsSync(SESSION_LOG_DIR)) {
    info("No sessions logged yet. Sessions are recorded when you run `codebase`.");
    return;
  }

  // Read all daily files within the last N days
  const allEntries: SessionEntry[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const file = join(SESSION_LOG_DIR, `${d}.jsonl`);
    if (!existsSync(file)) {
      continue;
    }
    for (const l of readFileSync(file, "utf-8").split("\n").filter(Boolean)) {
      try {
        allEntries.push(JSON.parse(l) as SessionEntry);
      } catch {
        /* skip corrupt line */
      }
    }
  }

  if (allEntries.length === 0) {
    info(`No sessions in the last ${days} days.`);
    info(`Log dir: ${SESSION_LOG_DIR}`);
    return;
  }

  const sorted = allEntries.sort((a, b) => b.ts.localeCompare(a.ts));
  const PAGE = 30;
  const recent = sorted.slice(0, PAGE);
  const truncated = sorted.length > PAGE;

  console.log(
    `\n  \x1b[1mRecent sessions\x1b[0m  (last ${days} days · showing ${recent.length}${truncated ? ` of ${sorted.length}` : ""})\n`
  );
  console.log(
    `  ${"Date".padEnd(18)} ${"Provider".padEnd(12)} ${"Model".padEnd(34)} ${"Project".padEnd(18)} Duration`
  );
  console.log(`  ${"─".repeat(18)} ${"─".repeat(12)} ${"─".repeat(34)} ${"─".repeat(18)} ────────`);

  const trunc = (s: string, max: number) =>
    s.length > max ? s.slice(0, max - 1) + "…" : s.padEnd(max);

  for (const s of recent) {
    const date = new Date(s.ts).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const dur =
      s.durationSec < 60
        ? `${s.durationSec}s`
        : s.durationSec < 3600
          ? `${Math.floor(s.durationSec / 60)}m ${s.durationSec % 60}s`
          : `${Math.floor(s.durationSec / 3600)}h ${Math.floor((s.durationSec % 3600) / 60)}m`;

    console.log(
      `  ${date.padEnd(18)} ${s.provider.padEnd(12)} ${trunc(s.model, 34)} ${trunc(s.project, 18)} ${dur}`
    );
  }

  const totalMin = Math.round(allEntries.reduce((a, s) => a + s.durationSec, 0) / 60);
  const byProvider: Record<string, number> = {};
  for (const s of allEntries) {
    byProvider[s.provider] = (byProvider[s.provider] || 0) + 1;
  }
  const providerSummary = Object.entries(byProvider)
    .map(([p, n]) => `${p}: ${n}`)
    .join("  ");

  console.log(`\n  ${allEntries.length} sessions · ${totalMin}m total · ${providerSummary}`);
  console.log(`  ${SESSION_LOG_DIR}\n`);
}
