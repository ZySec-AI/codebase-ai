import { resolve } from "node:path";
import { execFile } from "node:child_process";
import type { CLIOptions } from "../types.js";

export async function runPr(options: CLIOptions): Promise<void> {
  const root = resolve(options.path);

  // Check if we're in a git repo
  const isRepo = await execGit(root, "git rev-parse --is-inside-work-tree 2>/dev/null");
  if (!isRepo) {
    console.error("Not a git repository. PR templates can only be generated in git repos.");
    process.exit(1);
  }

  const subcommand = options.subcommand || "template";

  if (subcommand === "template") {
    await generatePrTemplate(root, options);
  } else {
    console.error(`Unknown PR subcommand: ${subcommand}\nAvailable: template`);
    process.exit(1);
  }
}

async function generatePrTemplate(root: string, options: CLIOptions): Promise<void> {
  // Gather all data in parallel
  const [
    currentBranch,
    defaultBranch,
    recentCommits,
    changedFiles,
    issueReferences,
    author,
  ] = await Promise.all([
    getCurrentBranch(root),
    getDefaultBranch(root),
    getRecentCommits(root),
    getChangedFiles(root),
    getIssueReferences(root),
    getGitAuthor(root),
  ]);

  // Categorize changes
  const categorized = categorizeFiles(changedFiles);

  // Generate PR title suggestion
  const title = generateTitle(currentBranch, recentCommits, issueReferences);

  // Generate the template
  const template = formatPrTemplate({
    title,
    currentBranch,
    baseBranch: defaultBranch || "main",
    author,
    commits: recentCommits,
    changedFiles: changedFiles,
    categorizedChanges: categorized,
    issueReferences,
    checklist: generateChecklist(categorized),
  });

  process.stdout.write(template);
}

interface PRTemplateData {
  title: string;
  currentBranch: string;
  baseBranch: string;
  author: string;
  commits: string[];
  changedFiles: string[];
  categorizedChanges: CategorizedChanges;
  issueReferences: number[];
  checklist: string[];
}

interface CategorizedChanges {
  features: string[];
  fixes: string[];
  tests: string[];
  docs: string[];
  config: string[];
  other: string[];
}

