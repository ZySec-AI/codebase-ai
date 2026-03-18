import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CLIOptions } from "../types.js";
import { log, success, warn, error, heading, info } from "../utils/output.js";

export async function runRelease(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);
  const dryRun = options.dryRun;
  const versionOverride = options.positionals[0] ?? null;

  // Legacy: codebase release generate
  if (options.subcommand === "generate") {
    await generateReleaseNotes(root, options);
    return;
  }

  heading(`codebase release${dryRun ? " (dry run)" : ""}`);

  // ── Prerequisites ─────────────────────────────────────────────
  const ghOk = await checkGhAuth();
  if (!ghOk) {
    error("gh CLI not authenticated. Run: gh auth login");
    process.exit(1);
  }
  const hasRemote = await execGitStr(root, "git remote get-url origin 2>/dev/null");
  if (!hasRemote) {
    error("No git remote. Run: git remote add origin <url>");
    process.exit(1);
  }

  // ── Gate 1a: No critical/high bugs ───────────────────────────
  log("\nChecking launch gates...");
  const [critical, high] = await Promise.all([
    countIssues(root, ["bug", "critical"]),
    countIssues(root, ["bug", "high"]),
  ]);
  if (critical > 0 || high > 0) {
    error("Gate 1a FAILED — open blocking bugs:");
    if (critical > 0) log(`  Critical: ${critical}`);
    if (high > 0) log(`  High:     ${high}`);
    log("\n  Fix: run /simulate, or close with wontfix label");
    process.exit(1);
  }
  success("Gate 1a — no critical/high bugs");

  // ── Gate 1b: Test suite ───────────────────────────────────────
  const testCmd = detectTestCmd(root);
  if (testCmd) {
    const testResult = await runTestSuite(root, testCmd);
    if (!testResult.ok) {
      error("Gate 1b FAILED — test suite has failures");
      log(testResult.output.split("\n").slice(-10).join("\n"));
      log("\n  Fix: run /review to repair failing tests");
      process.exit(1);
    }
    success(`Gate 1b — tests pass (${testCmd})`);
  } else {
    warn("Gate 1b — no test runner detected (skipping)");
  }

  // ── Gate 1c: World-class score ≥ 7.0 ─────────────────────────
  const wcScore = await getWorldClassScore(root);
  if (wcScore !== null && wcScore < 7.0) {
    error(`Gate 1c FAILED — world-class score ${wcScore}/10 (minimum 7.0)`);
    log("  Fix: run /simulate to improve UX score");
    process.exit(1);
  }
  if (wcScore !== null) success(`Gate 1c — world-class score ${wcScore}/10`);
  else warn("Gate 1c — no simulation data yet (run /simulate first)");

  // ── Gate 2: Carry bugs (warning only) ────────────────────────
  const carry = await countIssues(root, ["carry"]);
  if (carry > 0) warn(`Gate 2  — ${carry} carry bug(s) will appear in release notes`);
  else success("Gate 2  — no carry bugs");

  // ── Gate 3: Branch clean and current ─────────────────────────
  const dirty = await execGitStr(root, "git status --short");
  if (dirty) {
    error("Gate 3 FAILED — uncommitted changes");
    log(dirty);
    process.exit(1);
  }
  await execGitStr(root, "git fetch origin develop 2>/dev/null || true");
  const behind = await execGitStr(root, "git log HEAD..origin/develop --oneline 2>/dev/null");
  if (behind) {
    error("Gate 3 FAILED — branch is behind origin/develop");
    log("  Fix: git pull origin develop");
    process.exit(1);
  }
  success("Gate 3  — branch clean and current");

  // ── Gate 4: GTM docs (warning — doesn't block release) ───────
  const requiredDocs = ["docs/SALES-PLAY.md", "docs/PRODUCT-BROCHURE.md", "docs/PRODUCT-DOCS.md"];
  const missingDocs = requiredDocs.filter(d => !existsSync(join(root, d)));
  if (missingDocs.length > 0) {
    warn("Gate 4  — GTM docs missing (run /pitch to generate):");
    missingDocs.forEach(d => warn(`  ${d}`));
  } else {
    success("Gate 4  — GTM docs present");
  }

  log("\nAll gates passed.");

  // ── Version ───────────────────────────────────────────────────
  const version = versionOverride ?? await nextVersion(root);
  log(`\nRelease version: ${version}`);

  // ── Release notes ─────────────────────────────────────────────
  const notes = await buildReleaseNotes(root, version, carry);

  if (dryRun) {
    log("\n--- DRY RUN — release notes preview ---");
    log(notes);
    log("--- DRY RUN — no tag, no merge, no GitHub release created ---");
    return;
  }

  // ── Tag ───────────────────────────────────────────────────────
  await gitRun(root, ["tag", "-a", version, "-m", `Release ${version}`]);
  await gitRun(root, ["push", "origin", version]);
  success(`Tagged ${version}`);

  // ── Merge develop → main ──────────────────────────────────────
  await gitRun(root, ["checkout", "main"]);
  await gitRun(root, ["pull", "origin", "main"]);
  await gitRun(root, ["merge", "develop", "--no-ff", "-m", `Release ${version}`]);
  await gitRun(root, ["push", "origin", "main"]);
  await gitRun(root, ["checkout", "develop"]);
  success("Merged develop → main");

  // ── GitHub release ────────────────────────────────────────────
  const { ok: releaseOk, stdout: releaseUrl } = await ghRun(root, [
    "release", "create", version,
    "--title", version,
    "--notes", notes,
    "--target", "develop",
  ]);
  if (releaseOk) success(`GitHub release: ${releaseUrl}`);
  else warn("Could not create GitHub release — tag and merge succeeded");

  // ── Milestone rotation ────────────────────────────────────────
  await rotateMilestone(root);

  log(`\ncodebase release ${version} complete.`);
  log("develop → main merged. Tag pushed. Ready.");
}

