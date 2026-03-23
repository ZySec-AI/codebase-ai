import { createInterface } from "node:readline";
import { readFile, writeFile, rename } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { queryPath } from "../utils/json-path.js";
import { scan } from "../scanner/engine.js";
import { generateBrief } from "./brief.js";
import { rankIssues, syncGitHub } from "../github/sync.js";
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
      "Get codebase data by category with optional sparse field selection. Use the 'fields' array to request only specific fields (e.g. fields: ['languages', 'frameworks'] from category: 'stack'). For single dot-path lookups use query_codebase instead.",
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
      "Query a specific field using dot-path notation. Handles both targeted dot-path queries (e.g. 'stack.languages') and full category reads (e.g. 'stack'). Examples: 'stack.languages', 'commands.test', 'status.kanban.in_progress', 'roadmap.milestones'.",
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

  {
    name: "update_issue",
    description:
      "Update a GitHub issue — add/remove labels, set assignee. Use this to advance issues through the pipeline (e.g., add 'status:in-progress', remove 'status:backlog').",
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
      },
      required: ["number"],
    },
  },

  // ─── Commands ──────────────────────────────────────────────────
  {
    name: "list_commands",
    description:
      "List installed Claude Code slash commands in this project. Returns names of available commands (e.g. /setup, /simulate, /build, /launch, /review).",
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
        const fields = args.fields as string[] | undefined;
        if (category) {
          const data = (manifest as unknown as Record<string, unknown>)[category];
          if (fields?.length && data && typeof data === "object" && data !== null) {
            const sparse: Record<string, unknown> = {};
            for (const f of fields) {
              sparse[f] = (data as Record<string, unknown>)[f];
            }
            return respond(req.id, {
              content: [{ type: "text", text: JSON.stringify(sparse, null, 2) }],
            });
          }
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
        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(value ?? null, null, 2) }],
        });
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

      case "update_issue": {
        const result = await ghUpdateIssue(root, args);
        await invalidateManifest(root);
        return respond(req.id, {
          content: [{ type: "text", text: result }],
        });
      }

      case "list_commands": {
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

        if (allFiles.length === 0) {
          return respond(req.id, {
            content: [{ type: "text", text: "No slash commands installed. Run: codebase setup" }],
          });
        }

        const names = allFiles.map((f) => "/" + f.replace(/\.md$/, "")).join(", ");
        return respond(req.id, {
          content: [
            {
              type: "text",
              text: `Installed commands (${allFiles.length}): ${names}\n\nLoop: /simulate → /build → /launch`,
            },
          ],
        });
      }

      case "list_skills": {
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

        return respond(req.id, {
          content: [{ type: "text", text: JSON.stringify(skills, null, 2) }],
        });
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
    const safeLabels = labels.filter((l) => !l.includes(","));
    if (safeLabels.length) {
      ghArgs.push("--label", safeLabels.join(","));
    }
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

async function ghUpdateIssue(root: string, args: Record<string, unknown>): Promise<string> {
  const number = args.number as number;
  const addLabels = args.add_labels as string[] | undefined;
  const removeLabels = args.remove_labels as string[] | undefined;
  const assignee = args.assignee as string | undefined;

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

  if (updates.length === 0) {
    return `Issue #${number}: no changes requested.`;
  }
  return `Issue #${number} updated: ${updates.join("; ")}.`;
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
