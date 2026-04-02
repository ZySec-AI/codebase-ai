import type { Manifest } from "../types.js";

/**
 * Generates a natural-language project briefing for AI assistants.
 * This is the single most important output — it tells the AI everything
 * it needs to start working immediately.
 */
export function generateBrief(m: Manifest): string {
  const sections: string[] = [];

  // ─── Header ────────────────────────────────────────────────────
  const projectName = m.project?.name || "Unknown Project";
  sections.push(`# PROJECT BRIEF: ${projectName}`);
  if (m.project?.description) {
    sections.push(m.project.description);
  }
  sections.push(`\nGenerated: ${m.generated_at}\n`);

  // ─── What is this project? ─────────────────────────────────────
  sections.push("## Technical Overview");
  const projectParts: string[] = [];

  if (m.repo?.url) {
    projectParts.push(`Repository: ${m.repo.url}`);
    projectParts.push(`Default branch: ${m.repo.default_branch || "unknown"}`);
    if (m.repo.is_monorepo) {
      projectParts.push(`Monorepo: yes (${m.repo.workspace_manager || "workspaces"})`);
    }
  }

  if (m.stack) {
    const techParts: string[] = [];
    if (m.stack.languages?.length) {
      techParts.push(`Languages: ${m.stack.languages.join(", ")}`);
    }
    if (m.stack.frameworks?.length) {
      techParts.push(`Frameworks: ${m.stack.frameworks.join(", ")}`);
    }
    if (m.stack.package_manager) {
      techParts.push(`Package manager: ${m.stack.package_manager}`);
    }
    if (m.stack.database) {
      techParts.push(`Database: ${m.stack.database}`);
    }
    if (m.stack.orm) {
      techParts.push(`ORM: ${m.stack.orm}`);
    }
    if (m.stack.styling) {
      techParts.push(`Styling: ${m.stack.styling}`);
    }
    if (m.stack.build_tool) {
      techParts.push(`Build tool: ${m.stack.build_tool}`);
    }
    projectParts.push(techParts.join("\n"));
  }

  if (m.patterns) {
    if (m.patterns.architecture) {
      projectParts.push(`Architecture: ${m.patterns.architecture}`);
    }
    if (m.patterns.state_management) {
      projectParts.push(`State management: ${m.patterns.state_management}`);
    }
    if (m.patterns.api_style) {
      projectParts.push(`API style: ${m.patterns.api_style}`);
    }
  }

  sections.push(projectParts.join("\n"));

  // ─── How to run things ─────────────────────────────────────────
  if (m.commands) {
    const cmds = Object.entries(m.commands).filter(([, v]) => v);
    if (cmds.length) {
      sections.push("\n## Commands");
      for (const [name, cmd] of cmds) {
        sections.push(`- ${name}: \`${cmd}\``);
      }
    }
  }

  // ─── Project structure ─────────────────────────────────────────
  if (m.structure) {
    sections.push("\n## Key Paths");
    if (m.structure.entry_points?.length) {
      sections.push(`Entry points: ${m.structure.entry_points.join(", ")}`);
    }
    if (m.patterns?.key_modules && Object.keys(m.patterns.key_modules).length) {
      for (const [dir, desc] of Object.entries(m.patterns.key_modules)) {
        sections.push(`- ${dir} → ${desc}`);
      }
    }
  }

  // ─── CURRENT STATUS (most important for "what should I work on?") ───
  if (m.status && m.status.github_available) {
    const statusParts: string[] = [];

    // What's in progress?
    const inProgress = m.status.kanban?.in_progress || [];
    if (inProgress.length) {
      statusParts.push("\n### In Progress NOW");
      for (const i of inProgress) {
        const assignee = i.assignee ? ` → @${i.assignee}` : "";
        const files = i.mapped_files?.length ? ` (files: ${i.mapped_files.join(", ")})` : "";
        statusParts.push(`- #${i.number}: ${i.title}${assignee}${files}`);
      }
    }

    // What should I work on next?
    const priorities = m.status.priorities || [];
    const nextTask = priorities[0];
    if (nextTask) {
      statusParts.push("\n### NEXT TASK (highest priority)");
      const labels = nextTask.labels.length ? ` [${nextTask.labels.join(", ")}]` : "";
      statusParts.push(`#${nextTask.number}: ${nextTask.title}${labels}`);
      if (nextTask.body) {
        const snippet =
          nextTask.body.length > 300 ? nextTask.body.slice(0, 300) + "…" : nextTask.body;
        statusParts.push(snippet);
      }
      if (nextTask.mapped_files?.length) {
        statusParts.push(`Start in: ${nextTask.mapped_files.join(", ")}`);
      }
    }

    // What's in the backlog?
    const backlog = m.status.kanban?.backlog || [];
    if (backlog.length > 0) {
      statusParts.push(`\n### Backlog (${backlog.length} items)`);
      for (const i of backlog.slice(0, 5)) {
        const labels = i.labels.length ? ` [${i.labels.join(", ")}]` : "";
        statusParts.push(`- #${i.number}: ${i.title}${labels}`);
      }
      if (backlog.length > 5) {
        statusParts.push(`  ... and ${backlog.length - 5} more`);
      }
    }

    // Blockers
    const blocked = (m.status.issues || []).filter(
      (i) =>
        i.state === "open" &&
        i.labels.some(
          (l) => l.toLowerCase().includes("blocked") || l.toLowerCase().includes("blocker")
        )
    );
    if (blocked.length) {
      statusParts.push("\n### BLOCKERS");
      for (const i of blocked) {
        statusParts.push(`- #${i.number}: ${i.title} [${i.labels.join(", ")}]`);
      }
    }

    // Open PRs
    const openPRs = (m.status.pull_requests || []).filter((pr) => pr.state === "open");
    if (openPRs.length) {
      statusParts.push(`\n### Open PRs (${openPRs.length})`);
      for (const pr of openPRs.slice(0, 5)) {
        const reviewers = pr.reviewers.length ? ` → waiting on: ${pr.reviewers.join(", ")}` : "";
        statusParts.push(`- PR #${pr.number}: ${pr.title} (${pr.branch})${reviewers}`);
      }
    }

    // Only show section if there's actual content
    if (statusParts.length > 0) {
      sections.push("\n## CURRENT STATUS");
      sections.push(...statusParts);
    }
  }
  // Don't show empty "CURRENT STATUS" for projects without GitHub sync

  // ─── Roadmap ───────────────────────────────────────────────────
  if (m.roadmap?.milestones?.length) {
    sections.push("\n## Roadmap");
    for (const ms of m.roadmap.milestones) {
      const due = ms.due_date ? ` (due: ${ms.due_date.split("T")[0]})` : "";
      sections.push(
        `- ${ms.title}: ${ms.progress.percent}% complete (${ms.progress.closed}/${ms.progress.open + ms.progress.closed} done)${due}`
      );
    }
  }

  // ─── Decisions ─────────────────────────────────────────────────
  const allDecisions = [
    ...(m.decisions?.from_prs || []),
    ...(m.decisions?.from_adrs || []),
    ...(m.decisions?.manual || []),
  ];
  if (allDecisions.length) {
    sections.push("\n## Recent Decisions");
    for (const d of allDecisions.slice(0, 5)) {
      sections.push(`- ${d.title} (${d.source})`);
      if (d.summary) {
        sections.push(`  ${d.summary.slice(0, 150)}`);
      }
    }
  }

  // ─── Git status ────────────────────────────────────────────────
  if (m.git) {
    if (m.git.uncommitted_changes) {
      sections.push("\n## WARNING");
      sections.push("There are uncommitted changes in the working directory.");
    }
    if (m.git.recent_commits?.length) {
      sections.push("\n## Recent Commits");
      for (const c of m.git.recent_commits.slice(0, 3)) {
        sections.push(`- ${c}`);
      }
    }
  }

  return sections.join("\n");
}

