import { createInterface } from "node:readline";
import { readFile, writeFile, rename } from "node:fs/promises";
import { existsSync, readdirSync, appendFileSync, mkdirSync, statSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { estimateJsonTokens, gradeTokenBudget } from "../utils/tokens.js";
import { retry, isTransientError } from "../utils/retry.js";
import { queryPath } from "../utils/json-path.js";
import { scan } from "../scanner/engine.js";
import { generateBrief, generateSlimBrief } from "./brief.js";
import { rankIssues, syncGitHub } from "../github/sync.js";
import {
  buildCloseBody,
  isCommentKind,
  withTraceFooter,
  type StructuredCloseInput,
} from "../github/issues.js";
import { latestPromptIdFast, parseSince, readPrompts } from "../prompts/store.js";
import type { Manifest } from "../types.js";

// ─── MCP response cache ────────────────────────────────────────

interface MCPCache {
  mtimeMs: number;
  manifestPath: string;
  responses: Map<string, unknown>;
}
const mcpCache: MCPCache = {
  mtimeMs: 0,
  manifestPath: "",
  responses: new Map(),
};

function getCachedResponse(manifestPath: string, key: string): unknown | undefined {
  try {
    const mtime = statSync(manifestPath).mtimeMs;
    if (mtime !== mcpCache.mtimeMs || manifestPath !== mcpCache.manifestPath) {
      mcpCache.mtimeMs = mtime;
      mcpCache.manifestPath = manifestPath;
      mcpCache.responses.clear();
    }
  } catch {
    mcpCache.responses.clear();
  }
  return mcpCache.responses.get(key);
}

function setCachedResponse(key: string, value: unknown): void {
  mcpCache.responses.set(key, value);
}

interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

const TOOL_DEFINITIONS = [
  // ─── Session Start ─────────────────────────────────────────────
  {
    name: "project_brief",
    description:
      "CALL THIS FIRST at the start of every session. Returns a complete project briefing: what the project is, tech stack, current priorities, open issues, blockers, what to work on next, and recent decisions. This is your single source of truth — call it before doing anything else.",
    inputSchema: {
      type: "object" as const,
      properties: {
        slim: {
          type: "boolean" as const,
          description:
            "Return a lightweight ~20-line brief (manifest age, next task, blockers, last commits). Faster for session-start hooks or low-context situations.",
        },
      },
    },
  },

  // ─── Context Queries ───────────────────────────────────────────
  {
    name: "get_codebase",
    description:
      "Read a broad slice of the project manifest by category (stack, commands, structure, git, quality, etc). Use for category-level overviews. For deep nested paths, use query_codebase instead.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string" as const,
          description:
            "Section to retrieve: repo, structure, stack, commands, dependencies, config, git, quality, patterns, status, roadmap, decisions",
        },
        fields: {
          type: "array" as const,
          items: { type: "string" as const },
          description:
            "Optional. When category is specified, return only these keys from that section. E.g. ['languages', 'frameworks'] for stack.",
        },
      },
    },
  },
  {
    name: "query_codebase",
    description:
      "Query a specific nested path in the manifest using dot-notation (e.g. 'status.kanban.in_progress', 'stack.languages'). Use for targeted data retrieval. For broad category overviews, use get_codebase instead.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description:
            "Dot-path query, e.g. 'stack.languages', 'commands.test', 'status.priorities'",
        },
        fields: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Optional: return only these fields from the result object",
        },
      },
      required: ["path"],
    },
  },

  // ─── Task Management ───────────────────────────────────────────
  {
    name: "get_next_task",
    description:
      "Get the highest-priority task you should work on next. Returns the top open issue ranked by priority labels (P0 > P1 > bugs > features), including mapped files so you know where to start coding.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_blockers",
    description:
      "Get all current blockers — issues labeled as blocked, PRs waiting for review, PRs with failing CI checks, PRs with merge conflicts, and uncommitted changes. Shows what's preventing progress.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  // ─── Issue Actions ─────────────────────────────────────────────
  {
    name: "create_issue",
    description:
      "Create a new GitHub issue. Use this when you discover a bug, identify needed work, or the user asks to track something. Returns the issue URL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string" as const, description: "Issue title" },
        body: { type: "string" as const, description: "Issue body/description (markdown)" },
        labels: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Labels to apply: bug, feature, enhancement, P0, P1, P2, etc.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "close_issue",
    description:
      "Close a GitHub issue with a structured audit trail. Required: a closing comment, a reason, and ideally the commits that resolved it. Closes the issue first, then posts the structured comment with reason + evidence + commits + trace footer. If the comment post fails, the issue is still closed (recoverable via comment_issue) — never the other way round, so the timeline can never show 'Closed: …' on an issue that's still open. Use this after verifying the fix.",
    inputSchema: {
      type: "object" as const,
      properties: {
        number: { type: "number" as const, description: "Issue number to close" },
        comment: {
          type: "string" as const,
          description:
            "Required. Plain-English summary of what was done — the lead line of the closing comment.",
        },
        reason: {
          type: "string" as const,
          enum: ["fixed", "wont-fix", "duplicate", "not-reproducible", "obsolete"],
          description:
            "Required. Why this issue is being closed. 'fixed' is the default for completed work.",
        },
        evidence: {
          type: "string" as const,
          description:
            "Optional. Supporting evidence — test output, before/after, manual verification steps, screenshots URL. Anything that proves the work is done.",
        },
        commits: {
          type: "array" as const,
          items: { type: "string" as const },
          description:
            "Optional. Commit SHAs (short or full) that implement the fix. Listed in the closing comment for traceability.",
        },
      },
      required: ["number", "comment", "reason"],
    },
  },

  {
    name: "comment_issue",
    description:
      "Post a structured comment to a GitHub issue. Use this to record status updates, evidence, decisions, or notes. Each comment is tagged with a `kind` and a trace footer (timestamp · branch · prompt id) so the audit trail is searchable.",
    inputSchema: {
      type: "object" as const,
      properties: {
        number: { type: "number" as const, description: "Issue number" },
        body: { type: "string" as const, description: "Comment body (markdown)" },
        kind: {
          type: "string" as const,
          enum: ["status", "evidence", "decision", "close-reason", "note"],
          description:
            "Comment kind — drives the trace footer. status = starting/progress, evidence = proof of work, decision = architectural choice, close-reason = closure rationale, note = freeform.",
        },
      },
      required: ["number", "body", "kind"],
    },
  },

  {
    name: "update_issue",
    description:
      "Update a GitHub issue — add/remove labels, set assignee, optionally post a status comment in the same call. Use this to advance issues through the pipeline (e.g., add 'status:in-progress' AND drop a 'starting work on X' comment so the change is visible).",
    inputSchema: {
      type: "object" as const,
      properties: {
        number: { type: "number" as const, description: "Issue number" },
        add_labels: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Labels to add",
        },
        remove_labels: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Labels to remove",
        },
        assignee: {
          type: "string" as const,
          description: "GitHub username to assign (or empty string to unassign)",
        },
        comment: {
          type: "string" as const,
          description:
            "Optional. Status comment to post alongside the label/assignee changes. Recommended whenever you flip a status:* label so the change is visible in the timeline.",
        },
      },
      required: ["number"],
    },
  },

  {
    name: "link_commits_to_issue",
    description:
      "Find recent commits that reference an issue (via #N or 'Refs #N' in the message) and post a single consolidated comment to that issue listing the SHAs and one-line summaries. Call this between implementation and close so the issue timeline shows what shipped.",
    inputSchema: {
      type: "object" as const,
      properties: {
        number: { type: "number" as const, description: "Issue number to link to" },
        since: {
          type: "string" as const,
          description:
            "Optional git revision range (default: last 50 commits). E.g. 'main..HEAD' or a SHA.",
        },
        limit: {
          type: "number" as const,
          description: "Max commits to scan (default: 50)",
        },
      },
      required: ["number"],
    },
  },

  {
    name: "get_prompt_history",
    description:
      "Read captured user prompts from .codebase/prompts.jsonl — the project-local audit log written by the prompt-capture hook. Use to recover 'what was I asked to do' at session resume, or to pull the originating prompt(s) for a specific issue.",
    inputSchema: {
      type: "object" as const,
      properties: {
        issue: {
          type: "number" as const,
          description: "Filter to prompts that referenced this issue number",
        },
        branch: { type: "string" as const, description: "Filter by git branch" },
        since: {
          type: "string" as const,
          description: "Relative window: 30m, 24h, 7d, 1w. Defaults to all time.",
        },
        limit: {
          type: "number" as const,
          description: "Cap number of records returned (default: 20)",
        },
      },
    },
  },

  // ─── Commands ──────────────────────────────────────────────────
  {
    name: "list_commands",
    description:
      "List installed Claude Code slash commands in this project. Returns names of available commands (e.g. /vibeloop, /setup, /simulate, /build, /launch, /review).",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "list_skills",
    description:
      "List installed Claude Code skills with their names and descriptions. Skills extend /review and other commands with stack-specific analysis.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  // ─── Plan (PLAN.md) ────────────────────────────────────────────
  {
    name: "get_plan",
    description:
      "Read the project's PLAN.md — Claude's persistent working memory across sessions. Contains current sprint goals, in-flight work, decisions log, and blockers. Call this after project_brief to restore loop context.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "update_plan",
    description:
      "Append a status update to PLAN.md. Use this at the end of each build or simulate cycle to record what was done, decisions made, and what's next. Creates PLAN.md if it doesn't exist.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string" as const,
          description: "Status update text to append to PLAN.md Update Log section",
        },
      },
      required: ["message"],
    },
  },

  // ─── Issue & PR Detail ─────────────────────────────────────────
  {
    name: "get_issue",
    description:
      "Get full details of a specific GitHub issue by number, including body, comments, and linked PRs. Use this when working on an issue and need its complete specification.",
    inputSchema: {
      type: "object" as const,
      properties: {
        number: { type: "number" as const, description: "Issue number" },
      },
      required: ["number"],
    },
  },
  {
    name: "get_pr",
    description:
      "Get full details of a specific pull request by number, including body, review status, checks, and diff stats.",
    inputSchema: {
      type: "object" as const,
      properties: {
        number: { type: "number" as const, description: "PR number" },
      },
      required: ["number"],
    },
  },

  // ─── Rescan ────────────────────────────────────────────────────
  {
    name: "rescan_project",
    description:
      "Rescan the project to refresh the manifest after making changes. Call this after major refactors, dependency updates, or when your cached data feels stale.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sync: {
          type: "boolean" as const,
          description: "Also refresh GitHub data (issues, PRs, milestones). Default: true.",
        },
        incremental: {
          type: "boolean" as const,
          description: "Only re-scan changed areas (faster). Default: false.",
        },
      },
    },
  },
  {
    name: "refresh_status",
    description:
      "Refresh only GitHub data (issues, PRs, milestones) without re-scanning the filesystem. Much faster than rescan_project. Call this after creating/closing issues to get fresh priority data.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  // ─── Session Transfer ──────────────────────────────────────────
  {
    name: "generate_handoff",
    description:
      "Generate HANDOFF.md capturing current session state for context transfer. Collects git state (branch, recent commits, diff stat, uncommitted changes, stashes) and manifest data (in-progress issues, next task, blockers). Use at the end of a session to leave a breadcrumb for the next agent or human.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string" as const,
          description: "Optional session notes to include in the handoff document.",
        },
      },
    },
  },

  // ─── Token Budget ──────────────────────────────────────────────
  {
    name: "token_budget",
    description:
      "Check the token budget for the current manifest. Returns estimated token count, grade (A-D), and recommendations for reducing context size. Call this when the session feels slow or you're approaching context limits.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  // ─── Graph / Blast Radius ──────────────────────────────────────
  {
    name: "get_impact_radius",
    description:
      "Full N-hop transitive call/import graph analysis for changed files. Returns callers, callees, tests, and a risk score. Use for blast-radius analysis before merging. Returns: { changed_files, callers, callees, tests, risk_score }.",
    inputSchema: {
      type: "object" as const,
      properties: {
        files: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Relative file paths that changed (e.g. ['src/mcp/server.ts'])",
        },
        pr: {
          type: "number" as const,
          description: "PR number — fetch changed files from GitHub instead of supplying manually",
        },
        hops: {
          type: "number" as const,
          description: "Transitive hop limit (default: 2)",
        },
      },
    },
  },
  {
    name: "get_review_context",
    description:
      "Token-budgeted minimal scope for PR code review — changed files + their direct tests only. More focused than get_impact_radius. Returns: { files, total_tokens, hint }.",
    inputSchema: {
      type: "object" as const,
      properties: {
        files: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Changed files (relative paths)",
        },
        pr: {
          type: "number" as const,
          description: "PR number — fetch changed files from GitHub",
        },
        token_budget: {
          type: "number" as const,
          description: "Max tokens to include (default: 20000)",
        },
      },
    },
  },
  {
    name: "query_graph",
    description:
      "Query the call/import graph. Supports callers (who imports this file), callees (what this file imports), symbol search, entrypoints (files with no importers), and tests (test files covering a given file).",
    inputSchema: {
      type: "object" as const,
      properties: {
        kind: {
          type: "string" as const,
          description: "Query type: callers | callees | symbol | entrypoints | tests",
        },
        file: {
          type: "string" as const,
          description: "Relative file path (required for callers/callees/tests)",
        },
        symbol: {
          type: "string" as const,
          description: "Symbol name substring (required for symbol queries)",
        },
      },
      required: ["kind"],
    },
  },
  {
    name: "get_dead_code",
    description:
      "Find unreachable code via entrypoint reachability BFS over the import/call graph. Returns dead files (never reached from any entry point) and dead exports (exported symbols inside reachable files that no other file calls). Use before refactors or to keep the codebase lean. Returns: { dead_files, dead_exports, entrypoints, reachable_files, total_files }.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_cycles",
    description:
      "Detect import cycles in the project using Tarjan's strongly-connected-components algorithm on the file-level import graph. Returns each cycle as a list of files. Cycles indicate refactor candidates — circular dependencies hurt build times, testability, and reasoning. Returns: { cycles: string[][], count }.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_orphans",
    description:
      "List orphan files — files with zero importers AND zero imports, excluding detected entry points and tests. These are often forgotten scratch files, abandoned experiments, or genuinely stale code. Returns: { orphans: string[], count }.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "rebuild_graph",
    description:
      "Build or rebuild the call/import graph (.codebase/graph.json). Use `incremental: true` for a fast update after small changes, `incremental: false` (default) for a full rebuild. Returns { nodes: number, edges: number, duration_ms: number } on completion.",
    inputSchema: {
      type: "object" as const,
      properties: {
        incremental: {
          type: "boolean" as const,
          description:
            "If true, re-parse only files whose content hash changed (faster). Default: false.",
        },
      },
    },
  },
];

