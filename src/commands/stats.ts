import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export async function runStats(options: {
  quiet?: boolean;
  session?: boolean;
  weekly?: boolean;
  positionals?: string[];
}): Promise<void> {
  const logFile = join(process.cwd(), ".codebase", "session-log.jsonl");
  if (!existsSync(logFile)) {
    return;
  }

  const lines = readFileSync(logFile, "utf-8").trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    return;
  }

  const entries = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<{
    ts: string;
    tool: string;
    tokens_est?: number;
    cache_hit?: boolean;
  }>;

  const K = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

  // --weekly flag: last 7 days summary
  const hasWeekly =
    options.weekly ||
    (Array.isArray(options.positionals) && options.positionals.includes("--weekly"));

  if (hasWeekly) {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekEntries = entries.filter((e) => new Date(e.ts).getTime() > sevenDaysAgo);
    if (weekEntries.length === 0) {
      return;
    }

    const totalTokens = weekEntries.reduce((sum, e) => sum + (e.tokens_est ?? 0), 0);
    const tokensSaved = Math.round(totalTokens * 0.95);
    const callCount = weekEntries.length;

    // Count unique tools as "active skills"
    const uniqueTools = new Set(weekEntries.map((e) => e.tool)).size;

    console.log(
      `· codebase · Last 7 days: ${callCount} MCP calls, ~${K(tokensSaved)} tokens saved · ${uniqueTools} tools active`
    );
    return;
  }

  // --session flag (or default): last 30 minutes
  const now = Date.now();
  const sessionCutoff = now - 30 * 60 * 1000;
  const sessionEntries = entries.filter((e) => new Date(e.ts).getTime() > sessionCutoff);

  if (sessionEntries.length < 3) {
    return;
  } // not enough to be interesting

  const totalTokens = sessionEntries.reduce((sum, e) => sum + (e.tokens_est ?? 0), 0);
  const cacheHits = sessionEntries.filter((e) => e.cache_hit).length;
  const callCount = sessionEntries.length;
  const tokensSaved = Math.round(totalTokens * 0.95); // 95% savings vs exploration

  console.log(
    `· codebase · ${K(tokensSaved)} tokens saved · ${callCount} MCP calls · ${cacheHits} cache hits`
  );
}
