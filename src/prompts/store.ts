/**
 * Prompt audit store — append-only JSONL at .codebase/prompts.jsonl.
 *
 * Captures every user prompt for traceability. When a prompt references
 * an issue (#N, GH-N, or an issue URL), it can be mirrored as a comment
 * to that issue.
 *
 * Zero dependencies.
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

export interface PromptRecord {
  id: string;
  ts: string;
  session_id: string;
  branch: string;
  cwd: string;
  prompt: string;
  issue_refs: number[];
  redacted: boolean;
}

const LOG_MAX_BYTES = 2 * 1024 * 1024;
const FILE = "prompts.jsonl";
const DIR = ".codebase";

const ISSUE_PATTERNS: RegExp[] = [
  /(?<![A-Za-z0-9_])#(\d{1,6})\b/g,
  /\bGH-(\d{1,6})\b/gi,
  /\bissues?\s+#?(\d{1,6})\b/gi,
  /github\.com\/[^/\s]+\/[^/\s]+\/issues\/(\d{1,6})/gi,
];

export function extractIssueRefs(text: string): number[] {
  const found = new Set<number>();
  for (const pattern of ISSUE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n < 1_000_000) {
        found.add(n);
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Token-precise redaction tuned for chat prompts (free-form prose).
 *
 * Each pattern replaces only the matched span with `[REDACTED:<type>]`,
 * preserving issue refs and surrounding context. The patterns intentionally
 * match raw tokens (no `key=value` assignment required) because chat prompts
 * rarely contain config-file syntax. Bounded quantifiers throughout to avoid
 * catastrophic backtracking on attacker-controlled prompts.
 */
const PROMPT_SECRET_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  // Cloud / vendor keys with strong prefixes (raw tokens — no assignment needed)
  { pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, type: "aws-access-key-id" },
  { pattern: /\bghp_[A-Za-z0-9_]{36,80}\b/g, type: "github-pat" },
  { pattern: /\bgho_[A-Za-z0-9_]{36,80}\b/g, type: "github-oauth" },
  { pattern: /\bghu_[A-Za-z0-9_]{36,80}\b/g, type: "github-user-token" },
  { pattern: /\bghs_[A-Za-z0-9_]{36,80}\b/g, type: "github-app-token" },
  { pattern: /\bghr_[A-Za-z0-9_]{36,80}\b/g, type: "github-refresh-token" },
  { pattern: /\bxox[baprse]-[0-9a-zA-Z-]{10,200}\b/g, type: "slack-token" },
  { pattern: /\b(?:sk|pk|rk)_(?:test|live)_[0-9a-zA-Z]{16,128}\b/g, type: "stripe-key" },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, type: "google-api-key" },
  { pattern: /\bSG\.[A-Za-z0-9_-]{16,32}\.[A-Za-z0-9_-]{32,64}\b/g, type: "sendgrid-api-key" },
  { pattern: /\bsk-ant-[a-zA-Z0-9_-]{20,128}\b/g, type: "anthropic-api-key" },
  { pattern: /\bsk-proj-[A-Za-z0-9_-]{32,256}\b/g, type: "openai-project-key" },
  { pattern: /\bsk-[A-Za-z0-9]{20,64}T3BlbkFJ[A-Za-z0-9]{20,64}\b/g, type: "openai-api-key" },
  // JWT (three base64url segments). Bounded length per segment to stop ReDoS.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,512}\.[A-Za-z0-9_-]{8,2048}\.[A-Za-z0-9_-]{8,1024}\b/g,
    type: "jwt",
  },
  // PEM private key block — captures only the BEGIN/END markers and contents in between
  // (greedy across newlines, capped at 8 KB).
  {
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]{1,8192}?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    type: "private-key-block",
  },
  // Bearer / token-prefixed credentials (case-insensitive).
  {
    pattern:
      /\b(?:bearer|token|password|secret|api[_-]?key|access[_-]?token)[\s:=]+[A-Za-z0-9_.+\/=-]{20,256}/gi,
    type: "bearer-or-keyword-token",
  },
  // Database URL with embedded credentials. Bounded segments to kill ReDoS.
  {
    pattern:
      /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s'":@]{1,128}:[^\s'"@]{1,256}@[^\s'"]{1,256}/g,
    type: "database-url-with-credentials",
  },
];

/** Cap input size to avoid wasting cycles on huge attacker pastes. */
const MAX_REDACT_INPUT = 256 * 1024;

/**
 * Replace any leaked secrets in `text` with a `[REDACTED:<type>]` marker.
 * Token-precise — only the matched span is replaced, surrounding text
 * (including issue refs) is preserved.
 */
export function redactSecrets(text: string): { text: string; redacted: boolean } {
  const input = text.length > MAX_REDACT_INPUT ? text.slice(0, MAX_REDACT_INPUT) : text;
  let out = input;
  let redacted = false;
  for (const { pattern, type } of PROMPT_SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(out)) {
      pattern.lastIndex = 0;
      out = out.replace(pattern, `[REDACTED:${type}]`);
      redacted = true;
    }
  }
  // If the original was truncated, append a marker so callers know.
  if (input.length < text.length) {
    out += `\n[TRUNCATED: input ${text.length} bytes > ${MAX_REDACT_INPUT} cap]`;
    redacted = true;
  }
  return { text: out, redacted };
}