function formatPrTemplate(data: PRTemplateData): string {
  const { title, currentBranch, baseBranch, commits, changedFiles, categorizedChanges, issueReferences, checklist, author } = data;

  let output = "";

  // Title
  output += `# ${title}\n\n`;

  // Branch info
  output += `**Branch:** \`${currentBranch}\` → \`${baseBranch}\`\n`;
  output += `**Author:** ${author}\n\n`;

  // Issue references
  if (issueReferences.length > 0) {
    output += `**Closes:** ${issueReferences.map(n => `#${n}`).join(", ")}\n\n`;
  }

  // Summary section
  output += `## Summary\n\n`;
  output += `<!-- Describe what this PR does and why it's needed -->\n`;
  output += `This PR includes changes from ${commits.length} commit(s) touching ${changedFiles.length} file(s).\n\n`;

  // Change summary by category
  const categories = [];
  if (categorizedChanges.features.length > 0) categories.push(`${categorizedChanges.features.length} feature(s)`);
  if (categorizedChanges.fixes.length > 0) categories.push(`${categorizedChanges.fixes.length} fix(es)`);
  if (categorizedChanges.tests.length > 0) categories.push(`${categorizedChanges.tests.length} test(s)`);
  if (categorizedChanges.docs.length > 0) categories.push(`${categorizedChanges.docs.length} doc(s)`);
  if (categorizedChanges.config.length > 0) categories.push(`${categorizedChanges.config.length} config change(s)`);

  if (categories.length > 0) {
    output += `**Changes:** ${categories.join(", ")}.\n\n`;
  }

  // Type of change
  output += `## Type of Change\n\n`;
  output += `- [ ] 🎉 **New feature** (non-breaking change which adds functionality)\n`;
  output += `- [ ] 🐛 **Bug fix** (non-breaking change which fixes an issue)\n`;
  output += `- [ ] 🧪 **Test addition** (adding missing tests or improving test coverage)\n`;
  output += `- [ ] 📝 **Documentation** (documentation changes)\n`;
  output += `- [ ] ♻️ **Refactor** (refactoring production code)\n`;
  output += `- [ ] ⚡ **Performance** (performance improvement)\n`;
  output += `- [ ] 💥 **Breaking change** (fix or feature that would cause existing functionality to not work as expected)\n\n`;

  // Changed files
  if (changedFiles.length > 0) {
    output += `## Changed Files\n\n`;
    const maxFiles = 30;
    const filesToShow = changedFiles.slice(0, maxFiles);
    filesToShow.forEach(file => {
      const icon = getFileIcon(file);
      output += `${icon} \`${file}\`\n`;
    });
    if (changedFiles.length > maxFiles) {
      output += `\n... and ${changedFiles.length - maxFiles} more files\n`;
    }
    output += `\n`;
  }

  // Categorized breakdown
  if (categorizedChanges.features.length > 0) {
    output += `### ✨ Features\n\n`;
    categorizedChanges.features.forEach(f => output += `- \`${f}\`\n`);
    output += `\n`;
  }

  if (categorizedChanges.fixes.length > 0) {
    output += `### 🐛 Fixes\n\n`;
    categorizedChanges.fixes.forEach(f => output += `- \`${f}\`\n`);
    output += `\n`;
  }

  if (categorizedChanges.tests.length > 0) {
    output += `### 🧪 Tests\n\n`;
    categorizedChanges.tests.forEach(f => output += `- \`${f}\`\n`);
    output += `\n`;
  }

  if (categorizedChanges.docs.length > 0) {
    output += `### 📝 Docs\n\n`;
    categorizedChanges.docs.forEach(f => output += `- \`${f}\`\n`);
    output += `\n`;
  }

  // Recent commits
  if (commits.length > 0) {
    output += `## Recent Commits\n\n`;
    commits.forEach(commit => {
      output += `- ${commit}\n`;
    });
    output += `\n`;
  }

  // Testing checklist
  output += `## Testing\n\n`;
  output += `<!-- Describe the tests you ran and how to reproduce them -->\n`;
  if (checklist.length > 0) {
    checklist.forEach(item => {
      output += `- [ ] ${item}\n`;
    });
  } else {
    output += `- [ ] Added tests for new functionality\n`;
    output += `- [ ] All tests pass: \`npm test\`\n`;
    output += `- [ ] Manual testing completed\n`;
  }
  output += `\n`;

  // Additional notes
  output += `## Additional Notes\n\n`;
  output += `<!-- Any additional information, screenshots, or context -->\n\n`;

  // Breaking changes notice
  output += `## Breaking Changes\n\n`;
  output += `<!-- If this PR includes breaking changes, describe them here -->\n`;
  output += `None.\n\n`;

  return output;
}

function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop();
  const icons: Record<string, string> = {
    "ts": "📦",
    "tsx": "⚛️",
    "js": "📜",
    "jsx": "⚛️",
    "py": "🐍",
    "rs": "🦀",
    "go": "🐹",
    "java": "☕",
    "md": "📝",
    "json": "📋",
    "yaml": "📋",
    "yml": "📋",
    "test.ts": "🧪",
    "test.js": "🧪",
    "spec.ts": "🧪",
    "spec.js": "🧪",
  };
  return icons[ext || ""] || "📄";
}

function categorizeFiles(files: string[]): CategorizedChanges {
  const categorized: CategorizedChanges = {
    features: [],
    fixes: [],
    tests: [],
    docs: [],
    config: [],
    other: [],
  };

  for (const file of files) {
    if (file.includes("test") || file.includes("spec")) {
      categorized.tests.push(file);
    } else if (file.includes("README") || file.endsWith(".md")) {
      categorized.docs.push(file);
    } else if (file.includes("config") || file.endsWith(".json") || file.endsWith(".yaml") || file.endsWith(".yml") || file.includes(".")) {
      categorized.config.push(file);
    } else if (file.includes("fix") || file.includes("bug")) {
      categorized.fixes.push(file);
    } else if (file.includes("feat") || file.includes("feature") || file.includes("src")) {
      categorized.features.push(file);
    } else {
      categorized.other.push(file);
    }
  }

  return categorized;
}