// ─── Release gate helpers ────────────────────────────────────────

function execGitStr(root: string, cmd: string): Promise<string> {
  return new Promise(resolve => {
    execFile("sh", ["-c", cmd], { cwd: root, timeout: 30_000 }, (err, stdout) => {
      resolve(err ? "" : stdout.trim());
    });
  });
}

function gitRun(root: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: root, timeout: 30_000 }, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

function ghRun(root: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  return new Promise(resolve => {
    execFile("gh", args, { cwd: root, timeout: 30_000 }, (err, stdout) => {
      resolve({ ok: !err, stdout: (stdout || "").trim() });
    });
  });
}

async function checkGhAuth(): Promise<boolean> {
  return new Promise(resolve => {
    execFile("gh", ["auth", "status"], { timeout: 5_000 }, err => resolve(!err));
  });
}

async function countIssues(root: string, labels: string[]): Promise<number> {
  const { stdout } = await ghRun(root, [
    "issue", "list", "--label", labels.join(","),
    "--state", "open", "--limit", "100",
    "--json", "number", "--jq", "length",
  ]);
  return parseInt(stdout, 10) || 0;
}

function detectTestCmd(root: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
    if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) return "npx vitest run";
    if (pkg.devDependencies?.jest || pkg.dependencies?.jest) return "npx jest";
    if (pkg.scripts?.test) return "npm test";
  } catch { /* ignore */ }
  if (existsSync(join(root, "pyproject.toml"))) {
    try {
      if (readFileSync(join(root, "pyproject.toml"), "utf-8").includes("pytest")) return "uv run pytest";
    } catch { /* ignore */ }
  }
  return null;
}

function runTestSuite(root: string, cmd: string): Promise<{ ok: boolean; output: string }> {
  return new Promise(resolve => {
    execFile("sh", ["-c", cmd], { cwd: root, timeout: 120_000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: stdout + stderr });
    });
  });
}

