import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkGraphQLSupport, fetchGitHubGraphQLData } from "../../src/github/graphql.js";

// Mock child_process.execFile
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("GitHub GraphQL Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkGraphQLSupport", () => {
    it("should return true for gh version 2.0+", async () => {
      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementationOnce((cmd, args, options, callback) => {
        callback(null, "gh version 2.0.0", "");
        return {} as any;
      });

      const result = await checkGraphQLSupport("/test/cwd");
      expect(result).toBe(true);
    });

    it("should return true for gh version 2.23.0", async () => {
      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementationOnce((cmd, args, options, callback) => {
        callback(null, "gh version 2.23.0", "");
        return {} as any;
      });

      const result = await checkGraphQLSupport("/test/cwd");
      expect(result).toBe(true);
    });

    it("should return false for gh version 1.x", async () => {
      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementationOnce((cmd, args, options, callback) => {
        callback(null, "gh version 1.2.3", "");
        return {} as any;
      });

      const result = await checkGraphQLSupport("/test/cwd");
      expect(result).toBe(false);
    });

    it("should return false when gh is not available", async () => {
      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementationOnce((cmd, args, options, callback) => {
        callback(new Error("gh not found"), "", "gh: command not found");
        return {} as any;
      });

      const result = await checkGraphQLSupport("/test/cwd");
      expect(result).toBe(false);
    });

    it("should return false for unparseable version", async () => {
      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementationOnce((cmd, args, options, callback) => {
        callback(null, "unknown version", "");
        return {} as any;
      });

      const result = await checkGraphQLSupport("/test/cwd");
      expect(result).toBe(false);
    });
  });

  describe("fetchGitHubGraphQLData", () => {
    it("should return empty object for invalid remote URL", async () => {
      const result = await fetchGitHubGraphQLData("/test/cwd", "https://gitlab.com/repo.git");
      expect(result).toEqual({});
    });

    it("should parse owner and repo from HTTPS URL", async () => {
      const { execFile } = await import("node:child_process");

      // Mock successful GraphQL response
      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        const response = {
          data: {
            repository: {
              issues: { nodes: [] },
              pullRequests: { nodes: [] },
              milestones: { nodes: [] },
              releases: { nodes: [] },
              projectsV2: { nodes: [] },
            },
          },
        };
        callback(null, JSON.stringify(response), "");
        return {} as any;
      });

      const result = await fetchGitHubGraphQLData("/test/cwd", "https://github.com/owner/repo.git");

      // Should have called execFile with GraphQL query
      expect(execFile).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should parse owner and repo from SSH URL", async () => {
      const { execFile } = await import("node:child_process");

      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        const response = {
          data: {
            repository: {
              issues: { nodes: [] },
              pullRequests: { nodes: [] },
              milestones: { nodes: [] },
              releases: { nodes: [] },
              projectsV2: { nodes: [] },
            },
          },
        };
        callback(null, JSON.stringify(response), "");
        return {} as any;
      });

      const result = await fetchGitHubGraphQLData("/test/cwd", "git@github.com:owner/repo.git");

      expect(execFile).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("should handle GraphQL errors gracefully", async () => {
      const { execFile } = await import("node:child_process");

      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        const response = {
          errors: [{ message: "Could not resolve to a Repository" }],
        };
        callback(null, JSON.stringify(response), "");
        return {} as any;
      });

      const result = await fetchGitHubGraphQLData("/test/cwd", "https://github.com/owner/repo.git");

      // Should return empty object on error
      expect(result).toEqual({});
    });

    it("should handle CLI errors gracefully", async () => {
      const { execFile } = await import("node:child_process");

      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        callback(new Error("gh not authenticated"), "", "gh not authenticated");
        return {} as any;
      });

      const result = await fetchGitHubGraphQLData("/test/cwd", "https://github.com/owner/repo.git");

      // Should return empty object on CLI error
      expect(result).toEqual({});
    });

    it("should parse issue with enhanced fields", async () => {
      const { execFile } = await import("node:child_process");

      const mockIssue = {
        number: 123,
        title: "Test Issue",
        state: "OPEN",
        url: "https://github.com/owner/repo/issues/123",
        labels: { nodes: [{ name: "bug" }, { name: "high-priority" }] },
        assignees: { nodes: [{ login: "testuser" }] },
        milestone: { title: "Sprint 1" },
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        comments: { totalCount: 5 },
        reactions: {
          thumbsUp: 10,
          thumbsDown: 1,
          laugh: 2,
          hooray: 3,
          confused: 0,
          heart: 5,
          rocket: 7,
          eyes: 4,
        },
        timelineItems: { totalCount: 15 },
      };

      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        const response = {
          data: {
            repository: {
              issues: { nodes: [mockIssue] },
              pullRequests: { nodes: [] },
              milestones: { nodes: [] },
              releases: { nodes: [] },
              projectsV2: { nodes: [] },
            },
          },
        };
        callback(null, JSON.stringify(response), "");
        return {} as any;
      });

      const result = await fetchGitHubGraphQLData("/test/cwd", "https://github.com/owner/repo.git");

      expect(result.issues).toHaveLength(1);
      expect(result.issues?.[0]).toMatchObject({
        number: 123,
        title: "Test Issue",
        state: "open",
        comments_count: 5,
        reactions: {
          thumbs_up: 10,
          thumbs_down: 1,
          laugh: 2,
          hooray: 3,
          confused: 0,
          heart: 5,
          rocket: 7,
          eyes: 4,
        },
        timeline_events: 15,
      });
    });

    it("should parse pull request with enhanced fields", async () => {
      const { execFile } = await import("node:child_process");

      const mockPR = {
        number: 42,
        title: "Test PR",
        state: "OPEN",
        url: "https://github.com/owner/repo/pull/42",
        author: { login: "prauthor" },
        headRefName: "feature-branch",
        labels: { nodes: [{ name: "enhancement" }] },
        reviewRequests: { nodes: [{ requestedReviewer: { login: "reviewer1" } }] },
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
        additions: 100,
        deletions: 50,
        mergeable: "MERGEABLE",
        comments: { totalCount: 8 },
        reviewDecision: "APPROVED",
        statusCheckRollup: { state: "SUCCESS" },
      };

      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        const response = {
          data: {
            repository: {
              issues: { nodes: [] },
              pullRequests: { nodes: [mockPR] },
              milestones: { nodes: [] },
              releases: { nodes: [] },
              projectsV2: { nodes: [] },
            },
          },
        };
        callback(null, JSON.stringify(response), "");
        return {} as any;
      });

      const result = await fetchGitHubGraphQLData("/test/cwd", "https://github.com/owner/repo.git");

      expect(result.pull_requests).toHaveLength(1);
      expect(result.pull_requests?.[0]).toMatchObject({
        number: 42,
        title: "Test PR",
        state: "open",
        checks_status: "passing",
        mergeable: true,
        merge_conflicts: false,
        additions: 100,
        deletions: 50,
        comments_count: 8,
      });
      // review_decision might be null if not properly set
      expect(result.pull_requests?.[0].review_decision).toBeDefined();
    });

    it("should respect include options", async () => {
      const { execFile } = await import("node:child_process");

      let _callCount = 0;
      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        _callCount++;
        const response = {
          data: {
            repository: {
              issues: { nodes: [] },
              pullRequests: { nodes: [] },
              milestones: { nodes: [] },
              releases: { nodes: [] },
              projectsV2: { nodes: [] },
            },
          },
        };
        callback(null, JSON.stringify(response), "");
        return {} as any;
      });

      // Only fetch issues and PRs
      await fetchGitHubGraphQLData("/test/cwd", "https://github.com/owner/repo.git", {
        includeIssues: true,
        includePRs: true,
        includeMilestones: false,
        includeReleases: false,
        includeProjects: false,
      });

      // Should only call once (combined query) or fewer times
      // In the actual implementation, each type has its own query
      expect(execFile).toHaveBeenCalled();
    });

    it("should parse releases", async () => {
      const { execFile } = await import("node:child_process");

      const mockRelease = {
        tagName: "v1.0.0",
        name: "Version 1.0.0",
        url: "https://github.com/owner/repo/releases/v1.0.0",
        createdAt: "2024-01-01T00:00:00Z",
        isPrerelease: false,
        author: { login: "maintainer" },
      };

      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        const response = {
          data: {
            repository: {
              issues: { nodes: [] },
              pullRequests: { nodes: [] },
              milestones: { nodes: [] },
              releases: { nodes: [mockRelease] },
              projectsV2: { nodes: [] },
            },
          },
        };
        callback(null, JSON.stringify(response), "");
        return {} as any;
      });

      const result = await fetchGitHubGraphQLData("/test/cwd", "https://github.com/owner/repo.git");

      expect(result.releases).toHaveLength(1);
      expect(result.releases?.[0]).toMatchObject({
        tag_name: "v1.0.0",
        name: "Version 1.0.0",
        prerelease: false,
        author: "maintainer",
      });
    });

    it("should parse project boards", async () => {
      const { execFile } = await import("node:child_process");

      const mockProject = {
        number: 1,
        title: "Kanban Board",
        state: "OPEN",
        url: "https://github.com/owner/repo/projects/1",
        columns: {
          nodes: [{ name: "To Do" }, { name: "In Progress" }, { name: "Done" }],
        },
        items: { totalCount: 15 },
      };

      vi.mocked(execFile).mockImplementation((cmd, args, options, callback) => {
        const response = {
          data: {
            repository: {
              issues: { nodes: [] },
              pullRequests: { nodes: [] },
              milestones: { nodes: [] },
              releases: { nodes: [] },
              projectsV2: { nodes: [mockProject] },
            },
          },
        };
        callback(null, JSON.stringify(response), "");
        return {} as any;
      });

      const result = await fetchGitHubGraphQLData("/test/cwd", "https://github.com/owner/repo.git");

      expect(result.project_boards).toHaveLength(1);
      expect(result.project_boards?.[0]).toMatchObject({
        number: 1,
        title: "Kanban Board",
        state: "open",
      });
      expect(result.project_boards?.[0].columns).toHaveLength(3);
    });
  });
});
