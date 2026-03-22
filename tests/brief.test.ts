import { describe, it, expect } from "vitest";
import { generateBrief } from "../src/mcp/brief.js";
import type { Manifest } from "../src/types.js";

function minimalManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    version: "1.0",
    generated_at: "2026-02-22T12:00:00.000Z",
    project: { name: "test-project", description: "A test project" },
    stack: {
      languages: ["typescript"],
      frameworks: ["react@18.3"],
      package_manager: "npm",
      database: null,
      orm: null,
      styling: "tailwindcss",
      build_tool: "vite",
    },
    commands: {
      dev: "npm run dev",
      build: "npm run build",
      test: "npm run test",
      lint: null,
      format: null,
    },
    structure: { entry_points: ["src/main.tsx"], build_output: [".next"], tree: {} },
    patterns: {
      architecture: "app-router",
      state_management: "zustand",
      api_style: null,
      key_modules: {},
    },
    ...overrides,
  };
}

describe("generateBrief", () => {
  it("includes project name and description", () => {
    const brief = generateBrief(minimalManifest());
    expect(brief).toContain("# PROJECT BRIEF: test-project");
    expect(brief).toContain("A test project");
  });

  it("includes build_tool in technical overview", () => {
    const brief = generateBrief(minimalManifest());
    expect(brief).toContain("Build tool: vite");
  });

  it("hides CURRENT STATUS when no github data", () => {
    const brief = generateBrief(minimalManifest());
    expect(brief).not.toContain("## CURRENT STATUS");
  });

  it("hides CURRENT STATUS when github_available but no content", () => {
    const brief = generateBrief(
      minimalManifest({
        status: {
          synced_at: "2026-02-22T12:00:00.000Z",
          github_available: true,
          issues: [],
          pull_requests: [],
          kanban: { backlog: [], in_progress: [], done: [] },
          priorities: [],
        },
      })
    );
    expect(brief).not.toContain("## CURRENT STATUS");
  });

  it("shows CURRENT STATUS when there are issues", () => {
    const brief = generateBrief(
      minimalManifest({
        status: {
          synced_at: "2026-02-22T12:00:00.000Z",
          github_available: true,
          issues: [
            {
              number: 1,
              title: "Fix bug",
              state: "open",
              labels: ["bug"],
              assignee: null,
              milestone: null,
              created_at: "2026-02-22T12:00:00.000Z",
              updated_at: "2026-02-22T12:00:00.000Z",
            },
          ],
          pull_requests: [],
          kanban: {
            backlog: [
              {
                number: 1,
                title: "Fix bug",
                state: "open",
                labels: ["bug"],
                assignee: null,
                milestone: null,
                created_at: "2026-02-22T12:00:00.000Z",
                updated_at: "2026-02-22T12:00:00.000Z",
              },
            ],
            in_progress: [],
            done: [],
          },
          priorities: [
            {
              number: 1,
              title: "Fix bug",
              state: "open",
              labels: ["bug"],
              assignee: null,
              milestone: null,
              created_at: "2026-02-22T12:00:00.000Z",
              updated_at: "2026-02-22T12:00:00.000Z",
            },
          ],
        },
      })
    );
    expect(brief).toContain("## CURRENT STATUS");
    expect(brief).toContain("Fix bug");
  });

  it("includes commands section", () => {
    const brief = generateBrief(minimalManifest());
    expect(brief).toContain("## Commands");
    expect(brief).toContain("dev: `npm run dev`");
  });

  it("skips null commands", () => {
    const brief = generateBrief(minimalManifest());
    expect(brief).not.toContain("lint:");
    expect(brief).not.toContain("format:");
  });

  it("does not include static Available Commands boilerplate", () => {
    const brief = generateBrief(minimalManifest());
    // The Available Commands section was removed to reduce token bloat per session
    expect(brief).not.toContain("## Available Commands");
  });
});
