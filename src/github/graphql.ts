import { execFile } from "node:child_process";
import { warn } from "../utils/output.js";
import { safe, MAX_TITLE_LEN, MAX_LABEL_LEN, MAX_LOGIN_LEN } from "../utils/safe.js";

/**
 * GraphQL client for GitHub API using gh CLI
 * Provides proper error handling and fallbacks
 */

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; type?: string }>;
}

interface GraphQLVariables {
  [key: string]: string | number | boolean | null;
}

/**
 * Execute a GraphQL query via gh CLI
 */
async function graphqlQuery<T>(
  cwd: string,
  query: string,
  variables: GraphQLVariables = {}
): Promise<T | null> {
  return new Promise((resolve) => {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-H",
      "Accept: application/vnd.github.v3+json",
    ];

    // Add variables as separate -F flags
    for (const [key, value] of Object.entries(variables)) {
      args.push("-f", `${key}=${JSON.stringify(value)}`);
    }

    execFile("gh", args, { cwd, timeout: 30_000 }, (err, stdout, _stderr) => {
      if (err) {
        // Silently fail - caller should use fallback
        resolve(null);
        return;
      }

      try {
        const response = JSON.parse(stdout.trim()) as GraphQLResponse<T>;

        if (response.errors && response.errors.length > 0) {
          // Log but don't throw - allow fallback
          // console.error('GraphQL errors:', response.errors);
          resolve(null);
          return;
        }

        resolve(response.data || null);
      } catch {
        resolve(null);
      }
    });
  });
}

// ─── Queries ─────────────────────────────────────────────────────────

const ISSUES_QUERY = `
query($owner: String!, $repo: String!, $limit: Int) {
  repository(owner: $owner, name: $repo) {
    issues(first: $limit, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        state
        url
        labels(first: 10) { nodes { name } }
        assignees(first: 1) { nodes { login } }
        milestone { title }
        body
        createdAt
        updatedAt
        comments { totalCount }
        reactions {
          thumbsUp: reactionCount(for: THUMBS_UP)
          thumbsDown: reactionCount(for: THUMBS_DOWN)
          laugh: reactionCount(for: LAUGH)
          hooray: reactionCount(for: HOORAY)
          confused: reactionCount(for: CONFUSED)
          heart: reactionCount(for: HEART)
          rocket: reactionCount(for: ROCKET)
          eyes: reactionCount(for: EYES)
        }
        timelineItems(first: 1) { totalCount }
      }
    }
  }
}
`;

const PULL_REQUESTS_QUERY = `
query($owner: String!, $repo: String!, $limit: Int) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: $limit, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        state
        url
        author { login }
        headRefName
        labels(first: 10) { nodes { name } }
        reviewRequests(first: 5) { nodes { requestedReviewer { ... on User { login } } } }
        createdAt
        updatedAt
        additions
        deletions
        mergeable
        comments { totalCount }
        reviewDecision
        statusCheckRollup {
          state
        }
      }
    }
  }
}
`;

const MILESTONES_QUERY = `
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    milestones(first: 20, orderBy: {field: DUE_DATE, direction: ASC}) {
      nodes {
        title
        description
        dueOn
        issues(first: 100) {
          totalCount
          nodes { number }
        }
        closedIssues: issues(states: CLOSED) { totalCount }
      }
    }
  }
}
`;

const RELEASES_QUERY = `
query($owner: String!, $repo: String!, $limit: Int) {
  repository(owner: $owner, name: $repo) {
    releases(first: $limit, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        tagName
        name
        url
        createdAt
        isPrerelease
        author { login }
      }
    }
  }
}
`;

const PROJECTS_QUERY = `
query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    projectsV2(first: 10) {
      nodes {
        number
        title
        state
        url
        columns: fieldNodes(first: 20) {
          nodes {
            ... on ProjectV2FieldCommon {
              name
            }
            ... on ProjectV2SingleSelectField {
              options {
                name
              }
            }
          }
        }
        items(first: 100) {
          totalCount
        }
      }
    }
  }
}
`;

// ─── Parsers ───────────────────────────────────────────────────────

function parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  // Parse GitHub remote URL to extract owner and repo
  const patterns = [/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/, /github\.com[:/]([^/]+)\/(.+)$/];

  for (const pattern of patterns) {
    const match = remoteUrl.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
    }
  }

  return null;
}

function parseIssueNode(node: Record<string, unknown>): ReturnType<
  typeof import("./sync").parseIssue
