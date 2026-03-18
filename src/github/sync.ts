import { execFile } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  StatusData, RoadmapData, DecisionsData,
  IssueData, PullRequestData, KanbanView, MilestoneData, DecisionEntry, ReleaseData, ProjectBoardData,
} from "../types.js";
import { fetchGitHubGraphQLData, checkGraphQLSupport } from "./graphql.js";

interface GitHubData {
  status: StatusData;
  roadmap: RoadmapData;
  decisions: DecisionsData;
}

export async function syncGitHub(root: string): Promise<GitHubData | null> {
  // Check if `gh` CLI is available
  const ghAvailable = await ghExec(root, ["--version"]);
  if (!ghAvailable) return null;

  // Check if repo has a GitHub remote — if not, github_available should be false
  const remoteUrl = await shellExec(root, "git remote get-url origin 2>/dev/null");
  const hasGitHubRemote = !!remoteUrl && (
    remoteUrl.includes("github.com") || remoteUrl.includes("github.")
  );

  if (!hasGitHubRemote) {
    return {
      status: {
        synced_at: new Date().toISOString(),
        github_available: false,
        issues: [],
        pull_requests: [],
        kanban: { backlog: [], in_progress: [], done: [] },
        priorities: [],
      },
      roadmap: { milestones: [] },
      decisions: { from_prs: [], from_adrs: [], manual: [] },
    };
  }

  // Try GraphQL first, fall back to REST API
  const hasGraphQL = await checkGraphQLSupport(root);
  let issues: IssueData[] = [];
  let prs: PullRequestData[] = [];
  let milestones: MilestoneData[] = [];
  let releases: ReleaseData[] = [];
  let projectBoards: ProjectBoardData[] = [];

  if (hasGraphQL) {
    try {
      const graphqlData = await fetchGitHubGraphQLData(root, remoteUrl, {
        includeIssues: true,
        includePRs: true,
        includeMilestones: true,
        includeReleases: true,
        includeProjects: true,
        limit: 50,
      });

      issues = (graphqlData.issues || []) as IssueData[];
      prs = (graphqlData.pull_requests || []) as PullRequestData[];
      milestones = (graphqlData.milestones || []) as unknown as MilestoneData[];
      releases = (graphqlData.releases || []) as ReleaseData[];
      projectBoards = (graphqlData.project_boards || []) as ProjectBoardData[];
    } catch {
      // GraphQL failed, fall back to REST
    }
  }

  // Fallback to REST API if GraphQL didn't return data
  if (issues.length === 0) {
    issues = await fetchIssues(root);
  }
  if (prs.length === 0) {
    prs = await fetchPullRequests(root);
  }
  if (milestones.length === 0) {
    milestones = await fetchMilestones(root);
  }

  const [decisionPRs] = await Promise.all([
    fetchDecisionPRs(root),
  ]);

  const kanban = buildKanban(issues);
  const priorities = buildPriorities(issues);
  const adrDecisions = findADRFiles(root);

  return {
    status: {
      synced_at: new Date().toISOString(),
      github_available: true,
      issues,
      pull_requests: prs,
      kanban,
      priorities,
      releases,
      project_boards: projectBoards,
    },
    roadmap: {
      milestones,
    },
    decisions: {
      from_prs: decisionPRs,
      from_adrs: adrDecisions,
      manual: [],
    },
  };
}

// ─── GitHub CLI wrapper ──────────────────────────────────────────

function ghExec(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile("gh", args, { cwd, timeout: 30_000 }, (err, stdout) => {
      resolve(err ? "" : stdout.trim());
    });
  });
}

function shellExec(cwd: string, cmd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("sh", ["-c", cmd], { cwd, timeout: 10_000 }, (err, stdout) => {
      resolve(err ? "" : stdout.trim());
    });
  });
}

// ─── Issues ──────────────────────────────────────────────────────

async function fetchIssues(root: string): Promise<IssueData[]> {
  const output = await ghExec(root, [
    "issue", "list", "--limit", "50", "--state", "all",
    "--json", "number,title,state,labels,assignees,milestone,createdAt,updatedAt",
  ]);
  if (!output) return [];

  try {
    const raw = JSON.parse(output) as Array<Record<string, unknown>>;
    return raw.map(parseIssue);
  } catch {
    return [];
  }
}

export function parseIssue(raw: Record<string, unknown>): IssueData {
  const labels = (raw.labels as Array<{ name: string }>) || [];
  const assignees = (raw.assignees as Array<{ login: string }>) || [];
  const milestone = raw.milestone as { title: string } | null;

  return {
    number: raw.number as number,
    title: raw.title as string,
    state: (raw.state as string)?.toLowerCase() === "open" ? "open" : "closed",
    labels: labels.map(l => l.name),
    assignee: assignees[0]?.login || null,
    milestone: milestone?.title || null,
    created_at: raw.createdAt as string,
    updated_at: raw.updatedAt as string,
  };
}

// ─── Pull Requests ───────────────────────────────────────────────

async function fetchPullRequests(root: string): Promise<PullRequestData[]> {
  const output = await ghExec(root, [
    "pr", "list", "--limit", "30", "--state", "all",
    "--json", "number,title,state,author,headRefName,labels,reviewRequests,createdAt,updatedAt",
  ]);
  if (!output) return [];

  try {
    const raw = JSON.parse(output) as Array<Record<string, unknown>>;
    return raw.map(parsePR);
  } catch {
    return [];
  }
}