/**
 * Generates a compact session-start briefing (~20 lines).
 * Focused on: what changed, what's in flight, what's next, any blockers.
 * Use with `codebase brief --slim` or `project_brief(slim: true)`.
 */
export function generateSlimBrief(m: Manifest): string {
  const sections: string[] = [];
  const name = m.project?.name || "Unknown Project";

  // Header with freshness
  const ageMs = m.generated_at ? Date.now() - new Date(m.generated_at).getTime() : -1;
  const ageMin = ageMs >= 0 ? Math.round(ageMs / 60000) : -1;
  const ageStr =
    ageMin < 0 ? "unknown age" : ageMin < 60 ? `${ageMin}m ago` : `${Math.round(ageMin / 60)}h ago`;
  sections.push(`# ${name} — Session Start (manifest: ${ageStr})`);

  // Uncommitted changes warning
  if (m.git?.uncommitted_changes) {
    sections.push("\nWARNING: Uncommitted changes in working directory.");
  }

  // In progress
  const inProgress = m.status?.kanban?.in_progress || [];
  if (inProgress.length) {
    sections.push("\n## In Progress");
    for (const i of inProgress) {
      sections.push(`- #${i.number}: ${i.title}`);
    }
  }

  // Next task (top priority)
  const priorities = m.status?.priorities || [];
  if (priorities[0]) {
    const t = priorities[0];
    const labels = t.labels.length ? ` [${t.labels.join(", ")}]` : "";
    sections.push(`\n## Next Task\n#${t.number}: ${t.title}${labels}`);
  }

  // Blockers
  const blocked = (m.status?.issues || []).filter(
    (i) =>
      i.state === "open" &&
      i.labels.some(
        (l) => l.toLowerCase().includes("blocked") || l.toLowerCase().includes("blocker")
      )
  );
  if (blocked.length) {
    sections.push("\n## Blockers");
    for (const i of blocked) {
      sections.push(`- #${i.number}: ${i.title}`);
    }
  }

  // Recent commits (last 3)
  if (m.git?.recent_commits?.length) {
    sections.push("\n## Recent Commits");
    for (const c of m.git.recent_commits.slice(0, 3)) {
      sections.push(`- ${c}`);
    }
  }

  sections.push("\nFor full context: `codebase brief`");
  return sections.join("\n");
}