> & {
  comments_count?: number;
  reactions?: {
    thumbs_up: number;
    thumbs_down: number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  };
  timeline_events?: number;
  url?: string;
} {
  const labels = (node.labels as { nodes: Array<{ name: string }> })?.nodes || [];
  const assignees = (node.assignees as { nodes: Array<{ login: string }> })?.nodes || [];
  const milestone = node.milestone as { title: string } | null;
  const reactions = (node.reactions as Record<string, number>) || {};
  const comments = node.comments as { totalCount: number } | null;
  const timeline = node.timelineItems as { totalCount: number } | null;

  return {
    number: node.number as number,
    title: safe(node.title as string, MAX_TITLE_LEN),
    state: (node.state as string)?.toLowerCase() === "open" ? "open" : "closed",
    url: (node.url as string) || undefined,
    labels: labels.map((l) => safe(l.name, MAX_LABEL_LEN)).filter(Boolean),
    assignee: safe(assignees[0]?.login, MAX_LOGIN_LEN) || null,
    milestone: milestone?.title || null,
    created_at: node.createdAt as string,
    updated_at: node.updatedAt as string,
    comments_count: comments?.totalCount || 0,
    reactions: {
      thumbs_up: reactions.thumbsUp || 0,
      thumbs_down: reactions.thumbsDown || 0,
      laugh: reactions.laugh || 0,
      hooray: reactions.hooray || 0,
      confused: reactions.confused || 0,
      heart: reactions.heart || 0,
      rocket: reactions.rocket || 0,
      eyes: reactions.eyes || 0,
    },
    timeline_events: timeline?.totalCount || 0,
  };
}

function parsePRNode(node: Record<string, unknown>): ReturnType<typeof import("./sync").parsePR> & {
  checks_status?: "pending" | "passing" | "failing";
  mergeable?: boolean;
  merge_conflicts?: boolean;
  additions?: number;
  deletions?: number;
  comments_count?: number;
  review_decision?: "approved" | "changes_requested" | "review_required" | null;
  url?: string;
} {
  const labels = (node.labels as { nodes: Array<{ name: string }> })?.nodes || [];
  const reviewRequests =
    (node.reviewRequests as { nodes: Array<{ requestedReviewer?: { login?: string } }> })?.nodes ||
    [];
  const author = node.author as { login: string } | null;
  const statusCheck = node.statusCheckRollup as { state: string } | null;
  const comments = node.comments as { totalCount: number } | null;

  let checksStatus: "pending" | "passing" | "failing" | undefined;
  if (statusCheck?.state) {
    const state = statusCheck.state.toLowerCase();
    if (state === "success" || state === "completed") {
      checksStatus = "passing";
    } else if (state === "failure" || state === "error") {
      checksStatus = "failing";
    } else {
      checksStatus = "pending";
    }
  }

  const mergeable = (node.mergeable as string) === "MERGEABLE";
  const mergeConflicts = (node.mergeable as string) === "CONFLICTING";

  return {
    number: node.number as number,
    title: safe(node.title as string, MAX_TITLE_LEN),
    state: ((node.state as string) || "open").toLowerCase() as "open" | "closed" | "merged",
    url: (node.url as string) || undefined,
    author: safe(author?.login, MAX_LOGIN_LEN) || "unknown",
    branch: safe(node.headRefName as string, MAX_TITLE_LEN),
    labels: labels.map((l) => safe(l.name, MAX_LABEL_LEN)).filter(Boolean),
    reviewers: reviewRequests
      .map((r) => safe(r.requestedReviewer?.login, MAX_LOGIN_LEN))
      .filter(Boolean),
    created_at: node.createdAt as string,
    updated_at: node.updatedAt as string,
    checks_status: checksStatus,
    mergeable,
    merge_conflicts: mergeConflicts,
    additions: (node.additions as number) || 0,
    deletions: (node.deletions as number) || 0,
    comments_count: comments?.totalCount || 0,
    review_decision:
      (node.review_decision as string)?.toLowerCase() === "approved"
        ? "approved"
        : (node.review_decision as string)?.toLowerCase() === "changes_requested"
          ? "changes_requested"
          : (node.review_decision as string)?.toLowerCase() === "review_required"
            ? "review_required"
            : null,
  };
}

// ─── Public API ─────────────────────────────────────────────────────

export interface GitHubGraphQLData {
  issues?: ReturnType<typeof parseIssueNode>[];
  pull_requests?: ReturnType<typeof parsePRNode>[];
  milestones?: Array<{
    title: string;
    description: string;
    due_date: string | null;
    progress: { open: number; closed: number; percent: number };
    issues: number[];
  }>;
  releases?: Array<{
    tag_name: string;
    name: string;
    created_at: string;
    url: string;
    author: string;
    prerelease: boolean;
  }>;
  project_boards?: Array<{
    number: number;
    title: string;
    state: "open" | "closed";
    columns: Array<{ name: string; cards_count: number }>;
    url: string;
  }>;
}

/**
 * Fetch comprehensive GitHub data using GraphQL
 * Falls back gracefully if GraphQL fails
 */
