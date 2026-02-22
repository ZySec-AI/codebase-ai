import type { Detector, ScanContext } from "../types.js";

export const repoDetector: Detector = {
  name: "repo",
  category: "repo",

  async detect(ctx: ScanContext) {
    const [url, defaultBranch, branches, isMonorepo, workspaceManager] = await Promise.all([
      getRemoteUrl(ctx),
      getDefaultBranch(ctx),
      getActiveBranches(ctx),
      detectMonorepo(ctx),
      detectWorkspaceManager(ctx),
    ]);

    return {
      url,
      default_branch: defaultBranch,
      is_monorepo: isMonorepo,
      workspace_manager: isMonorepo ? workspaceManager : null,
      active_branches: branches,
    };
  },
};

async function getRemoteUrl(ctx: ScanContext): Promise<string | null> {
  const result = await ctx.exec("git remote get-url origin 2>/dev/null");
  return result || null;
}

async function getDefaultBranch(ctx: ScanContext): Promise<string | null> {
  // Try symbolic ref first
  let branch = await ctx.exec("git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null");
  if (branch) return branch.replace("refs/remotes/origin/", "");

  // Fallback: check if main or master exists
  const branches = await ctx.exec("git branch --list main master 2>/dev/null");
  if (branches.includes("main")) return "main";
  if (branches.includes("master")) return "master";

  // Last resort: current branch
  const current = await ctx.exec("git branch --show-current 2>/dev/null");
  return current || null;
}

async function getActiveBranches(ctx: ScanContext): Promise<string[]> {
  const output = await ctx.exec("git branch -a --sort=-committerdate --format='%(refname:short)' 2>/dev/null");
  if (!output) return [];

  return output
    .split("\n")
    .map(b => b.trim().replace(/^origin\//, ""))
    .filter(b => b && b !== "HEAD")
    .filter((b, i, arr) => arr.indexOf(b) === i) // dedupe
    .slice(0, 10);
}

async function detectMonorepo(ctx: ScanContext): Promise<boolean> {
  // Check package.json workspaces
  const pkgContent = await ctx.readFile("package.json");
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      if (pkg.workspaces) return true;
    } catch {}
  }

  // Check for monorepo tools
  return (
    ctx.fileExists("pnpm-workspace.yaml") ||
    ctx.fileExists("lerna.json") ||
    ctx.fileExists("turbo.json") ||
    ctx.fileExists("nx.json") ||
    ctx.fileExists("rush.json")
  );
}

async function detectWorkspaceManager(ctx: ScanContext): Promise<string | null> {
  if (ctx.fileExists("turbo.json")) return "turborepo";
  if (ctx.fileExists("nx.json")) return "nx";
  if (ctx.fileExists("lerna.json")) return "lerna";
  if (ctx.fileExists("rush.json")) return "rush";
  if (ctx.fileExists("pnpm-workspace.yaml")) return "pnpm";

  const pkgContent = await ctx.readFile("package.json");
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      if (pkg.workspaces) return "npm/yarn";
    } catch {}
  }

  return null;
}