function rotateIfLarge(file: string): void {
  if (!existsSync(file)) {
    return;
  }
  const { size } = statSync(file);
  if (size <= LOG_MAX_BYTES) {
    return;
  }
  const stamp = new Date().toISOString().replace(/[:T.]/g, "-").slice(0, 19);
  const rotated = `${file}.${stamp}`;
  try {
    if (!existsSync(rotated)) {
      renameSync(file, rotated);
    } else {
      unlinkSync(file);
    }
  } catch {
    /* non-critical */
  }
}

function generateId(ts: string): string {
  // Deterministic-ish short id: ts millis + 4 random hex chars.
  const ms = new Date(ts).getTime() || Date.now();
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `${ms.toString(36)}-${rand}`;
}

export interface CaptureInput {
  session_id?: string;
  branch?: string;
  cwd?: string;
  prompt: string;
  ts?: string;
}

export function capturePrompt(root: string, input: CaptureInput): PromptRecord {
  const dir = join(root, DIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, FILE);
  rotateIfLarge(file);

  const ts = input.ts ?? new Date().toISOString();
  const { text, redacted } = redactSecrets(input.prompt ?? "");
  const record: PromptRecord = {
    id: generateId(ts),
    ts,
    session_id: input.session_id ?? "",
    branch: input.branch ?? "",
    cwd: input.cwd ?? root,
    prompt: text,
    issue_refs: extractIssueRefs(text),
    redacted,
  };
  // O_APPEND + 0o600: only the owner can read the audit log. Records can contain
  // unredacted prompt content if the redaction patterns missed something, so
  // tight perms here are a last line of defence.
  const fd = openSync(file, "a", 0o600);
  try {
    writeSync(fd, JSON.stringify(record) + "\n");
  } finally {
    closeSync(fd);
  }
  return record;
}

/**
 * Tail-read the most recent prompt id without parsing the whole file.
 * Reads the last 8 KB, finds the last newline, parses only the trailing record.
 * O(1) for hot-path callers (every MCP tools/call).
 */
export function latestPromptIdFast(root: string, sessionId?: string): string | undefined {
  const file = join(root, DIR, FILE);
  if (!existsSync(file)) {
    return undefined;
  }
  let fd: number | undefined;
  try {
    const stats = statSync(file);
    if (stats.size === 0) {
      return undefined;
    }
    const tailBytes = Math.min(stats.size, 8 * 1024);
    const buf = Buffer.allocUnsafe(tailBytes);
    fd = openSync(file, "r");
    // readSync is statically imported above — DO NOT use `require("node:fs")` here.
    // tsup emits ESM-only and the runtime `require` shim throws at call time,
    // which would silently break prompt-id traceability via the outer try/catch.
    readSync(fd, buf, 0, tailBytes, stats.size - tailBytes);
    const text = buf.toString("utf-8");
    const lines = text.split("\n").filter((l) => l.trim());
    // Walk from the end so we can scope by sessionId without rebuilding the world.
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const rec = JSON.parse(lines[i]) as PromptRecord;
        if (!sessionId || rec.session_id === sessionId) {
          return rec.id;
        }
      } catch {
        /* skip partial line */
      }
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

export interface ReadFilter {
  issue?: number;
  branch?: string;
  since?: Date;
  limit?: number;
}

export function readPrompts(root: string, filter: ReadFilter = {}): PromptRecord[] {
  const file = join(root, DIR, FILE);
  if (!existsSync(file)) {
    return [];
  }
  const lines = readFileSync(file, "utf-8").split("\n");
  const out: PromptRecord[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      const rec = JSON.parse(line) as PromptRecord;
      if (filter.issue !== undefined && !rec.issue_refs.includes(filter.issue)) {
        continue;
      }
      if (filter.branch && rec.branch !== filter.branch) {
        continue;
      }
      if (filter.since && new Date(rec.ts) < filter.since) {
        continue;
      }
      out.push(rec);
    } catch {
      /* skip malformed line */
    }
  }
  if (filter.limit && out.length > filter.limit) {
    return out.slice(out.length - filter.limit);
  }
  return out;
}

export function findPrompt(root: string, id: string): PromptRecord | undefined {
  const file = join(root, DIR, FILE);
  if (!existsSync(file)) {
    return undefined;
  }
  const lines = readFileSync(file, "utf-8").split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      const rec = JSON.parse(line) as PromptRecord;
      if (rec.id === id) {
        return rec;
      }
    } catch {
      /* skip */
    }
  }
  return undefined;
}

/** Read the most recent prompt id for the given session, or undefined. */
export function latestPromptId(root: string, sessionId?: string): string | undefined {
  const file = join(root, DIR, FILE);
  if (!existsSync(file)) {
    return undefined;
  }
  const lines = readFileSync(file, "utf-8")
    .split("\n")
    .filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const rec = JSON.parse(lines[i]) as PromptRecord;
      if (!sessionId || rec.session_id === sessionId) {
        return rec.id;
      }
    } catch {
      /* skip */
    }
  }
  return undefined;
}

/**
 * Parse a `--since` argument like "24h", "7d", "30m" into a Date relative to now.
 * Returns undefined if the input is unrecognised.
 */
export function parseSince(input: string): Date | undefined {
  const m = input.match(/^(\d+)\s*([smhdw])$/i);
  if (!m) {
    return undefined;
  }
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const factors: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 7 * 86_400_000,
  };
  const ms = n * (factors[unit] ?? 0);
  if (!ms) {
    return undefined;
  }
  return new Date(Date.now() - ms);
}
