import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { queryPath } from "../utils/json-path.js";
import { scan } from "../scanner/engine.js";
import { generateBrief } from "./brief.js";
import type { Manifest } from "../types.js";

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
      properties: {},
    },
  },

  // ─── Context Queries ───────────────────────────────────────────
  {
    name: "get_codebase",
    description:
      "Get structured project data. Use 'category' to get a specific section: repo, structure, stack, commands, dependencies, config, git, quality, patterns, status, roadmap, decisions. Without category returns everything.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string" as const,
          description:
            "Section to retrieve: repo, structure, stack, commands, dependencies, config, git, quality, patterns, status, roadmap, decisions",
        },
      },
    },
  },
  {
    name: "query_codebase",
    description:
      "Query a specific field using dot-path notation. Examples: 'stack.languages', 'commands.test', 'status.kanban.in_progress', 'roadmap.milestones'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string" as const,
          description:
            "Dot-path query, e.g. 'stack.languages', 'commands.test', 'status.priorities'",
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
      "Get all current blockers — issues labeled as blocked, PRs waiting for review, and dependency issues. Shows what's preventing progress.",
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
    description: "Close a GitHub issue after fixing it. Add a comment explaining what was done.",
    inputSchema: {
      type: "object" as const,
      properties: {
        number: { type: "number" as const, description: "Issue number to close" },
        comment: { type: "string" as const, description: "Comment explaining resolution" },
      },
      required: ["number"],
    },
  },

  // ─── Commands ──────────────────────────────────────────────────
  {
    name: "list_commands",
    description:
      "List installed Claude Code slash commands in this project. Returns names and descriptions of available /setup, /simulate, /build, /launch, /review commands.",
    inputSchema: {
      type: "object" as const,
      properties: {},
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
          description: "Also refresh GitHub data (issues, PRs, milestones). Default: false.",
        },
      },
    },
  },
];

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
        serverInfo: { name: "codebase", version: "0.1.0" },
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

  try {
    switch (toolName) {
      case "project_brief": {
        const manifest = await loadOrScanManifest(root, true);
        const brief = generateBrief(manifest);
        return respond(req.id, {
          content: [{ type: "text", text: brief }],
        });
      }

      case "get_codebase": {
        const manifest = await loadOrScanManifest(root);
        const category = args.category as string | undefined;
        if (category) {
          const data = (manifest as Record<string, unknown>)[category];
          return respond(req.id, {
            content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }],
          });
        }
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(manifest, null, 2) }],
        });
      }

      case "query_codebase": {
        const manifest = await loadOrScanManifest(root);
        const path = args.path as string;
        const value = queryPath(manifest as Record<string, unknown>, path);
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(value ?? null, null, 2) }],
        });
      }

      case "get_next_task": {
        const manifest = await loadOrScanManifest(root, true);
        const next = getNextTask(manifest);
        return respond(req.id, {
          content: [{ type: "text", text: next }],
        });
      }

      case "get_blockers": {
        const manifest = await loadOrScanManifest(root, true);
        const blockers = getBlockers(manifest);
        return respond(req.id, {
          content: [{ type: "text", text: blockers }],
        });
      }

      case "create_issue": {
        const result = await ghCreateIssue(root, args);
        return respond(req.id, {
          content: [{ type: "text", text: result }],
        });
      }

      case "close_issue": {
        const result = await ghCloseIssue(root, args);
        return respond(req.id, {
          content: [{ type: "text", text: result }],
        });
      }

      case "list_commands": {
        const commandsDir = join(root, ".claude", "commands");
        if (!existsSync(commandsDir)) {
          return respond(req.id, {
            content: [{ type: "text", text: "No slash commands installed. Run: codebase setup" }],
          });
        }
        const files = readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
        const names = files.map((f) => "/" + f.replace(/\.md$/, "")).join(", ");
        return respond(req.id, {
          content: [
            {
              type: "text",
              text: `Installed commands (${files.length}): ${names}\n\nLoop: /simulate → /build → /launch`,
            },
          ],
        });
      }

      case "rescan_project": {
        const syncGh = args.sync === true;
        const manifest = await scan(root, { quiet: true, sync: syncGh });
        await writeFile(join(root, ".codebase.json"), JSON.stringify(manifest, null, 2), "utf-8");
        return respond(req.id, {
          content: [
            {
              type: "text",
              text: `Project rescanned. Manifest updated at ${manifest.generated_at}`,
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

async function loadOrScanManifest(root: string, withSync = false): Promise<Manifest> {
  try {
    const content = await readFile(join(root, ".codebase.json"), "utf-8");
    return JSON.parse(content);
  } catch {
    return (await scan(root, { quiet: true, sync: withSync })) as Manifest;
  }
}

function getNextTask(manifest: Manifest): string {
  if (!manifest.status?.priorities?.length) {
    return "No open issues found. The project has no tracked tasks. You can create issues with the create_issue tool when you identify work to do.";
  }

  const top = manifest.status.priorities[0];
  const labels = top.labels.length ? ` [${top.labels.join(", ")}]` : "";
  const assignee = top.assignee ? ` (assigned to @${top.assignee})` : "";
  const mapped = top.mapped_files?.length ? `\nStart in: ${top.mapped_files.join(", ")}` : "";

  let result = `NEXT TASK: #${top.number} — ${top.title}${labels}${assignee}${mapped}`;

  // Show 2 more in the queue
  const queue = manifest.status.priorities.slice(1, 4);
  if (queue.length) {
    result += "\n\nUp next in queue:";
    for (const issue of queue) {
      result += `\n  #${issue.number} ${issue.title} [${issue.labels.join(", ") || "no labels"}]`;
    }
  }

  return result;
}

function getBlockers(manifest: Manifest): string {
  const lines: string[] = [];

  if (manifest.status?.issues) {
    const blocked = manifest.status.issues.filter(
      (i) =>
        i.state === "open" &&
        i.labels.some(
          (l) => l.toLowerCase().includes("blocked") || l.toLowerCase().includes("blocker")
        )
    );

    if (blocked.length) {
      lines.push("BLOCKED ISSUES:");
      for (const i of blocked) {
        lines.push(`  #${i.number} ${i.title} [${i.labels.join(", ")}]`);
      }
    }
  }

  if (manifest.status?.pull_requests) {
    const waitingReview = manifest.status.pull_requests.filter(
      (pr) => pr.state === "open" && pr.reviewers.length > 0
    );

    if (waitingReview.length) {
      lines.push("\nPRs WAITING FOR REVIEW:");
      for (const pr of waitingReview) {
        lines.push(`  #${pr.number} ${pr.title} → reviewers: ${pr.reviewers.join(", ")}`);
      }
    }
  }

  if (manifest.git?.uncommitted_changes) {
    lines.push(
      "\nWARNING: Uncommitted changes detected. Consider committing before starting new work."
    );
  }

  if (lines.length === 0) {
    return "No blockers found. All clear to proceed with the next task.";
  }

  return lines.join("\n");
}

function ghExecArgs(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gh", args, { cwd, timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function ghCreateIssue(root: string, args: Record<string, unknown>): Promise<string> {
  const title = args.title as string;
  const body = (args.body as string) || title;
  const labels = args.labels as string[] | undefined;

  const ghArgs = ["issue", "create", "--title", title, "--body", body];
  if (labels?.length) {
    ghArgs.push("--label", labels.join(","));
  }

  const url = await ghExecArgs(root, ghArgs);
  return `Issue created: ${url}`;
}

async function ghCloseIssue(root: string, args: Record<string, unknown>): Promise<string> {
  const number = args.number as number;
  const comment = args.comment as string | undefined;

  if (comment) {
    await ghExecArgs(root, ["issue", "comment", String(number), "--body", comment]);
  }
  await ghExecArgs(root, ["issue", "close", String(number)]);
  return `Issue #${number} closed.`;
}

function respond(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function writeResponse(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}