// ─── Session logging ──────────────────────────────────────────────

const LOG_MAX_BYTES = 1024 * 1024; // 1 MB

function appendSessionLog(root: string, entry: object): void {
  const dir = join(root, ".codebase");
  const logFile = join(dir, "session-log.jsonl");
  try {
    mkdirSync(dir, { recursive: true });
    // Weekly rotation: if log > 1MB, rename to session-log-YYYY-WW.jsonl
    if (existsSync(logFile)) {
      const { size } = statSync(logFile);
      if (size > LOG_MAX_BYTES) {
        const now = new Date();
        const week = `${now.getFullYear()}-${String(getISOWeek(now)).padStart(2, "0")}`;
        let rotated = join(dir, `session-log-${week}.jsonl`);
        // If a rotated file for the same week already exists, append a
        // millisecond stamp instead of unlinking — never destroy accumulated
        // trace evidence (CLAUDE.md "Traceability Contract" guarantee).
        if (existsSync(rotated)) {
          const stamp = new Date().toISOString().replace(/[:T.]/g, "-").slice(0, 23);
          rotated = join(dir, `session-log-${week}-${stamp}.jsonl`);
        }
        try {
          renameSync(logFile, rotated);
        } catch {
          /* non-critical */
        }
      }
    }
    appendFileSync(logFile, JSON.stringify(entry) + "\n");
  } catch {
    /* non-critical */
  }
}

