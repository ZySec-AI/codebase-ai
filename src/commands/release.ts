import { resolve } from "node:path";
import { execFile } from "node:child_process";
import type { CLIOptions } from "../types.js";

export async function runRelease(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const subcommand = options.subcommand || "generate";

  if (subcommand === "generate") {
    await generateReleaseNotes(root, options);
  } else {
    console.error(`Unknown release subcommand: ${subcommand}\nAvailable: generate`);
    process.exit(1);
  }
}

interface ReleaseNoteData {
  version: string;
  previousTag: string | null;
  commits: Commit[];
  categorizedChanges: CategorizedChanges;
  contributors: Map<string, Contributor>;
  linkedIssues: Map<number, string>;
  linkedPullRequests: Map<number, string>;
}

interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  category: CommitCategory;
  issues: number[];
  pullRequest?: number;
}

type CommitCategory = "feat" | "fix" | "docs" | "style" | "refactor" | "perf" | "test" | "chore" | "ci" | "build" | "revert" | "other";

interface CategorizedChanges {
  feat: string[];
  fix: string[];
  docs: string[];
  style: string[];
  refactor: string[];
  perf: string[];
  test: string[];
  chore: string[];
  ci: string[];
  build: string[];
  revert: string[];
  other: string[];
}

interface Contributor {
  name: string;
  commits: number;
  categories: Set<CommitCategory>;
}

async function generateReleaseNotes(root: string, options: CLIOptions): Promise<void> {
  // Get current version/tag info
  const [latestTag, currentBranch] = await Promise.all([
    getLatestTag(root),
    getCurrentBranch(root),
  ]);

  // Get commits since last tag (or last 50 if no tag)
  const range = latestTag ? `${latestTag}..HEAD` : "-50";
  const commits = await getCommits(root, range);

  if (commits.length === 0) {
    console.log("# Release Notes\n\nNo commits found since " + (latestTag || "beginning of time"));
    return;
  }

  // Categorize and analyze commits
  const data = await analyzeCommits(root, commits);

  // Generate markdown
  const notes = formatReleaseNotes(data, latestTag, currentBranch);

  process.stdout.write(notes);
}

async function analyzeCommits(root: string, rawCommits: RawCommit[]): Promise<ReleaseNoteData> {
  const commits: Commit[] = [];
  const contributors = new Map<string, Contributor>();
  const categorizedChanges: CategorizedChanges = {
    feat: [],
    fix: [],
    docs: [],
    style: [],
    refactor: [],
    perf: [],
    test: [],
    chore: [],
    ci: [],
    build: [],
    revert: [],
    other: [],
  };
  const linkedIssues = new Map<number, string>();
  const linkedPullRequests = new Map<number, string>();

  for (const raw of rawCommits) {
    const parsed = parseCommit(raw);
    commits.push(parsed);

    // Track contributors
    if (!contributors.has(parsed.author)) {
      contributors.set(parsed.author, {
        name: parsed.author,
        commits: 0,
        categories: new Set(),
      });
    }
    const contributor = contributors.get(parsed.author)!;
    contributor.commits++;
    contributor.categories.add(parsed.category);

    // Categorize changes
    if (parsed.category !== "other") {
      categorizedChanges[parsed.category].push(parsed.message);
    }

    // Track linked issues
    for (const issue of parsed.issues) {
      if (!linkedIssues.has(issue)) {
        linkedIssues.set(issue, parsed.message);
      }
    }

    // Track PRs
    if (parsed.pullRequest) {
      linkedPullRequests.set(parsed.pullRequest, parsed.message);
    }
  }

  return {
    version: "unreleased",
    previousTag: await getLatestTag(root),
    commits,
    categorizedChanges,
    contributors,
    linkedIssues,
    linkedPullRequests,
  };
}

function parseCommit(raw: RawCommit): Commit {
  const { hash, shortHash, message, author, date } = raw;

  // Parse conventional commit format
  const conventionalMatch = message.match(/^(\w+)(?:\(([^)]+)\))?!?: (.+)/);
  let category: CommitCategory = "other";
  let cleanMessage = message;

  if (conventionalMatch) {
    const [, type, scope, description] = conventionalMatch;
    category = parseCommitType(type);
    cleanMessage = scope ? `${scope}: ${description}` : description;
  }

  // Extract issue references
  const issuePattern = /#(\d+)/g;
  const issues: number[] = [];
  let match;
  while ((match = issuePattern.exec(message)) !== null) {
    issues.push(parseInt(match[1], 10));
  }

  // Extract PR number from merge commits
  const prMatch = message.match(/Merge pull request #(\d+)/);
  const pullRequest = prMatch ? parseInt(prMatch[1], 10) : undefined;

  return {
    hash,
    shortHash,
    message: cleanMessage,
    author,
    date,
    category,
    issues,
    pullRequest,
  };
}