async function getWorldClassScore(root: string): Promise<number | null> {
  const { stdout } = await ghRun(root, [
    "issue", "list", "--label", "cycle",
    "--state", "all", "--limit", "1",
    "--json", "body", "--jq", ".[0].body // empty",
  ]);
  if (!stdout) return null;
  const match = stdout.match(/[Ww]orld[- ]class[^0-9]*([0-9]+(?:\.[0-9]+)?)\/10/);
  return match ? parseFloat(match[1]) : null;
}

async function nextVersion(root: string): Promise<string> {
  const latest = await execGitStr(root, "git describe --tags --abbrev=0 2>/dev/null");
  if (!latest) return "v0.1.0";
  const m = latest.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return "v0.1.0";
  return `v${m[1]}.${m[2]}.${parseInt(m[3], 10) + 1}`;
}

async function buildReleaseNotes(root: string, version: string, carryCount: number): Promise<string> {
  const date = new Date().toISOString().split("T")[0];
  const [arch, bugs, openCarry, openArch] = await Promise.all([
    ghRun(root, ["issue", "list", "--label", "arch", "--state", "closed",
      "--limit", "50", "--json", "number,title", "--jq", '.[] | "- #\(.number) \(.title)"']),
    ghRun(root, ["issue", "list", "--label", "bug,sim", "--state", "closed",
      "--limit", "50", "--json", "number,title", "--jq", '.[] | "- #\(.number) \(.title)"']),
    ghRun(root, ["issue", "list", "--label", "carry", "--state", "open",
      "--limit", "20", "--json", "number,title", "--jq", '.[] | "- #\(.number) \(.title)"']),
    ghRun(root, ["issue", "list", "--label", "arch", "--state", "open",
      "--limit", "20", "--json", "number,title", "--jq", '.[] | "- #\(.number) \(.title)"']),
  ]);

  let notes = `# Release ${version} — ${date}\n\n`;
  if (arch.stdout)      notes += `## What's New\n\n${arch.stdout}\n\n`;
  if (bugs.stdout)      notes += `## Bug Fixes\n\n${bugs.stdout}\n\n`;
  if (openCarry.stdout || openArch.stdout) {
    notes += `## Known Issues\n\n`;
    if (openCarry.stdout) notes += `### Carry Bugs (${carryCount})\n${openCarry.stdout}\n\n`;
    if (openArch.stdout)  notes += `### Pending Architecture\n${openArch.stdout}\n\n`;
  }
  return notes;
}

async function rotateMilestone(root: string): Promise<void> {
  const envPath = join(root, ".vibekit", "milestone.env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  const numMatch = content.match(/MILESTONE_NUMBER=(\d+)/);
  const titleMatch = content.match(/MILESTONE_TITLE=(v[\d.]+)/);
  if (!numMatch || !titleMatch) return;

  const { stdout: repo } = await ghRun(root, ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  if (!repo) return;

  await ghRun(root, ["api", `repos/${repo}/milestones/${numMatch[1]}`, "-X", "PATCH", "-f", "state=closed"]);
  info(`Milestone ${titleMatch[1]} closed`);

  const m = titleMatch[1].match(/^v(\d+)\.(\d+)$/);
  if (!m) return;
  const nextTitle = `v${m[1]}.${parseInt(m[2], 10) + 1}`;
  const { stdout: newMs } = await ghRun(root, [
    "api", `repos/${repo}/milestones`, "-X", "POST",
    "-f", `title=${nextTitle}`, "-f", "state=open",
    "-f", "description=Next release cycle — managed by vibekit",
    "--jq", ".number",
  ]);
  if (newMs) {
    writeFileSync(envPath, `MILESTONE_NUMBER=${newMs}\nMILESTONE_TITLE=${nextTitle}\n`, "utf-8");
    success(`Next milestone created: ${nextTitle}`);
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