// ─── Prompt-id cache for hot-path traceability ────────────────────
//
// Every MCP tool call needs the active prompt id to thread through both the
// session log and structured comments. Reading prompts.jsonl on every call
// is up to 2 MB of sync I/O — unacceptable on a chatty agent. Cache by
// mtime: if the file hasn't changed, reuse last result.
interface PromptIdCacheEntry {
  mtimeMs: number;
  size: number;
  bySession: Map<string, string | undefined>;
}
const _promptIdCache = new Map<string, PromptIdCacheEntry>();

function getPromptIdCached(root: string, sessionId?: string): string | undefined {
  let mtimeMs = 0;
  let size = 0;
  try {
    const s = statSync(join(root, ".codebase", "prompts.jsonl"));
    mtimeMs = s.mtimeMs;
    size = s.size;
  } catch {
    return undefined;
  }
  const key = sessionId ?? "_global_";
  const entry = _promptIdCache.get(root);
  if (entry && entry.mtimeMs === mtimeMs && entry.size === size) {
    if (entry.bySession.has(key)) {
      return entry.bySession.get(key);
    }
    const id = latestPromptIdFast(root, sessionId);
    entry.bySession.set(key, id);
    return id;
  }
  const fresh: PromptIdCacheEntry = { mtimeMs, size, bySession: new Map() };
  const id = latestPromptIdFast(root, sessionId);
  fresh.bySession.set(key, id);
  _promptIdCache.set(root, fresh);
  return id;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export async function startMcpServer(root: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, terminal: false });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line);
    } catch {
      writeResponse({ jsonrpc: "2.0", id: 0, error: { code: -32700, message: "Parse error" } });
      continue;
    }

    const response = await handleRequest(request, root);
    if (response) {
      writeResponse(response);
    }
  }
}

async function handleRequest(req: JsonRpcRequest, root: string): Promise<JsonRpcResponse | null> {
  switch (req.method) {
    case "initialize":
      return respond(req.id, {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "codebase", version: __VERSION__ },
        capabilities: { tools: {} },
      });

    case "notifications/initialized":
      return null; // Notifications are one-way — no response per JSON-RPC spec

    case "tools/list":
      return respond(req.id, { tools: TOOL_DEFINITIONS });

    case "tools/call":
      return handleToolCall(req, root);

    default:
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      };
  }
}

async function handleToolCall(req: JsonRpcRequest, root: string): Promise<JsonRpcResponse> {
  const params = req.params || {};
  const toolName = params.name as string;
  const args = (params.arguments || {}) as Record<string, unknown>;

  const result = await dispatchToolCall(req, root, toolName, args);
  // Fire-and-forget session log via setImmediate — the response to the caller
  // never waits on the disk write or the prompt-id stat. Cached prompt-id
  // lookup is O(1) when the file hasn't changed (see getPromptIdCached).
  const resultStr = JSON.stringify(result);
  const sessionId = process.env.CLAUDE_SESSION_ID ?? process.pid.toString();
  const promptId = getPromptIdCached(root, process.env.CLAUDE_SESSION_ID) ?? null;
  const logEntry = {
    ts: new Date().toISOString(),
    session_id: sessionId,
    prompt_id: promptId,
    tool: toolName,
    result_bytes: resultStr.length,
    tokens_est: Math.round(resultStr.length / 3.8),
    cache_hit: false,
  };
  setImmediate(() => {
    try {
      appendSessionLog(root, logEntry);
    } catch {
      /* non-critical */
    }
  });
  return result;
}

