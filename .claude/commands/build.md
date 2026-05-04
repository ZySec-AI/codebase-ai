---
description: Autonomous development loop — builds arch issues, simulates, watches for new issues, repeats until production-ready. Uses codebase context.
argument-hint: [--dry-run] [--issue N] [--once] [--interval N] [--max-rounds N]
model: sonnet
allowed-tools: Agent, Bash(gh:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git checkout:*), Bash(git pull:*), Bash(git fetch:*), Bash(git stash:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git tag:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(git merge:*), Bash(pnpm:*), Bash(npx:*), Bash(npm:*), Bash(node:*), Bash(uv:*), Read, Write, Edit, Glob, Grep
---

# /build

Autonomous development loop. Builds all open `[Arch]` and `vibekit`-labeled issues, runs the test suite, runs a `/simulate` cycle, polls for new issues, repeats until launch gates pass.

Branch: always `develop`. For full arch issues, use a `feat/<slug>` branch → PR → merge to develop.

## Arguments

```
$ARGUMENTS
```

- *(no flags)* — full autonomous loop: build → test → simulate → poll → repeat
- `--dry-run` — show plan only, no implementation
- `--issue N` — implement only issue #N, then exit
- `--once` — build all open arch issues once, then exit (no simulate cycle)
- `--interval N` — polling interval in minutes (default: 5)
- `--max-rounds N` — safety limit (default: 20)

---

## Prerequisites

```bash
gh auth status || { echo "ERROR: gh auth login first."; exit 1; }
git remote get-url origin || { echo "ERROR: No git remote."; exit 1; }
```

### Load codebase project intelligence

```bash
npx codebase brief 2>/dev/null > /tmp/cb-brief.json || true
if [ ! -s /tmp/cb-brief.json ]; then
  echo "WARNING: codebase brief failed or returned empty — proceeding with defaults"
fi
```

Read `/tmp/cb-brief.json`. Extract:
- `commands.test` — use this as the test command (fallback to package.json detection)
- `commands.dev` — dev server start command
- `stack.frameworks`, `stack.languages` — implementation context
- `patterns.architecture` — follow existing patterns
- `quality.test_framework` — confirms test runner

Read `docs/PRODUCT.md` before evaluating any issue. If missing → print "Run /setup first." and exit.

Load dev login path:
```bash
DEV_LOGIN_PATH=""
[ -f ".vibekit/repo.env" ] && DEV_LOGIN_PATH=$(grep "DEV_LOGIN_PATH" .vibekit/repo.env 2>/dev/null | cut -d= -f2)
```

### Detect test runner

Prefer `commands.test` from codebase brief. Fall back to package.json/pyproject.toml detection.

### Label check

```bash
gh label list --limit 1 --json name --jq '.[0].name' 2>/dev/null | grep -q "sim" || {
  echo "Labels not found — run /setup first."; exit 1;
}
```

---

## Phase 0 — Orientation

Parse flags from `$ARGUMENTS`. Surface the build queue:

```bash
npx codebase next 2>/dev/null || true
```

Auto-triage unlabeled open issues:
```bash
UNLABELED=$(gh issue list --state open --json number,labels --jq '[.[] | select(.labels | length == 0)] | .[].number')
for N in $UNLABELED; do
  gh issue edit $N --add-label "arch"
done
```

Read `CLAUDE.md` if present — follow its conventions exactly.

Print orientation banner:
```
BUILD LOOP — ROUND [R] of [max-rounds]
════════════════════════════════════════════════════
  Project:     [name from brief]
  Stack:       [frameworks from brief]
  Test runner: [commands.test]
  Open arch:   [N] issues
  Open bugs:   [N] issues
  Mode:        [full | --once | --issue N | --dry-run]
════════════════════════════════════════════════════
```

If `--dry-run`: print the issue queue and exit.

---

## Phase 1 — Plan

Fetch the build queue — issues labeled `arch` or `vibekit`, state `open`, sorted by priority:

```bash
QUEUE=$(gh issue list --label "arch" --label "vibekit" --state open --json number,title,labels --jq 'sort_by(.number) | .[]')
```

If `--issue N` was passed, filter to that single issue.

For each issue in the queue:
1. Read the full issue body: `gh issue view [N] --json body --jq '.body'`
2. Identify affected files from the issue body or `mapped_files` from `codebase next`
3. Add to the implementation plan

If queue is empty: print "No arch/vibekit issues found. Nothing to build." and exit.

---

## Phase 2 — Implement (per issue)

For each issue in the plan, execute this sequence.

> **Traceability contract — every issue must follow this:**
> 1. **Start** with `update_issue` (add `status:in-progress`) AND a `comment` so the timeline shows you started.
> 2. **During work**, post `comment_issue { kind: "evidence" }` for any non-trivial intermediate finding (failed test → fix, design decision, scope change).
> 3. **Before close**, call `link_commits_to_issue { number: N }` to attach the SHAs that implemented the fix.
> 4. **Close** with `close_issue` — `comment` and `reason` are now REQUIRED, plus `evidence` and `commits` whenever you have them. Never close via raw `gh issue close` — it bypasses the audit trail.
> 5. The MCP server records the active prompt id on every call, so the chain `prompt → status comment → commits → close` is reconstructible.

### 2a. Sync and branch

```bash
git fetch origin
git status --short  # abort if dirty
git checkout develop && git pull origin develop
```

For significant changes (arch issues): create a feature branch.
For small fixes (< 50 lines): commit directly to develop.

```bash
SLUG=$(echo "[issue title]" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | cut -c1-40)
git checkout -b feat/${SLUG}
```

### 2b. Announce + read

Post a status comment so the timeline shows you've started:

```
update_issue {
  number: N,
  add_labels: ["status:in-progress"],
  comment: "Picking this up. Plan: <one-line summary>."
}
```

Then:

1. Re-read the issue body for acceptance criteria
2. Pull the originating prompt(s) so you understand the user's intent: `get_prompt_history { issue: N, limit: 5 }`
3. Read all affected files identified in Phase 1
4. Read `CLAUDE.md` conventions — follow them exactly
5. Check `patterns.architecture` from brief — match existing patterns

### 2c. Implement

Write the code. Follow these rules:
- One issue per implementation — never batch
- Match existing code style (indentation, naming, patterns)
- Add tests if the project has a test framework (`quality.test_framework` from brief)
- No over-engineering — solve exactly what the issue asks

### 2d. Verify

Run the test suite:
```bash
TEST_CMD=$(node -e "try{const b=require('/tmp/cb-brief.json');console.log(b.commands?.test||'')}catch{}" 2>/dev/null)
[ -z "$TEST_CMD" ] && TEST_CMD="npm test"
$TEST_CMD
```

If tests fail: fix the implementation, re-run. Do not proceed with failing tests.

If the project has a running dev server and agent-browser is available, verify via browser:
```bash
agent-browser open http://localhost:[port]
agent-browser snapshot -i
# Navigate to the affected page, verify the change works
agent-browser screenshot
```

### 2e. Commit and close

For feature branches:
```bash
git add [specific files only]
git commit -m "feat(#[N]): [short description]

[1-2 sentence description]
Closes #[N]"
git push origin feat/${SLUG}

gh pr create --base develop --head feat/${SLUG} \
  --title "feat(#[N]): [short description]" \
  --body "## What
[description]

## Test evidence
[test output or screenshot]

Closes #[N]"

# Wait for PR, then clean up
git checkout develop && git pull origin develop
git branch -d feat/${SLUG} 2>/dev/null || true
```

For direct develop commits:
```bash
git add [specific files only]
git commit -m "fix(#[N]): [short description]

Closes #[N]"
git push origin develop
```

### 2e-1. Link the commits to the issue

Before closing, attach commit SHAs to the issue timeline so the audit chain is searchable:

```
link_commits_to_issue { number: N }
```

(MCP scans the last 50 commits, picks any whose subject references `#N`, and posts a single consolidated `evidence` comment. If you used a non-default branch range, pass `since: "main..HEAD"`.)

### 2e-2. Close with the structured contract

Always close via MCP — never raw `gh issue close`. The MCP tool requires a comment, a reason, and ideally evidence + commits, then posts the closing comment AND closes in one atomic call:

```
close_issue {
  number: N,
  reason: "fixed",
  comment: "<one-line summary of what changed>",
  evidence: "<test output / before-after / verification steps>",
  commits: ["<short-sha-1>", "<short-sha-2>"]
}
```

If MCP is unavailable for some reason, the CLI fallback is `npx codebase issue close N --reason "..."` — but it's strictly inferior because it can't capture commits/evidence in one call.

**Traceability checklist before you close:**

- [ ] `update_issue` posted a `status:in-progress` comment when work began
- [ ] All non-trivial intermediate findings posted via `comment_issue { kind: "evidence" }`
- [ ] `link_commits_to_issue` attached the commit SHAs
- [ ] `close_issue` includes `reason`, `comment`, `evidence`, `commits`
- [ ] You did NOT call `gh issue close` directly

Refresh manifest:
```bash
npx codebase scan-only --incremental --quiet --sync
```

### 2f. Repeat

Return to Phase 2a for the next issue in the queue.

---

## Phase 3 — Simulate (full loop mode only)

Skip if `--once` or `--issue N` was passed.

On even rounds: invoke `/simulate --journey-only` (quick verification).
On odd rounds: invoke `/simulate` (full UX audit + journeys).

If `/simulate` creates new bug issues, they enter the queue for the next round.

---

## Phase 4 — Poll and Loop

Skip if `--once` or `--issue N` was passed.

```bash
npx codebase scan-only --quiet --sync
```

Check for new issues:
```bash
NEW=$(gh issue list --label "arch" --label "vibekit" --state open --json number --jq 'length')
```

Check launch readiness:
```bash
BUGS=$(gh issue list --label "bug" --state open --json number --jq 'length')
```

If `$NEW == 0` and `$BUGS == 0`: print "All issues resolved. Ready for /launch." and exit.
If round >= `--max-rounds`: print "Max rounds reached. Stopping." and exit.
Otherwise: increment round counter, return to Phase 1.

---

## Phase 5 — Summary

```
/build COMPLETE — [R] rounds
════════════════════════════════════════════════════
  Issues implemented: [N]
  Issues remaining:   [N]
  Tests:              [pass/fail]
  Simulate cycles:    [N]

  [If all clear: "Ready for /launch"]
  [If issues remain: "Run /build again or /launch --dry-run to check gates"]
════════════════════════════════════════════════════
```

---

## Ground Rules

1. **One issue, one commit** — never batch unrelated changes
2. **Tests must pass** — do not close an issue with failing tests
3. **Follow CLAUDE.md** — project conventions are law
4. **Feature branches for arch** — small fixes can go to develop directly
5. **Atomic commits** — `git add [specific files]`, never `git add .`
6. **No force push** — use `git revert` to undo
7. **Refresh manifest after every close** — keeps `codebase next` current
8. **Read the issue body** — acceptance criteria are in the body, not just the title