function generateTitle(branch: string, commits: string[], issues: number[]): string {
  // Try to extract from branch name
  if (branch.startsWith("feat/") || branch.startsWith("feature/")) {
    const featName = branch.split("/")[1]?.replace(/-/g, " ") || branch;
    return `feat: ${capitalize(featName)}`;
  }
  if (branch.startsWith("fix/")) {
    const fixName = branch.split("/")[1]?.replace(/-/g, " ") || branch;
    return `fix: ${capitalize(fixName)}`;
  }
  if (branch.startsWith("docs/")) {
    const docName = branch.split("/")[1]?.replace(/-/g, " ") || branch;
    return `docs: ${capitalize(docName)}`;
  }
  if (branch.startsWith("chore/")) {
    const choreName = branch.split("/")[1]?.replace(/-/g, " ") || branch;
    return `chore: ${capitalize(choreName)}`;
  }

  // Try to extract from first commit
  if (commits.length > 0) {
    const firstCommit = commits[0];
    // Remove conventional commit type if present and add issue number
    let title = firstCommit.replace(/^(feat|fix|docs|chore|test|refactor|style):\s*/i, "");
    if (issues.length > 0) {
      title += ` (#${issues[0]})`;
    }
    return title;
  }

  // Fallback to branch name
  return `Update from ${branch}`;
}

function generateChecklist(categorized: CategorizedChanges): string[] {
  const checklist = [];

  if (categorized.features.length > 0 || categorized.fixes.length > 0) {
    checklist.push("Code changes reviewed and follow project conventions");
  }

  if (categorized.tests.length > 0) {
    checklist.push("New/updated tests pass locally");
    checklist.push("Test coverage added for new code");
  }

  if (categorized.docs.length > 0) {
    checklist.push("Documentation is accurate and complete");
  }

  if (categorized.config.length > 0) {
    checklist.push("Configuration changes are documented");
  }

  return checklist;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Git helpers

async function execGit(root: string, cmd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("sh", ["-c", cmd], { cwd: root, timeout: 10_000 }, (err, stdout) => {
      resolve(err ? "" : stdout.trim());
    });
  });
}

async function getCurrentBranch(root: string): Promise<string> {
  const branch = await execGit(root, "git rev-parse --abbrev-ref HEAD 2>/dev/null");
  return branch || "unknown";
}

async function getDefaultBranch(root: string): Promise<string | null> {
  // Try to get default branch from remote
  const defaultBranch = await execGit(root, "git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d' ' -f5");
  if (defaultBranch) return defaultBranch;

  // Fallback to common defaults
  const branches = await execGit(root, "git branch -r 2>/dev/null");
  if (branches.includes("origin/main")) return "main";
  if (branches.includes("origin/master")) return "master";

  return null;
}

async function getRecentCommits(root: string): Promise<string[]> {
  const output = await execGit(root, 'git log -10 --format="%s" 2>/dev/null');
  if (!output) return [];
  return output.split("\n").filter(Boolean);
}

async function getChangedFiles(root: string): Promise<string[]> {
  // Get files changed in current branch vs default branch
  const defaultBranch = await getDefaultBranch(root) || "main";

  // Try to get diff against merge base
  const output = await execGit(
    root,
    `git diff --name-only $(git merge-base HEAD ${defaultBranch} 2>/dev/null || echo "HEAD~10") 2>/dev/null`
  );

  if (!output) return [];

  const files = output
    .split("\n")
    .filter(Boolean)
    .map(f => f.replace(/^\.\//, ""));

  // Remove duplicates and sort
  return [...new Set(files)].sort();
}

async function getIssueReferences(root: string): Promise<number[]> {
  const commits = await getRecentCommits(root);
  const issues = new Set<number>();

  // Match patterns like #123, closes #123, fixes #123
  const issuePattern = /(?:close|closes|fix|fixes|resolve|resolves|ref|refs)?\s*#(\d+)/gi;

  for (const commit of commits) {
    const matches = commit.matchAll(issuePattern);
    for (const match of matches) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) {
        issues.add(num);
      }
    }
  }

  return Array.from(issues).sort((a, b) => a - b);
}

async function getGitAuthor(root: string): Promise<string> {
  const name = await execGit(root, "git config user.name 2>/dev/null");
  const email = await execGit(root, "git config user.email 2>/dev/null");
  if (name && email) {
    return `${name} <${email}>`;
  }
  return name || "Unknown";
}