async function dispatchToolCall(
  req: JsonRpcRequest,
  root: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<JsonRpcResponse> {
  try {
    switch (toolName) {
      case "project_brief": {
        const manifestPath = join(root, ".codebase.json");
        const cacheKey = `project_brief:${JSON.stringify(args)}`;
        const cached = getCachedResponse(manifestPath, cacheKey);
        if (cached !== undefined) {
          return respond(req.id, cached);
        }
        const manifest = await loadOrScanManifest(root, true);
        const slim = args.slim as boolean | undefined;

        // Estimate manifest size and auto-slim if it would blow the context budget
        const manifestTokens = estimateJsonTokens(manifest);
        const grade = gradeTokenBudget(manifestTokens, { a: 2000, b: 4000, c: 8000 });
        const shouldAutoSlim = !slim && grade === "D";

        const brief =
          slim || shouldAutoSlim ? generateSlimBrief(manifest) : generateBrief(manifest);

        // Append token budget info so the AI knows context pressure
        const budgetNote = `\n\n---\n_manifest: ${manifestTokens.toLocaleString()} tokens (grade ${grade})${shouldAutoSlim ? " — auto-slimmed to fit context" : ""}_`;

        const briefResult = { content: [{ type: "text", text: brief + budgetNote }] };
        setCachedResponse(cacheKey, briefResult);
        return respond(req.id, briefResult);
      }

      case "get_codebase": {
        const manifestPath = join(root, ".codebase.json");
        const cacheKey = `get_codebase:${JSON.stringify(args)}`;
        const cached = getCachedResponse(manifestPath, cacheKey);
        if (cached !== undefined) {
          return respond(req.id, cached);
        }
        const manifest = await loadOrScanManifest(root);
        const category = args.category as string | undefined;
        const fields = args.fields as string[] | undefined;
        let getCodebaseResult: { content: Array<{ type: string; text: string }> };
        if (category) {
          const data = (manifest as unknown as Record<string, unknown>)[category];
          if (fields?.length && data && typeof data === "object" && data !== null) {
            const sparse: Record<string, unknown> = {};
            for (const f of fields) {
              sparse[f] = (data as Record<string, unknown>)[f];
            }
            getCodebaseResult = {
              content: [{ type: "text", text: JSON.stringify(sparse, null, 2) }],
            };
          } else {
            getCodebaseResult = {
              content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }],
            };
          }
        } else {
          getCodebaseResult = {
            content: [{ type: "text", text: JSON.stringify(manifest, null, 2) }],
          };
        }
        setCachedResponse(cacheKey, getCodebaseResult);
        return respond(req.id, getCodebaseResult);
      }

      case "query_codebase": {
        const manifestPath = join(root, ".codebase.json");
        const cacheKey = `query_codebase:${JSON.stringify(args)}`;
        const cached = getCachedResponse(manifestPath, cacheKey);
        if (cached !== undefined) {
          return respond(req.id, cached);
        }
        const manifest = await loadOrScanManifest(root);
        const path = args.path as string;
        const fields = args.fields as string[] | undefined;
        let value = queryPath(manifest as unknown as Record<string, unknown>, path);
        if (
          fields?.length &&
          value !== null &&
          value !== undefined &&
          typeof value === "object" &&
          !Array.isArray(value)
        ) {
          const sparse: Record<string, unknown> = {};
          for (const f of fields) {
            sparse[f] = (value as Record<string, unknown>)[f];
          }
          value = sparse;
        }
        const queryResult = {
          content: [{ type: "text", text: JSON.stringify(value ?? null, null, 2) }],
        };
        setCachedResponse(cacheKey, queryResult);
        return respond(req.id, queryResult);
      }

      case "get_next_task": {
        const manifest = await loadOrScanManifest(root, true);
        const result = getNextTask(manifest);
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      }

      case "get_blockers": {
        const manifest = await loadOrScanManifest(root, true);
        const result = getBlockers(manifest);
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      }

      case "create_issue": {
        const result = await ghCreateIssue(root, args);
        await invalidateManifest(root);
        return respond(req.id, {
          content: [{ type: "text", text: result }],
        });
      }

      case "close_issue": {
        const result = await ghCloseIssue(root, args);
        await invalidateManifest(root);
        return respond(req.id, {
          content: [{ type: "text", text: result }],
        });
      }

      case "comment_issue": {
        const result = await ghCommentIssue(root, args);
        return respond(req.id, {
          content: [{ type: "text", text: result }],
        });
      }

      case "update_issue": {
        const result = await ghUpdateIssue(root, args);
        await invalidateManifest(root);
        return respond(req.id, {
          content: [{ type: "text", text: result }],
        });
      }

      case "link_commits_to_issue": {
        const result = await ghLinkCommits(root, args);
        return respond(req.id, {
          content: [{ type: "text", text: result }],
        });
      }

      case "get_prompt_history": {
        const result = getPromptHistory(root, args);
        return respond(req.id, {
          content: [{ type: "text", text: result }],
        });
      }

      case "list_commands": {
        const manifestPath = join(root, ".codebase.json");
        const cacheKey = `list_commands:{}`;
        const cachedCmd = getCachedResponse(manifestPath, cacheKey);
        if (cachedCmd !== undefined) {
          return respond(req.id, cachedCmd);
        }
        const projectCommandsDir = join(root, ".claude", "commands");
        const globalCommandsDir = join(homedir(), ".claude", "commands");

        const seenNames = new Set<string>();
        const allFiles: string[] = [];

        for (const dir of [projectCommandsDir, globalCommandsDir]) {
          if (existsSync(dir)) {
            for (const f of readdirSync(dir)) {
              if (f.endsWith(".md") && !seenNames.has(f)) {
                seenNames.add(f);
                allFiles.push(f);
              }
            }
          }
        }

        let listCommandsResult: { content: Array<{ type: string; text: string }> };
        if (allFiles.length === 0) {
          listCommandsResult = {
            content: [{ type: "text", text: "No slash commands installed. Run: codebase setup" }],
          };
        } else {
          const names = allFiles.map((f) => "/" + f.replace(/\.md$/, "")).join(", ");
          listCommandsResult = {
            content: [
              {
                type: "text",
                text: `Installed commands (${allFiles.length}): ${names}\n\nLoop: /simulate → /build → /launch`,
              },
            ],
          };
        }
        setCachedResponse(cacheKey, listCommandsResult);
        return respond(req.id, listCommandsResult);
      }

      case "list_skills": {
        const manifestPathSkills = join(root, ".codebase.json");
        const cacheKeySkills = `list_skills:{}`;
        const cachedSkills = getCachedResponse(manifestPathSkills, cacheKeySkills);
        if (cachedSkills !== undefined) {
          return respond(req.id, cachedSkills);
        }
        const globalSkillsDir = join(homedir(), ".claude", "skills");
        const projectSkillsDir = join(root, ".claude", "skills");

        const seenFiles = new Set<string>();
        const skillFiles: Array<{ file: string; dir: string }> = [];

        // Project-local takes precedence — add first, then global (skip duplicates)
        for (const dir of [projectSkillsDir, globalSkillsDir]) {
          if (existsSync(dir)) {
            for (const f of readdirSync(dir)) {
              if (f.endsWith(".skill") && !seenFiles.has(f)) {
                seenFiles.add(f);
                skillFiles.push({ file: f, dir });
              }
            }
          }
        }

        if (skillFiles.length === 0) {
          return respond(req.id, {
            content: [
              {
                type: "text",
                text: "No skills installed in ~/.claude/skills/ or <project>/.claude/skills/. Run: codebase setup",
              },
            ],
          });
        }

        const skills: Array<{ name: string; description: string; file: string }> = [];

        await Promise.all(
          skillFiles.map(
            ({ file, dir }) =>
              new Promise<void>((resolveSkill) => {
                const filePath = join(dir, file);
                execFile(
                  "unzip",
                  ["-p", filePath, "*/SKILL.md"],
                  { timeout: 10_000 },
                  (err, stdout) => {
                    if (err || !stdout.trim()) {
                      resolveSkill();
                      return;
                    }
                    // Parse YAML frontmatter between --- markers
                    const match = stdout.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                    if (!match) {
                      resolveSkill();
                      return;
                    }
                    const frontmatter = match[1];
                    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
                    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
                    const name = nameMatch ? nameMatch[1].trim() : file.replace(/\.skill$/, "");
                    const description = descMatch ? descMatch[1].trim() : "";
                    skills.push({ name, description, file });
                    resolveSkill();
                  }
                );
              })
          )
        );

        const skillsResult = { content: [{ type: "text", text: JSON.stringify(skills, null, 2) }] };
        setCachedResponse(cacheKeySkills, skillsResult);
        return respond(req.id, skillsResult);
      }

      case "get_plan": {
        const planPath = join(resolve(root), "PLAN.md");
        if (!existsSync(planPath)) {
          return respond(req.id, {
            content: [{ type: "text", text: "No PLAN.md found. Use update_plan to create one." }],
          });
        }
        const planContent = await readFile(planPath, "utf-8");
        return respond(req.id, {
          content: [{ type: "text", text: planContent }],
        });
      }

      case "update_plan": {
        const planPath = join(resolve(root), "PLAN.md");
        const message = args.message as string;
        const timestamp = new Date().toISOString().split("T")[0];
        const entry = `\n<!-- updated: ${timestamp} -->\n${message.trim()}\n`;

        let planContent: string;
        if (!existsSync(planPath)) {
          planContent = `# PLAN.md — Autonomous Loop State\n\n> Managed by Claude. Updated each build/simulate cycle.\n\n## Current Sprint\n\n\n## In Flight\n\n\n## Decisions Log\n\n\n## Blocked\n\n\n## Update Log\n${entry}`;
        } else {
          const existing = await readFile(planPath, "utf-8");
          if (existing.includes("## Update Log")) {
            planContent = existing.replace(/(## Update Log\n)/, `$1${entry}`);
          } else {
            planContent = existing + `\n## Update Log\n${entry}`;
          }
        }

        const tmpPath = planPath + ".tmp";
        await writeFile(tmpPath, planContent, "utf-8");
        await rename(tmpPath, planPath);
        return respond(req.id, {
          content: [{ type: "text", text: `PLAN.md updated.` }],
        });
      }

      case "get_issue": {
        const number = args.number as number;
        const raw = await ghExecArgs(root, [
          "issue",
          "view",
          String(number),
          "--json",
          "number,title,state,body,labels,assignees,milestone,comments,url",
        ]);
        const issue = JSON.parse(raw) as unknown;
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
        });
      }

      case "get_pr": {
        const number = args.number as number;
        const raw = await ghExecArgs(root, [
          "pr",
          "view",
          String(number),
          "--json",
          "number,title,state,body,author,labels,reviewRequests,reviewDecision,statusCheckRollup,additions,deletions,comments,url",
        ]);
        const pr = JSON.parse(raw) as unknown;
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(pr, null, 2) }],
        });
      }

      case "rescan_project": {
        const syncGh = args.sync !== false;
        const manifest = await scan(root, {
          quiet: true,
          sync: syncGh,
          incremental: args.incremental === true,
        });
        const manifestPath = join(root, ".codebase.json");
        const tmpPath = manifestPath + ".tmp";
        // Atomic write: write to temp file first, then rename to avoid torn reads
        await writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf-8");
        await rename(tmpPath, manifestPath);
        return respond(req.id, {
          content: [
            {
              type: "text",
              text: `Project rescanned. Manifest updated at ${manifest.generated_at}`,
            },
          ],
        });
      }

      case "refresh_status": {
        const manifestPath = join(root, ".codebase.json");
        const ghData = await syncGitHub(root);
        if (ghData) {
          const content = await readFile(manifestPath, "utf-8");
          const manifest = JSON.parse(content) as Manifest;
          manifest.status = ghData.status;
          manifest.roadmap = ghData.roadmap;
          manifest.decisions = ghData.decisions;
          const merged = manifest;
          merged.generated_at = new Date().toISOString();
          const tmpPath = manifestPath + ".tmp";
          await writeFile(tmpPath, JSON.stringify(merged, null, 2), "utf-8");
          await rename(tmpPath, manifestPath);
        }
        return respond(req.id, {
          content: [{ type: "text", text: `GitHub data refreshed at ${new Date().toISOString()}` }],
        });
      }

      case "generate_handoff": {
        const { runHandoff } = await import("../commands/handoff.js");
        await runHandoff({
          command: "handoff",
          subcommand: "",
          positionals: [],
          path: root,
          message: (args.message as string) || "",
          quiet: true,
          slim: false,
          categories: [],
          depth: 4,
          format: "text",
          verbose: false,
          incremental: false,
          force: false,
          port: 3000,
          tools: [],
          dryRun: false,
          since: "",
          sync: false,
          reason: "",
          examples: false,
          helpCommand: false,
          model: "",
          provider: "",
        });
        return respond(req.id, {
          content: [{ type: "text", text: "HANDOFF.md generated in project root." }],
        });
      }

      case "token_budget": {
        const manifestPathBudget = join(root, ".codebase.json");
        const cacheKeyBudget = `token_budget:{}`;
        const cachedBudget = getCachedResponse(manifestPathBudget, cacheKeyBudget);
        if (cachedBudget !== undefined) {
          return respond(req.id, cachedBudget);
        }
        const manifest = await loadOrScanManifest(root);
        const totalTokens = estimateJsonTokens(manifest);
        const grade = gradeTokenBudget(totalTokens, { a: 2000, b: 4000, c: 8000 });

        // Per-category breakdown
        const categories = [
          "project",
          "repo",
          "structure",
          "stack",
          "commands",
          "dependencies",
          "config",
          "git",
          "quality",
          "patterns",
          "status",
          "roadmap",
          "decisions",
        ];
        const breakdown: Record<string, number> = {};
        for (const cat of categories) {
          const data = (manifest as unknown as Record<string, unknown>)[cat];
          if (data) {
            breakdown[cat] = estimateJsonTokens(data);
          }
        }

        const recommendations: string[] = [];
        if (grade === "D") {
          recommendations.push("Use `project_brief` with `slim: true` to reduce context");
          recommendations.push(
            "Consider calling `get_codebase` with specific `category` and `fields` instead of full brief"
          );
        }
        if (grade === "C") {
          recommendations.push(
            "Manifest is getting large — prefer targeted queries over full reads"
          );
        }
        const sorted = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
        if (sorted.length > 0) {
          recommendations.push(
            `Largest sections: ${sorted
              .slice(0, 3)
              .map(([k, v]) => `${k} (${v.toLocaleString()} tokens)`)
              .join(", ")}`
          );
        }

        const budgetResult = {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total_tokens: totalTokens,
                  grade,
                  breakdown,
                  recommendations: recommendations.length > 0 ? recommendations : undefined,
                },
                null,
                2
              ),
            },
          ],
        };
        setCachedResponse(cacheKeyBudget, budgetResult);
        return respond(req.id, budgetResult);
      }

      case "get_impact_radius": {
        const { loadGraph, getImpactRadius } = await import("../graph/index.js");
        const graph = await loadGraph(root);
        if (!graph) {
          return respond(req.id, {
            content: [{ type: "text", text: "No graph found. Run: codebase graph build" }],
            isError: true,
          });
        }
        let files = (args.files as string[] | undefined) ?? [];
        if (!files.length && args.pr) {
          const raw = await ghExecArgs(root, [
            "pr",
            "view",
            String(args.pr as number),
            "--json",
            "files",
          ]);
          const data = JSON.parse(raw) as { files: Array<{ path: string }> };
          files = data.files.map((f) => f.path);
        }
        const hops = (args.hops as number | undefined) ?? 2;
        const result = getImpactRadius(graph, files, hops);
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      }

      case "get_review_context": {
        const { loadGraph, getImpactRadius } = await import("../graph/index.js");
        const { estimateTokens } = await import("../utils/tokens.js");
        const { readFile: readFileFn } = await import("node:fs/promises");
        const graph = await loadGraph(root);
        if (!graph) {
          return respond(req.id, {
            content: [{ type: "text", text: "No graph found. Run: codebase graph build" }],
            isError: true,
          });
        }
        let files = (args.files as string[] | undefined) ?? [];
        if (!files.length && args.pr) {
          const raw = await ghExecArgs(root, [
            "pr",
            "view",
            String(args.pr as number),
            "--json",
            "files",
          ]);
          const data = JSON.parse(raw) as { files: Array<{ path: string }> };
          files = data.files.map((f) => f.path);
        }
        const tokenBudget = (args.token_budget as number | undefined) ?? 20_000;
        const impact = getImpactRadius(graph, files, 1);
        const candidates = [
          ...files.map((f) => ({ path: f, reason: "changed" })),
          ...impact.direct_callers.map((f) => ({ path: f, reason: "direct caller" })),
          ...impact.covering_tests.map((f) => ({ path: f, reason: "covering test" })),
        ];
        const result: Array<{ path: string; reason: string; bytes: number }> = [];
        let totalTokens = 0;
        for (const c of candidates) {
          try {
            const content = await readFileFn(join(root, c.path), "utf-8");
            const tokens = estimateTokens(content);
            if (totalTokens + tokens > tokenBudget) {
              break;
            }
            result.push({ path: c.path, reason: c.reason, bytes: content.length });
            totalTokens += tokens;
          } catch {
            /* file not readable — skip */
          }
        }
        return respond(req.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify({ files: result, total_tokens: totalTokens, impact }, null, 2),
            },
          ],
        });
      }

      case "query_graph": {
        const { loadGraph, getCallers, getCallees, querySymbol, getEntrypoints, getCoveringTests } =
          await import("../graph/index.js");
        const graph = await loadGraph(root);
        if (!graph) {
          return respond(req.id, {
            content: [{ type: "text", text: "No graph found. Run: codebase graph build" }],
            isError: true,
          });
        }
        const kind = args.kind as string;
        const file = args.file as string | undefined;
        const symbol = args.symbol as string | undefined;
        let queryResult: unknown;
        switch (kind) {
          case "callers":
            queryResult = getCallers(graph, file ?? "");
            break;
          case "callees":
            queryResult = getCallees(graph, file ?? "");
            break;
          case "symbol":
            queryResult = querySymbol(graph, symbol ?? "");
            break;
          case "entrypoints":
            queryResult = getEntrypoints(graph);
            break;
          case "tests":
            queryResult = getCoveringTests(graph, file ? [file] : []);
            break;
          default:
            return respond(req.id, {
              content: [
                {
                  type: "text",
                  text: `Unknown query kind: ${kind}. Use: callers | callees | symbol | entrypoints | tests`,
                },
              ],
              isError: true,
            });
        }
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(queryResult, null, 2) }],
        });
      }

      case "get_dead_code": {
        const { loadGraph, getDeadCode } = await import("../graph/index.js");
        const graph = await loadGraph(root);
        if (!graph) {
          return respond(req.id, {
            content: [{ type: "text", text: "No graph found. Run: codebase graph build" }],
            isError: true,
          });
        }
        const result = getDeadCode(graph, root);
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      }

      case "get_cycles": {
        const { loadGraph, getCycles } = await import("../graph/index.js");
        const graph = await loadGraph(root);
        if (!graph) {
          return respond(req.id, {
            content: [{ type: "text", text: "No graph found. Run: codebase graph build" }],
            isError: true,
          });
        }
        const result = getCycles(graph);
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      }

      case "get_orphans": {
        const { loadGraph, getOrphans } = await import("../graph/index.js");
        const graph = await loadGraph(root);
        if (!graph) {
          return respond(req.id, {
            content: [{ type: "text", text: "No graph found. Run: codebase graph build" }],
            isError: true,
          });
        }
        const result = getOrphans(graph, root);
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      }

      case "rebuild_graph": {
        const { buildGraph, updateGraph, saveGraph } = await import("../graph/index.js");
        const incremental = args.incremental === true;
        const start = Date.now();
        const graph = incremental
          ? await updateGraph(root)
          : await (async () => {
              const g = await buildGraph(root);
              await saveGraph(root, g);
              return g;
            })();
        const ms = Date.now() - start;
        return respond(req.id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  nodes: graph.nodes.length,
                  edges: graph.edges.length,
                  built_at: graph.built_at,
                  ms,
                  incremental,
                },
                null,
                2
              ),
            },
          ],
        });
      }

      default:
        return {
          jsonrpc: "2.0",
          id: req.id,
          error: { code: -32602, message: `Unknown tool: ${toolName}` },
        };
    }
  } catch (err) {
    return respond(req.id, {
      content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
      isError: true,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

const _rawTtlHours = Number(process.env.CODEBASE_MANIFEST_TTL_HOURS);
const MANIFEST_TTL_MS =
  (Number.isFinite(_rawTtlHours) && _rawTtlHours > 0 ? _rawTtlHours : 24) * 60 * 60 * 1000;

async function loadOrScanManifest(root: string, withSync = false): Promise<Manifest> {
  try {
    const content = await readFile(join(root, ".codebase.json"), "utf-8");
    const manifest = JSON.parse(content) as Manifest;
    // Serve cached manifest only if it is fresh enough
    if (manifest.generated_at) {
      const age = Date.now() - new Date(manifest.generated_at).getTime();
      if (age <= MANIFEST_TTL_MS) {
        return manifest;
      }
    }
    // Manifest is stale — rescan silently
    return (await scan(root, { quiet: true, sync: withSync })) as Manifest;
  } catch {
    return (await scan(root, { quiet: true, sync: withSync })) as Manifest;
  }
}

function getNextTask(manifest: Manifest): Record<string, unknown> {
  const allOpen = (manifest.status?.issues || []).filter((i) => i.state === "open");
  const priorities = manifest.status?.priorities?.length
    ? manifest.status.priorities
    : rankIssues(allOpen);

  if (!priorities.length) {
    return {
      summary:
        "No open issues found. The project has no tracked tasks. You can create issues with the create_issue tool when you identify work to do.",
      task: null,
      queue: [],
    };
  }

  const top = priorities[0];
  const queue = priorities.slice(1, 4).map((i) => ({
    number: i.number,
    title: i.title,
    labels: i.labels,
  }));

  const summaryParts = [`NEXT TASK: #${top.number} — ${top.title}`];
  if (top.labels.length) {
    summaryParts.push(`[${top.labels.join(", ")}]`);
  }
  if (top.assignee) {
    summaryParts.push(`(assigned to @${top.assignee})`);
  }
  if (top.mapped_files?.length) {
    summaryParts.push(`Start in: ${top.mapped_files.join(", ")}`);
  }

  const effortLabel = top.effort
    ? { S: "Small (hours)", M: "Medium (days)", L: "Large (weeks)" }[top.effort]
    : undefined;

  if (effortLabel) {
    summaryParts.push(`Effort: ${effortLabel}`);
  }

  // Surface needs_verify queue so AI knows what's pending simulation
  const needsVerify = (manifest.status?.kanban?.needs_verify ?? []).map((i) => ({
    number: i.number,
    title: i.title,
  }));

  return {
    summary: summaryParts.join(" "),
    task: {
      number: top.number,
      title: top.title,
      labels: top.labels,
      effort: top.effort,
      assignee: top.assignee,
      mapped_files: top.mapped_files || [],
      url: top.url,
      body: top.body || "",
    },
    queue,
    needs_verify: needsVerify,
  };
}

function getBlockers(manifest: Manifest): Record<string, unknown> {
  const blocked = (manifest.status?.issues || []).filter(
    (i) =>
      i.state === "open" &&
      i.labels.some(
        (l) => l.toLowerCase().includes("blocked") || l.toLowerCase().includes("blocker")
      )
  );

  const waitingReview = (manifest.status?.pull_requests || []).filter(
    (pr) => pr.state === "open" && pr.reviewers.length > 0 && pr.review_decision !== "approved"
  );

  const failingChecks = (manifest.status?.pull_requests || []).filter(
    (pr) => pr.state === "open" && pr.checks_status === "failing"
  );

  const withConflicts = (manifest.status?.pull_requests || []).filter(
    (pr) => pr.state === "open" && pr.merge_conflicts === true
  );

  const uncommittedChanges = manifest.git?.uncommitted_changes ?? false;
  const hasBlockers =
    blocked.length > 0 ||
    waitingReview.length > 0 ||
    failingChecks.length > 0 ||
    withConflicts.length > 0 ||
    uncommittedChanges;

  const summaryParts: string[] = [];
  if (!hasBlockers) {
    summaryParts.push("No blockers found. All clear to proceed with the next task.");
  } else {
    if (blocked.length) {
      summaryParts.push(`${blocked.length} blocked issue(s)`);
    }
    if (waitingReview.length) {
      summaryParts.push(`${waitingReview.length} PR(s) awaiting review`);
    }
    if (failingChecks.length) {
      summaryParts.push(`${failingChecks.length} PR(s) with failing checks`);
    }
    if (withConflicts.length) {
      summaryParts.push(`${withConflicts.length} PR(s) with merge conflicts`);
    }
    if (uncommittedChanges) {
      summaryParts.push("uncommitted changes in working directory");
    }
  }

  return {
    summary: summaryParts.join(", "),
    has_blockers: hasBlockers,
    blocked_issues: blocked.map((i) => ({
      number: i.number,
      title: i.title,
      labels: i.labels,
      url: i.url,
    })),
    prs_waiting_review: waitingReview.map((pr) => ({
      number: pr.number,
      title: pr.title,
      reviewers: pr.reviewers,
      url: pr.url,
    })),
    prs_failing_checks: failingChecks.map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
    })),
    prs_with_conflicts: withConflicts.map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
    })),
    uncommitted_changes: uncommittedChanges,
  };
}

