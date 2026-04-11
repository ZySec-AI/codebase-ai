// ─── Core Interfaces ─────────────────────────────────────────────

export interface ScanContext {
  root: string;
  files: string[];
  readFile(path: string): Promise<string>;
  fileExists(path: string): boolean;
  glob(pattern: string): string[];
  /**
   * Execute a command safely using execFile (no shell interpolation).
   * @param cmd  The executable name, e.g. "git"
   * @param args Arguments array, e.g. ["log", "--oneline", "-5"]
   * Returns stdout on success, empty string on error/timeout.
   */
  exec(cmd: string, args: string[]): Promise<string>;
}

export interface Detector {
  name: string;
  category: string;
  detect(ctx: ScanContext): Promise<Record<string, unknown>>;
}

export interface InjectResult {
  ok: boolean;
  message?: string;
}

export interface Integration {
  name: string;
  detect(root: string): boolean;
  inject(root: string): Promise<InjectResult>;
  remove(root: string): void;
}

// ─── Manifest Schema ─────────────────────────────────────────────

/** Valid category keys for dynamic manifest access. */
export type ManifestCategory =
  | "project"
  | "repo"
  | "structure"
  | "stack"
  | "commands"
  | "dependencies"
  | "config"
  | "git"
  | "quality"
  | "patterns"
  | "status"
  | "roadmap"
  | "decisions";

export interface Manifest {
  version: string;
  generated_at: string;
  /** Warnings from detectors that failed or returned partial data. AI tools should inspect this. */
  _warnings?: string[];

  // Project identity
  project?: ProjectData;

  // Code scanning (filesystem + git)
  repo?: RepoData;
  structure?: StructureData;
  stack?: StackData;
  commands?: CommandsData;
  dependencies?: DependenciesData;
  config?: ConfigData;
  git?: GitData;
  quality?: QualityData;
  patterns?: PatternsData;

  // Project awareness (GitHub via `gh` CLI)
  status?: StatusData;
  roadmap?: RoadmapData;
  decisions?: DecisionsData;
}

export interface ProjectData {
  name: string;
  description: string | null;
}

export interface RepoData {
  url: string | null;
  default_branch: string | null;
  is_monorepo: boolean;
  workspace_manager?: string | null;
  active_branches: string[];
}

export interface StructureData {
  entry_points: string[];
  build_output: string[];
  tree: Record<string, string[]>;
  workspaces?: Record<string, { framework?: string; entry?: string; type?: string }>;
}

export interface StackData {
  languages: string[];
  frameworks: string[];
  package_manager: string | null;
  database: string | null;
  orm: string | null;
  styling: string | null;
  build_tool: string | null;
}

export interface CommandsData {
  dev: string | null;
  build: string | null;
  test: string | null;
  lint: string | null;
  format: string | null;
  [key: string]: string | null;
}

export interface DependenciesData {
  direct_count: number;
  dev_count: number;
  lock_file: string | null;
  notable: string[];
  /** License analysis from package.json */
  licenses?: {
    /** Top-level package license */
    project_license: string | null;
    /** Count of deps by license type */
    dependency_licenses: Record<string, number>;
    /** Flags copyleft licenses that may require disclosure */
    copyleft_flags?: string[];
  };
}

export interface ConfigData {
  env_files: string[];
  config_files: string[];
  feature_flags: string | null;
  env_vars?: Record<string, { description?: string; required: boolean }>;
}

export interface GitData {
  recent_commits: string[];
  last_committers: string[];
  uncommitted_changes: boolean;
}

export interface QualityData {
  test_framework: string | null;
  linter: string | null;
  formatter: string | null;
  ci: string | null;
  pre_commit_hooks: boolean;
}

export interface PatternsData {
  architecture: string | null;
  state_management: string | null;
  api_style: string | null;
  key_modules: Record<string, string>;
}

// ─── GitHub / Project Awareness ──────────────────────────────────

export interface StatusData {
  synced_at: string | null;
  github_available: boolean;
  issues: IssueData[];
  pull_requests: PullRequestData[];
  kanban: KanbanView;
  priorities: IssueData[];
  // Enhanced fields
  releases?: ReleaseData[];
  project_boards?: ProjectBoardData[];
}

export interface ReleaseData {
  tag_name: string;
  name: string;
  created_at: string;
  url: string;
  author: string;
  prerelease: boolean;
}

export interface ProjectBoardData {
  number: number;
  title: string;
  state: "open" | "closed";
  columns: Array<{
    name: string;
    cards_count: number;
  }>;
  url: string;
}

export interface IssueData {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  assignee: string | null;
  milestone: string | null;
  created_at: string;
  updated_at: string;
  mapped_files?: string[];
  /** Effort estimate parsed from issue body: S=hours, M=days, L=weeks */
  effort?: "S" | "M" | "L";
  // Enhanced fields
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
  body?: string;
}

export interface PullRequestData {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  author: string;
  branch: string;
  labels: string[];
  reviewers: string[];
  created_at: string;
  updated_at: string;
  // Enhanced fields
  checks_status?: "pending" | "passing" | "failing";
  mergeable?: boolean;
  merge_conflicts?: boolean;
  additions?: number;
  deletions?: number;
  comments_count?: number;
  review_decision?: "approved" | "changes_requested" | "review_required" | null;
  url?: string;
}

export interface KanbanView {
  backlog: IssueData[];
  in_progress: IssueData[];
  needs_verify: IssueData[];
  done: IssueData[];
}

export interface RoadmapData {
  milestones: MilestoneData[];
}

export interface MilestoneData {
  title: string;
  description: string;
  due_date: string | null;
  progress: { open: number; closed: number; percent: number };
  issues: IssueData[];
}

export interface DecisionsData {
  from_prs: DecisionEntry[];
  from_adrs: DecisionEntry[];
  manual: DecisionEntry[];
}

export interface DecisionEntry {
  title: string;
  summary: string;
  date: string;
  source: string;
  url?: string;
}

// ─── CLI Options ─────────────────────────────────────────────────

export interface CLIOptions {
  command: string;
  subcommand: string;
  positionals: string[];
  path: string;
  format: string;
  depth: number;
  categories: string[];
  incremental: boolean;
  quiet: boolean;
  force: boolean;
  verbose: boolean;
  port: number;
  tools: string[];
  dryRun: boolean;
  since: string;
  sync: boolean;
  message: string;
  reason: string;
  examples: boolean;
  helpCommand: boolean;
  slim: boolean;
  model: string;
  provider: string;
}
