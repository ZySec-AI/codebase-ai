import { describe, it, expect } from "vitest";
import { generateSlimBrief } from "../../src/mcp/brief.js";
import type { Manifest } from "../../src/types.js";

function minimal(overrides: Partial<Manifest> = {}): Manifest {
  return {
    version: "1.0",
    generated_at: new Date().toISOString(),
    project: { name: "my-app", description: "Test app" },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      package_manager: "npm",
      database: null,
      orm: null,
      styling: null,
      build_tool: null,
    },
    commands: {
      dev: "npm run dev",
      build: "npm run build",
      test: "npm test",
      lint: null,
      format: null,
    },
    structure: { entry_points: [], build_output: [], tree: {} },
    patterns: { architecture: null, state_management: null, api_style: null, key_modules: {} },
    ...overrides,
  };
}

describe("generateSlimBrief", () => {
  it("includes project name in header", () => {
    const brief = generateSlimBrief(minimal());
    expect(brief).toContain("my-app");
  });

  it("includes manifest freshness in header", () => {
    const brief = generateSlimBrief(minimal({ generated_at: new Date().toISOString() }));
    expect(brief).toMatch(/manifest: \d+m ago|manifest: \d+h ago/);
  });

  it("includes 'For full context' footer", () => {
    const brief = generateSlimBrief(minimal());
    expect(brief).toContain("For full context: `codebase brief`");
  });

  it("shows uncommitted changes warning when git has changes", () => {
    const brief = generateSlimBrief(
      minimal({
        git: { uncommitted_changes: true, recent_commits: [], branch: "main", remote_url: null },
      })
    );
    expect(brief).toContain("WARNING: Uncommitted changes");
  });

  it("does not show uncommitted warning when no changes", () => {
    const brief = generateSlimBrief(
      minimal({
        git: { uncommitted_changes: false, recent_commits: [], branch: "main", remote_url: null },
      })
    );
    expect(brief).not.toContain("WARNING");
  });

  it("shows in-progress issues", () => {
    const brief = generateSlimBrief(
      minimal({
        status: {
          synced_at: new Date().toISOString(),
          github_available: true,
          issues: [],
          pull_requests: [],
          kanban: {
            backlog: [],
            in_progress: [
              {
                number: 42,
                title: "Build auth",
                state: "open",
                labels: [],
                assignee: null,
                milestone: null,
                created_at: "",
                updated_at: "",
              },
            ],
            done: [],
          },
          priorities: [],
        },
      })
    );
    expect(brief).toContain("In Progress");
    expect(brief).toContain("#42: Build auth");
  });

  it("shows next task from priorities", () => {
    const brief = generateSlimBrief(
      minimal({
        status: {
          synced_at: new Date().toISOString(),
          github_available: true,
          issues: [],
          pull_requests: [],
          kanban: { backlog: [], in_progress: [], done: [] },
          priorities: [
            {
              number: 7,
              title: "Fix login bug",
              state: "open",
              labels: ["bug"],
              assignee: null,
              milestone: null,
              created_at: "",
              updated_at: "",
            },
          ],
        },
      })
    );
    expect(brief).toContain("Next Task");
    expect(brief).toContain("#7: Fix login bug");
    expect(brief).toContain("[bug]");
  });

  it("shows recent commits", () => {
    const brief = generateSlimBrief(
      minimal({
        git: {
          branch: "main",
          remote_url: null,
          uncommitted_changes: false,
          recent_commits: ["abc123 feat: add login", "def456 fix: typo", "ghi789 chore: deps"],
        },
      })
    );
    expect(brief).toContain("Recent Commits");
    expect(brief).toContain("feat: add login");
  });

  it("shows at most 3 recent commits", () => {
    const brief = generateSlimBrief(
      minimal({
        git: {
          branch: "main",
          remote_url: null,
          uncommitted_changes: false,
          recent_commits: ["c1 a", "c2 b", "c3 c", "c4 d", "c5 e"],
        },
      })
    );
    const matches = (brief.match(/^- /gm) || []).length;
    expect(matches).toBeLessThanOrEqual(3);
  });

  it("shows blockers", () => {
    const blockerIssue = {
      number: 99,
      title: "Blocked by infra",
      state: "open" as const,
      labels: ["blocked"],
      assignee: null,
      milestone: null,
      created_at: "",
      updated_at: "",
    };
    const brief = generateSlimBrief(
      minimal({
        status: {
          synced_at: "",
          github_available: true,
          issues: [blockerIssue],
          pull_requests: [],
          kanban: { backlog: [], in_progress: [], done: [] },
          priorities: [],
        },
      })
    );
    expect(brief).toContain("Blockers");
    expect(brief).toContain("#99: Blocked by infra");
  });
});