function ghExecArgs(cwd: string, args: string[]): Promise<string> {
  return retry(
    () =>
      new Promise<string>((resolve, reject) => {
        execFile("gh", args, { cwd, timeout: 30_000 }, (err, stdout, stderr) => {
          if (err) {
            reject(new Error(stderr || err.message));
          } else {
            resolve(stdout.trim());
          }
        });
      }),
    {
      maxAttempts: 2,
      baseDelayMs: 1000,
      retryable: (err) => isTransientError(err),
    }
  );
}

async function ghCreateIssue(root: string, args: Record<string, unknown>): Promise<string> {
  const title = args.title as string;
  const body = (args.body as string) || title;
  const labels = args.labels as string[] | undefined;

  const ghArgs = ["issue", "create", "--title", title, "--body", body];
  if (labels?.length) {
    const safeLabels = labels.filter((l) => !l.includes(","));
    if (safeLabels.length) {
      ghArgs.push("--label", safeLabels.join(","));
    }
  }

  const url = await ghExecArgs(root, ghArgs);
  return `Issue created: ${url}`;
}

async function detectBranch(root: string): Promise<string | undefined> {
  try {
    const out = await ghPlainExec(root, "git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

function ghPlainExec(root: string, cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: root, timeout: 15_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.toString());
      }
    });
  });
}

