import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

/**
 * Persisted user config at ~/.config/codebase/config.json
 *
 * Env vars always take precedence over stored config.
 * CLI flags always take precedence over both.
 *
 * Priority: CLI flags > env vars > config file > defaults
 */
export interface CodebaseConfig {
  version: "1.0";
  provider?: "anthropic" | "openrouter" | "custom";
  model?: string; // e.g. "anthropic/claude-haiku-4-5"
  openrouterKey?: string;
  customUrl?: string;
  customKey?: string;
  lastModel?: string; // last successfully picked model (auto-updated)
}

const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, "codebase")
  : join(homedir(), ".config", "codebase");

const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function loadConfig(): CodebaseConfig {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
      /* corrupted — ignore */
    }
  }
  return { version: "1.0" };
}

export function saveConfig(cfg: CodebaseConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Merge env vars + config into a resolved provider config.
 * Env vars win over stored config; stored config wins over defaults.
 */
export function resolveProviderConfig(): {
  anthropicKey: string;
  openrouterKey: string;
  openrouterBase: string;
  customUrl: string;
  customKey: string;
  savedProvider: string;
  savedModel: string;
} {
  const cfg = loadConfig();

  // Env vars override stored keys
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
  const openrouterKey = process.env.OPENROUTER_API_KEY || cfg.openrouterKey || "";
  const customUrl = process.env.CODEBASE_PROVIDER_URL || cfg.customUrl || "";
  const customKey = process.env.CODEBASE_PROVIDER_KEY || cfg.customKey || "";

  // Base URL: strip trailing /v1 so Claude Code appends /v1/messages correctly
  const rawBase = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api";
  const openrouterBase = rawBase.replace(/\/v1\/?$/, "");

  return {
    anthropicKey,
    openrouterKey,
    openrouterBase,
    customUrl,
    customKey,
    savedProvider: cfg.provider || "",
    savedModel: cfg.model || cfg.lastModel || "",
  };
}
