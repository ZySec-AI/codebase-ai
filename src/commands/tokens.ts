import { resolve, join } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import type { CLIOptions } from "../types.js";
import { setQuiet, heading, log, dim, bold, success } from "../utils/output.js";
import { estimateTokens, gradeTokenBudget } from "../utils/tokens.js";

const GRADE_THRESHOLDS = { a: 15_000, b: 30_000, c: 60_000 };

/**
 * `codebase tokens` — estimates the total per-session token cost for this project.
 *
 * Measures CLAUDE.md, .codebase.json, MCP servers, slash commands, and settings
 * to give a graded budget report (A/B/C/D).
 */
export async function runTokens(options: CLIOptions): Promise<void> {
  setQuiet(options.quiet);
  const root = resolve(options.path);

  heading("codebase tokens\n");

  interface Source {
    label: string;
    tokens: number;
    detail: string;
  }

  const sources: Source[] = [];

  // ── CLAUDE.md ────────────────────────────────────────────────
  const claudeMdPath = join(root, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, "utf-8");
    const tokens = estimateTokens(content);
    const lines = content.split("\n").length;
    sources.push({ label: "CLAUDE.md", tokens, detail: `${lines} lines` });
  }

  // ── .codebase.json manifest ───────────────────────────────────
  const manifestPath = join(root, ".codebase.json");
  if (existsSync(manifestPath)) {
    const content = readFileSync(manifestPath, "utf-8");
    const tokens = estimateTokens(content);
    const sizeKB = (statSync(manifestPath).size / 1024).toFixed(1);
    sources.push({ label: ".codebase.json", tokens, detail: `${sizeKB} KB` });
  }

  // ── MCP servers ───────────────────────────────────────────────
  const mcpPath = join(root, ".mcp.json");
  if (existsSync(mcpPath)) {
    try {
      const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
      const servers = Object.keys(config.mcpServers ?? {});
      if (servers.length > 0) {
        // ~10k tokens per MCP server (tool definitions loaded at session start)
        const tokens = servers.length * 10_000;
        sources.push({
          label: `MCP servers (${servers.length})`,
          tokens,
          detail: servers.join(", "),
        });
      }
    } catch {
      /* malformed .mcp.json — already flagged by doctor */
    }
  }

  // ── Slash commands ────────────────────────────────────────────
  const commandsDir = join(root, ".claude", "commands");
  if (existsSync(commandsDir)) {
    const files = readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
    if (files.length > 0) {
      const totalTokens = files.reduce((sum, f) => {
        try {
          return sum + estimateTokens(readFileSync(join(commandsDir, f), "utf-8"));
        } catch {
          return sum;
        }
      }, 0);
      sources.push({
        label: `Slash commands (${files.length})`,
        tokens: totalTokens,
        detail: files.map((f) => f.replace(".md", "")).join(", "),
      });
    }
  }

  // ── settings.json ─────────────────────────────────────────────
  const settingsPath = join(root, ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    const content = readFileSync(settingsPath, "utf-8");
    const tokens = estimateTokens(content);
    sources.push({ label: "settings.json", tokens, detail: "" });
  }

  if (sources.length === 0) {
    log("  No codebase context found. Run `codebase init` first.\n");
    return;
  }

  // ── Print table ───────────────────────────────────────────────
  const LABEL_W = 28;
  const TOKENS_W = 8;

  log(`  ${"Source".padEnd(LABEL_W)} ${"Tokens".padStart(TOKENS_W)}   Grade`);
  dim(`  ${"─".repeat(LABEL_W + TOKENS_W + 12)}`);

  const total = sources.reduce((s, r) => s + r.tokens, 0);

  for (const s of sources) {
    const grade = gradeTokenBudget(s.tokens, GRADE_THRESHOLDS);
    const tokStr = s.tokens.toLocaleString().padStart(TOKENS_W);
    log(`  ${s.label.padEnd(LABEL_W)} ${tokStr}   ${grade}`);
  }

  dim(`  ${"─".repeat(LABEL_W + TOKENS_W + 12)}`);
  const totalGrade = gradeTokenBudget(total, GRADE_THRESHOLDS);
  log(
    `  ${bold("Estimated session startup".padEnd(LABEL_W))} ${bold(total.toLocaleString().padStart(TOKENS_W))}   ${bold(totalGrade)}`
  );
  log("");
  dim("  Grades: A (<15k) | B (<30k) | C (<60k) | D (>60k)");
  log("");

  // ── Recommendations ───────────────────────────────────────────
  const recs: string[] = [];

  const claudeMd = sources.find((s) => s.label === "CLAUDE.md");
  if (claudeMd && claudeMd.tokens > 2000) {
    recs.push(
      `CLAUDE.md is large (~${claudeMd.tokens.toLocaleString()} tokens) — trim to <300 lines`
    );
  }

  const mcp = sources.find((s) => s.label.startsWith("MCP"));
  if (mcp && mcp.tokens > 30_000) {
    recs.push("Many MCP servers — remove unused ones to save tokens");
  }

  if (recs.length > 0) {
    log("  Recommendations:");
    for (const r of recs) {
      log(`  - ${r}`);
    }
    log("");
  }

  success("Done");
}