async function ghCloseIssue(root: string, args: Record<string, unknown>): Promise<string> {
  const number = args.number as number;
  const comment = args.comment as string | undefined;
  const reason = args.reason as string | undefined;
  const evidence = args.evidence as string | undefined;
  const commits = args.commits as string[] | undefined;

  if (typeof number !== "number" || Number.isNaN(number)) {
    throw new Error("close_issue: 'number' is required");
  }
  if (!comment || !comment.trim()) {
    throw new Error(
      "close_issue: 'comment' is required — never close an issue silently. Provide a one-line summary of what was done."
    );
  }
  const validReasons = new Set(["fixed", "wont-fix", "duplicate", "not-reproducible", "obsolete"]);
  if (!reason || !validReasons.has(reason)) {
    throw new Error(
      "close_issue: 'reason' is required and must be one of: fixed, wont-fix, duplicate, not-reproducible, obsolete"
    );
  }

  const branch = await detectBranch(root);
  const promptId = getPromptIdCached(root, process.env.CLAUDE_SESSION_ID);
  const input: StructuredCloseInput = {
    number,
    reason: reason as StructuredCloseInput["reason"],
    comment,
    evidence,
    commits,
    branch,
    promptId,
  };
  const body = buildCloseBody(input);
  // Close FIRST, comment SECOND. Worst-case failure mode is "issue closed
  // without a comment" — recoverable via comment_issue. The reverse order
  // ("comment posted lying about a close that never happened") leaves a
  // permanent inconsistency in the GitHub timeline.
  await ghExecArgs(root, ["issue", "close", String(number)]);
  await ghExecArgs(root, ["issue", "comment", String(number), "--body", body]);
  return `Issue #${number} closed (${reason}). Comment posted with evidence${commits?.length ? ` and ${commits.length} commit(s)` : ""}.\n\n${body}`;
}

