---
name: codebase-orchestrator
description: Master orchestrator for all engineering work on the codebase-ai project. Coordinates engineer, reviewer, qa, and releaser agents to implement features, fix bugs, run reviews, and ship releases. Use for any multi-step development work: feature implementation, bug fix cycles, code review + fix loops, or release preparation. Also handles: re-running any phase, updating after feedback, partial re-execution ("just fix the security issues", "re-review after the fix"). Triggers on: "implement feature", "fix and review", "full dev cycle", "review and fix", "prepare release", "run harness", "run the team", "do a full cycle", "implement issue #N", "ship this", re-run, update, redo any phase.
---

# codebase-orchestrator

Master coordinator for the `codebase-ai` engineering harness. Assembles the right team and runs the right phases based on what's needed.

**Execution mode:** Hybrid — fan-out sub-agents for parallel independent work, agent team for multi-step cycles requiring inter-agent coordination.

## Phase 0: Context Check

Before doing anything, determine the execution mode:

```bash
ls _workspace/ 2>/dev/null && echo "EXISTING" || echo "FRESH"
```

- `_workspace/` exists + user requests partial re-run → **partial re-execution** (skip to relevant phase)
- `_workspace/` exists + new input provided → rename `_workspace/` to `_workspace_prev/`, start fresh
- `_workspace/` absent → **initial run**

Also read the current issue list and PR status:
```bash
npx codebase brief --quiet 2>/dev/null | python3 -c "import sys,json; b=json.load(sys.stdin); print(b.get('status',''))" 2>/dev/null || true
gh issue list --state open --limit 20 --json number,title,labels 2>/dev/null || true
```

## Phase 1: Scope Assessment

Determine which workflow to run based on user request:

| Request pattern | Workflow |
|----------------|---------|
| "implement #N" / "fix #N" / "build feature X" | **Dev Loop** (phases 2A → 3 → 4) |
| "review" / "audit" / "security check" | **Review Loop** (phases 2B → 3 → 4) |
| "full cycle" / "ship" / "release" | **Full Loop** (phases 2A + 2B → 3 → 4 → 5) |
| "release" / "publish" / "/launch" | **Release only** (phase 5) |

For ambiguous requests, default to **Dev Loop** if there are open issues, **Review Loop** if the codebase looks clean.

## Phase 2A: Development (sub-agent mode)

**Execution mode: Sub-agents (parallel implementation)**

For each open issue in scope, spawn an `engineer` sub-agent:

```
Agent({
  description: "Implement issue #N",
  subagent_type: "general-purpose",  // engineer agent definition loaded via .claude/agents/engineer.md
  model: "opus",
  prompt: "Read .claude/agents/engineer.md for your role. Implement GitHub issue #N: [title]. 
           Follow the codebase-engineer skill at .claude/skills/codebase-engineer/SKILL.md.
           When done: build, test, typecheck must all pass. Report: branch, files changed, test results."
})
```

Issues with dependencies must be serialized (check issue labels for blockers).

**Output:** Save each engineer's result to `_workspace/02a_engineer_issue_N.md`

## Phase 2B: Review (sub-agent mode)

**Execution mode: Sub-agents (parallel review dimensions)**

Spawn reviewer sub-agents for each dimension in parallel:

```
Agent({
  description: "Security review",
  model: "opus",
  run_in_background: true,
  prompt: "Read .claude/agents/reviewer.md for your role. Run security review only.
           Follow .claude/skills/codebase-reviewer/SKILL.md.
           Create GitHub Issues for P1/P2 findings. Report: issue numbers created, critical findings."
})
```

Spawn three agents simultaneously: security, quality, graph/deps.

**Output:** Save consolidated findings to `_workspace/02b_review_findings.md`

## Phase 3: QA Validation (agent team)

**Execution mode: Agent team (engineer + qa coordinating)**

After Phase 2A completes, spawn a 2-person team:

```
TeamCreate({
  team_name: "qa-validation",
  members: [
    { name: "engineer", agent: "engineer", model: "opus" },
    { name: "qa", agent: "qa", model: "opus" }
  ]
})
```

The `qa` agent runs boundary checks and messages `engineer` directly with any failures. `engineer` fixes and re-notifies `qa`. Loop until `qa` confirms all checks pass.

**Exit condition:** `qa` agent sends "all checks pass" message + build/test results

**Output:** Save to `_workspace/03_qa_report.md`

## Phase 4: Review-Fix Integration

If Phase 2B produced P1/P2 findings AND Phase 2A was also run:

1. Message `engineer` (if still active) with the P1/P2 issue numbers to fix
2. After fixes, trigger `qa` validation again (Phase 3)
3. If Phase 2A was not run (review-only), leave P1/P2 issues open for the next dev cycle

If only P3/P4 findings: leave as issues, do not block.

## Phase 5: Release (sub-agent mode)

**Execution mode: Sub-agent (single releaser)**

Only run when explicitly requested or when Full Loop is confirmed.

```
Agent({
  description: "Release new version",
  model: "opus",
  prompt: "Read .claude/agents/releaser.md for your role. 
           Follow .claude/skills/codebase-releaser/SKILL.md.
           Run full pre-flight checks. Report results BEFORE publishing — wait for confirmation.
           Only proceed with publish if pre-flight is clean."
})
```

The releaser must pause after pre-flight and surface results before publishing.

**Output:** Save to `_workspace/05_release_result.md`

## Error Handling

- **Build failure in Phase 2A**: engineer retries once. If still failing, save error to `_workspace/02a_engineer_issue_N_BLOCKED.md` and continue with other issues. Report blocked issues in final summary.
- **P1 security finding in Phase 2B**: immediately notify engineer (don't wait for Phase 4). Block release phase until fixed.
- **QA loop exceeds 3 iterations**: escalate to user with specific failing check — do not loop forever.
- **Release pre-flight failure**: stop, report which check failed, do not publish.

## Final Summary

After all phases complete, output:
- Issues implemented (with PR links)
- Review findings created (with issue numbers)
- QA status (pass/fail + details)
- Release status (published version or blocked reason)
- `_workspace/` files preserved for audit

## Test Scenarios

**Normal flow (dev + review):**
> "Implement issue #5 and run a security review"
→ Phase 0 (fresh) → Phase 1 (Dev Loop + Review) → Phase 2A (engineer) + Phase 2B (reviewer, parallel) → Phase 3 (qa team) → Phase 4 (fix P1s) → Summary

**Review only:**
> "Run a full code audit"
→ Phase 0 → Phase 1 (Review Loop) → Phase 2B → Summary

**Error flow:**
> "Implement #7" but #7 depends on #6 which is still open
→ Phase 0 → Phase 1 → Phase 2A detects dependency → reports blocked, asks user whether to implement #6 first