function parseCommitType(type: string): CommitCategory {
  const validTypes: CommitCategory[] = [
    "feat", "fix", "docs", "style", "refactor", "perf", "test", "chore", "ci", "build", "revert"
  ];
  if (validTypes.includes(type as CommitCategory)) {
    return type as CommitCategory;
  }
  return "other";
}

function formatReleaseNotes(data: ReleaseNoteData, previousTag: string | null, currentBranch: string): string {
  const { categorizedChanges, contributors, linkedIssues, linkedPullRequests, commits } = data;
  const date = new Date().toISOString().split("T")[0];
  const version = data.previousTag ? `${data.previousTag}...HEAD` : "Initial Release";

  let output = "";

  // Header
  output += `# Release Notes (${date})\n\n`;
  output += `**Version:** ${version}\n`;
  output += `**Branch:** \`${currentBranch}\`\n`;
  output += `**Commits:** ${commits.length}\n\n`;

  // Summary
  const changeCounts = Object.entries(categorizedChanges)
    .filter(([_, changes]) => changes.length > 0)
    .map(([type, changes]) => `${changes.length} ${type}`)
    .join(", ");

  if (changeCounts) {
    output += `## Summary\n\n`;
    output += `${commits.length} commits: ${changeCounts}\n\n`;
  }

  // Categorized changes
  const categoryTitles: Record<CommitCategory, string> = {
    feat: "✨ Features",
    fix: "🐛 Bug Fixes",
    docs: "📝 Documentation",
    style: "💄 Styles",
    refactor: "♻️ Code Refactoring",
    perf: "⚡ Performance Improvements",
    test: "🧪 Tests",
    chore: "🔧 Maintenance",
    ci: "👷 Continuous Integration",
    build: "📦 Build",
    revert: "⏪ Reverts",
    other: "🔀 Other Changes",
  };

  for (const [type, changes] of Object.entries(categorizedChanges)) {
    if (changes.length === 0) continue;

    output += `## ${categoryTitles[type as CommitCategory]}\n\n`;
    changes.forEach((change: string) => {
      output += `- ${change}\n`;
    });
    output += "\n";
  }

  // Linked issues
  if (linkedIssues.size > 0) {
    output += `## Linked Issues\n\n`;
    for (const [issue, message] of linkedIssues) {
      output += `- #${issue}: ${message}\n`;
    }
    output += "\n";
  }

  // Merged PRs
  if (linkedPullRequests.size > 0) {
    output += `## Merged Pull Requests\n\n`;
    for (const [pr, message] of linkedPullRequests) {
      output += `- #${pr}: ${message}\n`;
    }
    output += "\n";
  }

  // Contributors
  if (contributors.size > 0) {
    output += `## Contributors\n\n`;
    const sortedContributors = Array.from(contributors.entries())
      .sort((a, b) => b[1].commits - a[1].commits);

    for (const [name, contributor] of sortedContributors) {
      const categories = Array.from(contributor.categories)
        .filter(c => c !== "other")
        .join(", ");
      output += `- **${name}** (${contributor.commits} commits`;
      if (categories) {
        output += `, ${categories}`;
      }
      output += ")\n";
    }
    output += "\n";
  }

  // Full commit list
  output += `## Full Commit List\n\n`;
  commits.forEach(commit => {
    const icon = getCategoryIcon(commit.category);
    output += `${icon} ${commit.shortHash} ${commit.message} (${commit.author})\n`;
  });

  return output;
}

function getCategoryIcon(category: CommitCategory): string {
  const icons: Record<CommitCategory, string> = {
    feat: "✨",
    fix: "🐛",
    docs: "📝",
    style: "💄",
    refactor: "♻️",
    perf: "⚡",
    test: "🧪",
    chore: "🔧",
    ci: "👷",
    build: "📦",
    revert: "⏪",
    other: "🔀",
  };
  return icons[category] || "•";
}

// Git helpers

interface RawCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

async function execGit(root: string, cmd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("sh", ["-c", cmd], { cwd: root, timeout: 10_000 }, (err, stdout) => {
      resolve(err ? "" : stdout.trim());
    });
  });
}

async function getLatestTag(root: string): Promise<string | null> {
  const tag = await execGit(root, "git describe --tags --abbrev=0 2>/dev/null");
  return tag || null;
}

async function getCurrentBranch(root: string): Promise<string> {
  const branch = await execGit(root, "git rev-parse --abbrev-ref HEAD 2>/dev/null");
  return branch || "unknown";
}

async function getCommits(root: string, range: string): Promise<RawCommit[]> {
  const format = "%H|%h|%s|%an|%ai";
  const output = await execGit(root, `git log ${range} --format="${format}" 2>/dev/null`);

  if (!output) return [];

  return output.split("\n").map(line => {
    const [hash, shortHash, message, author, date] = line.split("|");
    return { hash, shortHash, message, author, date };
  });
}