async function ghCommentIssue(root: string, args: Record<string, unknown>): Promise<string> {
  const number = args.number as number;
  const body = args.body as string | undefined;
  const kind = args.kind as string | undefined;

  if (typeof number !== "number" || Number.isNaN(number)) {
    throw new Error("comment_issue: 'number' is required");
  }
  if (!body || !body.trim()) {
    throw new Error("comment_issue: 'body' is required");
  }
  if (!kind || !isCommentKind(kind)) {
    throw new Error(
      "comment_issue: 'kind' must be one of: status, evidence, decision, close-reason, note"
    );
  }

  const branch = await detectBranch(root);
  const promptId = getPromptIdCached(root, process.env.CLAUDE_SESSION_ID);
  const fullBody = withTraceFooter(body, { kind, branch, promptId });
  const url = await ghExecArgs(root, ["issue", "comment", String(number), "--body", fullBody]);
  return `Comment (${kind}) posted to #${number}${url ? ` — ${url}` : ""}.`;
}

async function ghUpdateIssue(root: string, args: Record<string, unknown>): Promise<string> {
  const number = args.number as number;
  const addLabels = args.add_labels as string[] | undefined;
  const removeLabels = args.remove_labels as string[] | undefined;
  const assignee = args.assignee as string | undefined;
  const comment = args.comment as string | undefined;

  const updates: string[] = [];

  if (addLabels?.length) {
    await ghExecArgs(root, ["issue", "edit", String(number), "--add-label", addLabels.join(",")]);
    updates.push(`added labels: ${addLabels.join(", ")}`);
  }

  if (removeLabels?.length) {
    await ghExecArgs(root, [
      "issue",
      "edit",
      String(number),
      "--remove-label",
      removeLabels.join(","),
    ]);
    updates.push(`removed labels: ${removeLabels.join(", ")}`);
  }

  if (assignee !== undefined) {
    if (assignee === "") {
      // Fetch current assignees so we know who to remove
      const raw = await ghExecArgs(root, ["issue", "view", String(number), "--json", "assignees"]);
      const { assignees } = JSON.parse(raw) as { assignees: Array<{ login: string }> };
      for (const a of assignees) {
        await ghExecArgs(root, ["issue", "edit", String(number), "--remove-assignee", a.login]);
      }
      updates.push("unassigned all assignees");
    } else {
      await ghExecArgs(root, ["issue", "edit", String(number), "--add-assignee", assignee]);
      updates.push(`assigned to @${assignee}`);
    }
  }

  if (comment && comment.trim()) {
    const branch = await detectBranch(root);
    const promptId = getPromptIdCached(root, process.env.CLAUDE_SESSION_ID);
    const body = withTraceFooter(comment, { kind: "status", branch, promptId });
    await ghExecArgs(root, ["issue", "comment", String(number), "--body", body]);
    updates.push("posted status comment");
  }

  if (updates.length === 0) {
    return `Issue #${number}: no changes requested.`;
  }
  return `Issue #${number} updated: ${updates.join("; ")}.`;
}