export function parsePR(raw: Record<string, unknown>): PullRequestData {
  const labels = (raw.labels as Array<{ name: string }>) || [];
  const reviewRequests = (raw.reviewRequests as Array<{ login?: string; name?: string }>) || [];
  const author = raw.author as { login: string } | null;

  return {
    number: raw.number as number,
    title: raw.title as string,
    state: ((raw.state as string) || "open").toLowerCase() as "open" | "closed" | "merged",
    author: author?.login || "unknown",
    branch: (raw.headRefName as string) || "",
    labels: labels.map(l => l.name),
    reviewers: reviewRequests.map(r => r.login || r.name || "").filter(Boolean),
    created_at: raw.createdAt as string,
    updated_at: raw.updatedAt as string,
  };
}

// ─── Milestones ──────────────────────────────────────────────────

async function fetchMilestones(root: string): Promise<MilestoneData[]> {
  const output = await ghExec(root, [
    "api", "repos/{owner}/{repo}/milestones",
    "--jq", ".[] | {title,description,due_on,open_issues,closed_issues}",
  ]);
  if (!output) return [];

  try {
    const lines = output.split("\n").filter(Boolean);
    return lines.map(line => {
      const m = JSON.parse(line);
      const open = m.open_issues || 0;
      const closed = m.closed_issues || 0;
      const total = open + closed;
      return {
        title: m.title,
        description: m.description || "",
        due_date: m.due_on || null,
        progress: {
          open,
          closed,
          percent: total > 0 ? Math.round((closed / total) * 100) : 0,
        },
        issues: [],
      };
    });
  } catch {
    return [];
  }
}

// ─── Decisions from PRs ──────────────────────────────────────────

async function fetchDecisionPRs(root: string): Promise<DecisionEntry[]> {
  const output = await ghExec(root, [
    "pr", "list", "--limit", "20", "--state", "merged",
    "--json", "number,title,body,mergedAt,url",
  ]);
  if (!output) return [];

  try {
    const raw = JSON.parse(output) as Array<Record<string, unknown>>;
    return raw
      .filter(pr => {
        const body = (pr.body as string) || "";
        // Look for decision markers in PR body
        return body.toLowerCase().includes("decision") ||
               body.toLowerCase().includes("why:") ||
               body.toLowerCase().includes("rationale") ||
               body.toLowerCase().includes("chose") ||
               body.toLowerCase().includes("trade-off");
      })
      .map(pr => ({
        title: pr.title as string,
        summary: extractDecisionSummary((pr.body as string) || ""),
        date: pr.mergedAt as string,
        source: `PR #${pr.number}`,
        url: pr.url as string,
      }));
  } catch {
    return [];
  }
}

function extractDecisionSummary(body: string): string {
  // Try to extract a summary from the PR body
  const lines = body.split("\n").filter(l => l.trim());

  // Look for "## Decision" or "## Why" sections
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^#+\s*(decision|why|rationale)/i)) {
      const summary = lines.slice(i + 1, i + 4).join(" ").trim();
      return summary.slice(0, 200);
    }
  }

  // Fallback: first meaningful paragraph
  return lines[0]?.slice(0, 200) || "";
}

// ─── ADR Files ───────────────────────────────────────────────────

function findADRFiles(root: string): DecisionEntry[] {
  const adrDirs = [
    "docs/adr", "docs/decisions", "adr", "decisions",
    "docs/architecture/decisions",
  ];

  const adrFiles: string[] = [];

  for (const dir of adrDirs) {
    const fullPath = join(root, dir);
    if (!existsSync(fullPath)) continue;
    try {
      const files = readdirSync(fullPath)
        .filter(f => f.endsWith(".md"))
        .map(f => join(dir, f));
      adrFiles.push(...files);
    } catch { /* permission errors, etc */ }
  }

  const entries: DecisionEntry[] = [];
  for (const file of adrFiles.slice(0, 20)) {
    try {
      const content = readFileSync(join(root, file), "utf-8");
      const firstLines = content.split("\n").slice(0, 5);
      const title = firstLines.find(l => l.startsWith("#"))?.replace(/^#+\s*/, "") || file;
      entries.push({
        title,
        summary: "",
        date: "",
        source: file,
      });
    } catch { /* skip unreadable files */ }
  }

  return entries;
}

// ─── View Builders ───────────────────────────────────────────────

function buildKanban(issues: IssueData[]): KanbanView {
  const open = issues.filter(i => i.state === "open");
  const closed = issues.filter(i => i.state === "closed");

  // In-progress: assigned or has "in progress" label
  const inProgress = open.filter(i =>
    i.assignee || i.labels.some(l =>
      l.toLowerCase().includes("progress") || l.toLowerCase().includes("doing")
    )
  );

  // Backlog: open but not in-progress
  const backlog = open.filter(i => !inProgress.includes(i));

  return {
    backlog,
    in_progress: inProgress,
    done: closed.slice(0, 20),
  };
}

function buildPriorities(issues: IssueData[]): IssueData[] {
  const open = issues.filter(i => i.state === "open");

  // Sort by priority labels
  const priorityOrder = (i: IssueData): number => {
    for (const label of i.labels) {
      const l = label.toLowerCase();
      if (l.includes("p0") || l.includes("critical") || l.includes("urgent")) return 0;
      if (l.includes("p1") || l.includes("high")) return 1;
      if (l.includes("p2") || l.includes("medium")) return 2;
      if (l.includes("p3") || l.includes("low")) return 3;
      if (l.includes("bug")) return 1;
      if (l.includes("feature")) return 2;
    }
    return 4;
  };

  return [...open].sort((a, b) => priorityOrder(a) - priorityOrder(b));
}