export async function fetchGitHubGraphQLData(
  cwd: string,
  remoteUrl: string,
  options: {
    includeIssues?: boolean;
    includePRs?: boolean;
    includeMilestones?: boolean;
    includeReleases?: boolean;
    includeProjects?: boolean;
    limit?: number;
  } = {}
): Promise<GitHubGraphQLData> {
  const {
    includeIssues = true,
    includePRs = true,
    includeMilestones = true,
    includeReleases = true,
    includeProjects = true,
    limit = 50,
  } = options;

  const ownerRepo = parseOwnerRepo(remoteUrl);
  if (!ownerRepo) {
    return {};
  }

  const { owner, repo } = ownerRepo;
  const result: GitHubGraphQLData = {};

  // Run all independent queries in parallel
  const [issueData, prData, milestoneData, releaseData, projectData] = await Promise.all([
    includeIssues
      ? graphqlQuery<{ repository: { issues: { nodes: Record<string, unknown>[] } } }>(
          cwd,
          ISSUES_QUERY,
          { owner, repo, limit }
        ).catch((e: unknown) => {
          warn(`GitHub issues query failed: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        })
      : Promise.resolve(null),
    includePRs
      ? graphqlQuery<{ repository: { pullRequests: { nodes: Record<string, unknown>[] } } }>(
          cwd,
          PULL_REQUESTS_QUERY,
          { owner, repo, limit: Math.min(limit, 30) }
        ).catch((e: unknown) => {
          warn(`GitHub pull requests query failed: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        })
      : Promise.resolve(null),
    includeMilestones
      ? graphqlQuery<{ repository: { milestones: { nodes: Record<string, unknown>[] } } }>(
          cwd,
          MILESTONES_QUERY,
          { owner, repo }
        ).catch((e: unknown) => {
          warn(`GitHub milestones query failed: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        })
      : Promise.resolve(null),
    includeReleases
      ? graphqlQuery<{ repository: { releases: { nodes: Record<string, unknown>[] } } }>(
          cwd,
          RELEASES_QUERY,
          { owner, repo, limit: 10 }
        ).catch((e: unknown) => {
          warn(`GitHub releases query failed: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        })
      : Promise.resolve(null),
    includeProjects
      ? graphqlQuery<{ repository: { projectsV2: { nodes: Record<string, unknown>[] } } }>(
          cwd,
          PROJECTS_QUERY,
          { owner, repo }
        ).catch((e: unknown) => {
          warn(`GitHub projects query failed: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // Process issues
  if (issueData?.repository?.issues?.nodes) {
    result.issues = issueData.repository.issues.nodes.map(parseIssueNode);
  }

  // Process pull requests
  if (prData?.repository?.pullRequests?.nodes) {
    result.pull_requests = prData.repository.pullRequests.nodes.map(parsePRNode);
  }

  // Process milestones
  if (milestoneData?.repository?.milestones?.nodes) {
    result.milestones = milestoneData.repository.milestones.nodes.map((m) => {
      const issues = (m.issues as { nodes: Array<{ number: number }> })?.nodes || [];
      const closed = (m.closedIssues as { totalCount: number })?.totalCount || 0;
      const total = (m.issues as { totalCount: number })?.totalCount || issues.length;
      const open = total - closed;

      return {
        title: m.title as string,
        description: (m.description as string) || "",
        due_date: (m.dueOn as string) || null,
        progress: {
          open,
          closed,
          percent: total > 0 ? Math.round((closed / total) * 100) : 0,
        },
        issues: issues.map((i) => i.number),
      };
    });
  }

  // Process releases
  if (releaseData?.repository?.releases?.nodes) {
    result.releases = releaseData.repository.releases.nodes.map((r) => ({
      tag_name: r.tagName as string,
      name: (r.name as string) || (r.tagName as string),
      created_at: r.createdAt as string,
      url: r.url as string,
      author: (r.author as { login: string })?.login || "unknown",
      prerelease: !!r.isPrerelease,
    }));
  }

  // Process project boards
  if (projectData?.repository?.projectsV2?.nodes) {
    result.project_boards = projectData.repository.projectsV2.nodes
      .filter((p) => p !== null)
      .map((p) => {
        const columns = (p.columns as { nodes: Array<{ name: string }> })?.nodes || [];
        const itemsCount = (p.items as { totalCount: number })?.totalCount || 0;

        return {
          number: p.number as number,
          title: p.title as string,
          state: ((p.state as string) || "open").toLowerCase() as "open" | "closed",
          url: p.url as string,
          columns: columns.map((c) => ({
            name: c.name,
            cards_count: itemsCount, // Approximate - actual per-column count requires more complex query
          })),
        };
      });
  }

  return result;
}

/**
 * Check if gh CLI supports GraphQL (requires gh >= 2.0)
 */
export async function checkGraphQLSupport(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("gh", ["--version"], { cwd, timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }

      const match = stdout.match(/gh version (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        // GraphQL support added in gh 2.0
        resolve(major > 2 || (major === 2 && minor >= 0));
      } else {
        resolve(false);
      }
    });
  });
}