/**
 * Allowlist for `git log` revision/range arguments accepted from MCP callers.
 * Anything that doesn't match is refused — `since` is then passed positionally
 * after a `--` separator so it can never be interpreted as a flag.
 *
 * Accepted shapes:
 *   - ISO date / partial:           2026-05-04            2026-05-04T12:00:00Z
 *   - Relative:                     7.days.ago            2.weeks.ago           1.year.ago
 *   - SHA (7–40 hex):               a1b2c3d               a1b2c3d4e5...
 *   - HEAD~N / HEAD^N / HEAD..ref:  HEAD~5 HEAD^2  main..HEAD  origin/main..HEAD
 */
const SINCE_ALLOWLIST =
  /^(?:\d{4}-\d{2}-\d{2}(?:[T ][\d:Z+\-]{1,15})?|\d{1,5}\.(?:second|minute|hour|day|week|month|year)s?\.ago|[0-9a-fA-F]{7,40}|HEAD(?:~\d{1,4}|\^\d{0,4})?|[A-Za-z0-9._/-]{1,80}\.\.[A-Za-z0-9._/-]{1,80})$/;

async function ghLinkCommits(root: string, args: Record<string, unknown>): Promise<string> {
  const number = args.number as number;
  if (typeof number !== "number" || Number.isNaN(number)) {
    throw new Error("link_commits_to_issue: 'number' is required");
  }
  const sinceRaw = args.since as string | undefined;
  if (sinceRaw !== undefined && !SINCE_ALLOWLIST.test(sinceRaw)) {
    throw new Error(
      "link_commits_to_issue: 'since' must be an ISO date, relative window (e.g. 7.days.ago), commit SHA, or revision range (e.g. main..HEAD)"
    );
  }
  const since = sinceRaw ?? "";
  // Coerce limit to a bounded positive int so it can never become a flag.
  const rawLimit = args.limit;
  const limit = Math.max(1, Math.min(500, typeof rawLimit === "number" ? rawLimit : 50));

  const range = since || `-n ${limit}`;
  const gitArgs = ["log", `--max-count=${limit}`, "--pretty=format:%H%x09%s", "--date=iso"];
  if (since) {
    // SINCE_ALLOWLIST above guarantees `since` cannot start with `-`, so we can
    // safely place it on the command line. Two cases:
    //   1. ISO date / relative window — use `--since=<value>` (positional dates
    //      like "2020-01-01" are ambiguous to git when no commit/branch by that
    //      name exists; --since= is unambiguous and always treats the value as
    //      a date expression).
    //   2. Revision (SHA / HEAD~N / range) — pass positionally.
    // DO NOT use a leading `--` separator: in `git log` it forces the rest to
    // be a pathspec, which silently produces an empty result.
    const isDateLike =
      /^(?:\d{4}-\d{2}-\d{2}(?:[T ][\d:Z+\-]{1,15})?|\d{1,5}\.(?:second|minute|hour|day|week|month|year)s?\.ago)$/.test(
        since
      );
    if (isDateLike) {
      gitArgs.push(`--since=${since}`);
    } else {
      gitArgs.push(since);
    }
  }

  const out = await ghPlainExec(root, "git", gitArgs);
  const lines = out.split("\n").filter(Boolean);
  const matcher = new RegExp(`(?:^|\\W)#${number}\\b|(?:Refs|Closes|Fixes)\\s+#${number}\\b`, "i");

  // gh log gives us "<sha>\t<subject>". We only have the subject, but most repos
  // mention the issue in the subject or trailer. For trailers we'd need %B, but
  // that breaks the simple split — keep the subject-only filter and document.
  const matched: Array<{ sha: string; subject: string }> = [];
  for (const line of lines) {
    const tab = line.indexOf("\t");
    if (tab < 0) {
      continue;
    }
    const sha = line.slice(0, tab);
    const subject = line.slice(tab + 1);
    if (matcher.test(subject)) {
      matched.push({ sha: sha.slice(0, 12), subject });
    }
  }

  if (matched.length === 0) {
    return `link_commits_to_issue: scanned ${lines.length} commits in range '${range}', none reference #${number}. Nothing posted.`;
  }

  const branch = await detectBranch(root);
  const promptId = getPromptIdCached(root, process.env.CLAUDE_SESSION_ID);
  const bodyLines = [
    `**Commits referencing #${number}**`,
    "",
    ...matched.map((c) => `- \`${c.sha}\` ${c.subject}`),
  ];
  const body = withTraceFooter(bodyLines.join("\n"), { kind: "evidence", branch, promptId });
  await ghExecArgs(root, ["issue", "comment", String(number), "--body", body]);
  return `Linked ${matched.length} commit(s) to #${number}.`;
}

function getPromptHistory(root: string, args: Record<string, unknown>): string {
  const issue = args.issue as number | undefined;
  const branch = args.branch as string | undefined;
  const sinceArg = args.since as string | undefined;
  const limit = (args.limit as number | undefined) ?? 20;

  const filter: Parameters<typeof readPrompts>[1] = { limit };
  if (typeof issue === "number") {
    filter.issue = issue;
  }
  if (branch) {
    filter.branch = branch;
  }
  if (sinceArg) {
    const parsed = parseSince(sinceArg);
    if (parsed) {
      filter.since = parsed;
    }
  }
  const records = readPrompts(root, filter);
  if (records.length === 0) {
    return "No prompts captured. (Hook may not be installed — run: codebase setup)";
  }
  return JSON.stringify(records, null, 2);
}

async function invalidateManifest(root: string): Promise<void> {
  try {
    const manifestPath = join(root, ".codebase.json");
    const content = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as Manifest;
    manifest.generated_at = "1970-01-01T00:00:00.000Z";
    const tmpPath = manifestPath + ".tmp";
    await writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf-8");
    await rename(tmpPath, manifestPath);
  } catch {
    // If manifest doesn't exist yet, nothing to invalidate
  }
}

function respond(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function writeResponse(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}
