import type { CLIOptions } from "../types.js";
import { loadConfig, saveConfig, getConfigPath, type CodebaseConfig } from "../utils/config.js";
import { log, success, info, warn, error, bold, heading } from "../utils/output.js";

/**
 * `codebase config` — view and set persistent user config.
 *
 * Stored at ~/.config/codebase/config.json
 * Env vars always override stored values.
 *
 * Subcommands:
 *   (none)               Show current config
 *   set <key> <value>    Set a config value
 *   get <key>            Print a single value
 *   unset <key>          Remove a key
 *   path                 Print config file path
 *
 * Keys:
 *   provider             anthropic | openrouter | custom
 *   model                e.g. anthropic/claude-haiku-4-5
 *   openrouter-key       OpenRouter API key
 *   custom-url           Custom provider base URL
 *   custom-key           Custom provider API key
 *
 * Examples:
 *   codebase config set openrouter-key sk-or-...
 *   codebase config set model anthropic/claude-haiku-4-5
 *   codebase config set provider openrouter
 *   codebase config
 */
export async function runConfig(options: CLIOptions): Promise<void> {
  const sub = options.subcommand || options.positionals[0] || "";
  const args = options.positionals;

  if (sub === "path") {
    log(getConfigPath());
    return;
  }

  if (sub === "get") {
    const key = args[0];
    if (!key) {
      error("Usage: codebase config get <key>");
      process.exit(1);
    }
    const cfg = loadConfig();
    const val = (cfg as unknown as Record<string, unknown>)[camelKey(key)];
    if (val === undefined) {
      warn(`Key "${key}" not set`);
    } else {
      log(String(val));
    }
    return;
  }

  if (sub === "unset") {
    const key = args[0];
    if (!key) {
      error("Usage: codebase config unset <key>");
      process.exit(1);
    }
    const cfg = loadConfig();
    delete (cfg as unknown as Record<string, unknown>)[camelKey(key)];
    saveConfig(cfg);
    success(`Unset: ${key}`);
    return;
  }

  if (sub === "set") {
    // After arg parsing: subcommand="set", positionals=["key","value"]
    const key = args[0];
    const value = args[1];

    if (!key || value === undefined) {
      error("Usage: codebase config set <key> <value>");
      log("");
      log("  Keys: provider, model, openrouter-key, custom-url, custom-key");
      process.exit(1);
    }

    const cfg = loadConfig();
    const ck = camelKey(key);

    // Validate known keys
    const allowed = ["provider", "model", "openrouterKey", "zaiKey", "customUrl", "customKey"];
    if (!allowed.includes(ck)) {
      error(`Unknown key: ${key}`);
      log(`  Valid keys: provider, model, openrouter-key, zai-key, custom-url, custom-key`);
      process.exit(1);
    }

    if (ck === "provider" && !["anthropic", "openrouter", "zai", "custom"].includes(value)) {
      error(`Invalid provider: ${value}`);
      log("  Valid: anthropic | openrouter | zai | custom");
      process.exit(1);
    }

    (cfg as unknown as Record<string, unknown>)[ck] = value;
    saveConfig(cfg);

    // Mask API keys in output
    const display = ck.toLowerCase().includes("key") ? maskKey(value) : value;
    success(`Set ${key} = ${display}`);
    info(`Config saved to: ${getConfigPath()}`);
    return;
  }

  // Default: show config
  printConfig(options.quiet);
}

function printConfig(_quiet: boolean): void {
  const cfg = loadConfig();
  const path = getConfigPath();

  heading("codebase config\n");
  info(`File: ${path}`);
  log("");

  const rows: Array<[string, string, string]> = [
    ["provider", cfg.provider || "(not set)", "anthropic | openrouter | zai | custom"],
    ["model", cfg.model || "(not set)", "e.g. anthropic/claude-haiku-4-5"],
    [
      "openrouter-key",
      cfg.openrouterKey ? maskKey(cfg.openrouterKey) : "(not set)",
      "OpenRouter API key",
    ],
    ["zai-key", cfg.zaiKey ? maskKey(cfg.zaiKey) : "(not set)", "z.ai API key"],
    ["custom-url", cfg.customUrl || "(not set)", "Custom provider base URL"],
    ["custom-key", cfg.customKey ? maskKey(cfg.customKey) : "(not set)", "Custom API key"],
  ];

  const keyW = 18;
  const valW = 30;

  log(`  ${"Key".padEnd(keyW)} ${"Value".padEnd(valW)} Description`);
  log(`  ${"─".repeat(keyW)} ${"─".repeat(valW)} ${"─".repeat(24)}`);

  for (const [key, val, desc] of rows) {
    const valStr = val.padEnd(valW);
    log(`  ${key.padEnd(keyW)} ${valStr} ${desc}`);
  }

  log("");

  // Show effective values (env vars + config)
  const effectiveOpenRouter = process.env.OPENROUTER_API_KEY || cfg.openrouterKey || "";
  const effectiveAnthropic = process.env.ANTHROPIC_API_KEY || "";

  log(`  ${bold("Effective (env vars override config):")}`);
  log(`  ANTHROPIC_API_KEY    ${effectiveAnthropic ? "✓ set (env)" : "(not set)"}`);
  log(
    `  OPENROUTER_API_KEY   ${
      process.env.OPENROUTER_API_KEY
        ? "✓ set (env)"
        : effectiveOpenRouter
          ? "✓ set (config)"
          : "(not set)"
    }`
  );
  log("");
  log(`  ${bold("Quick setup:")}`);
  log(`  codebase config set openrouter-key sk-or-...   # OpenRouter`);
  log(`  codebase config set zai-key <key>              # z.ai (GLM models)`);
  log(`  codebase config set provider openrouter`);
  log("");
}

/** Convert kebab-case keys to camelCase config keys */
function camelKey(key: string): string {
  const map: Record<string, keyof CodebaseConfig> = {
    provider: "provider",
    model: "model",
    "openrouter-key": "openrouterKey",
    openrouterkey: "openrouterKey",
    "zai-key": "zaiKey",
    zaikey: "zaiKey",
    "custom-url": "customUrl",
    customurl: "customUrl",
    "custom-key": "customKey",
    customkey: "customKey",
  };
  return map[key.toLowerCase()] || key;
}

function maskKey(key: string): string {
  if (key.length <= 8) {
    return "****";
  }
  return key.slice(0, 8) + "..." + key.slice(-4);
}
