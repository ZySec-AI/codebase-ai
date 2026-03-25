---
description: Full autonomous loop — simulate → build → launch, repeating until shipped. Zero intervention required.
argument-hint: [--max-rounds N] [--version X.Y.Z] [--dry-run] [--skip-launch] [--sim-count N]
model: sonnet
allowed-tools: Agent, Bash(gh:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git checkout:*), Bash(git pull:*), Bash(git fetch:*), Bash(git stash:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git tag:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(git merge:*), Bash(pnpm:*), Bash(npx:*), Bash(npm:*), Bash(node:*), Bash(uv:*), Bash(curl:*), Read, Write, Edit, Glob, Grep
---

# /vibeloop

**The single command that does everything.** Runs simulate → build → launch in a fully autonomous loop until your project is shipped. No human intervention required after invocation.

```
/vibeloop                    # full run: simulate → build → launch
/vibeloop --skip-launch      # simulate → build only, stop before release
/vibeloop --dry-run          # full run with --dry-run passed to launch (no actual release/merge)
/vibeloop --max-rounds 5     # cap the build loop at 5 rounds (default: 20)
/vibeloop --sim-count 5      # number of simulated customers per cycle (default: 3)
/vibeloop --version 1.2.0    # pin the release version tag
```

---

## Arguments

```
$ARGUMENTS
```

Parse from `$ARGUMENTS`:
- `--max-rounds N` → cap build loop rounds (default: 20)
- `--version X.Y.Z` → pin release version (passed to /launch)
- `--dry-run` → no commits to main, no GitHub release (passed to /launch)
- `--skip-launch` → stop after build loop, do not release
- `--sim-count N` → customers per simulate cycle (default: 3)

---

## Phase 0 — Preflight

```bash
gh auth status || { echo "ERROR: gh auth login first."; exit 1; }
git remote get-url origin || { echo "ERROR: No git remote."; exit 1; }
gh label list --limit 1 --json name --jq '.[0].name' 2>/dev/null | grep -q "sim" || {
  echo "Labels not found — run /setup first."; exit 1;
}
[ -f "docs/PRODUCT.md" ] || { echo "docs/PRODUCT.md missing — run /setup first."; exit 1; }
```

### Load codebase project intelligence

```bash
npx codebase brief 2>/dev/null > /tmp/cb-brief.json || true
```

Read `/tmp/cb-brief.json`. Extract and hold in context:
- `project.name`, `project.description`
- `commands.dev`, `commands.test`, `commands.build`
- `stack.frameworks`, `stack.languages`, `stack.package_manager`
- `git.default_branch` — verify it's `develop`

Ensure on develop and clean:
```bash
git fetch origin
git checkout develop && git pull origin develop
git status --short  # warn if dirty but don't block
```

Print the startup banner:
```
╔══════════════════════════════════════════════════════════╗
║                    /vibeloop STARTING                    ║
╠══════════════════════════════════════════════════════════╣
║  Project:      [name from brief]                         ║
║  Stack:        [frameworks from brief]                   ║
║  Mode:         simulate → build → launch                 ║
║  Max rounds:   [N]                                       ║
║  Sim customers:[N] per cycle                             ║
║  Launch:       [yes | --skip-launch | --dry-run]         ║
╚══════════════════════════════════════════════════════════╝
```

---

## Phase 1 — Simulate (seed the issue queue)

Run a full simulation cycle to find bugs before building anything.

### 1a. Run customer journeys

Invoke the full `/simulate` logic as a sub-agent:

Use the Agent tool to run one complete simulation cycle (Phase 0 through Phase 6 of /simulate). Pass `--count [sim-count]`. The simulation should:
- Run `[sim-count]` customer journeys against the live dev server
- Perform the 9-dimension UX audit
- Fix all fixable bugs inline with atomic commits
- Create GitHub issues for all findings
- Write the cycle summary issue

When the simulation cycle completes (one full pass), return to this orchestrator.

**Do not run /simulate in its own infinite loop** — vibeloop controls the outer loop. Run exactly one simulate cycle here.

### 1b. Count open issues after simulate

```bash
ARCH=$(gh issue list --label "arch" --state open --json number --jq 'length')
BUGS=$(gh issue list --label "bug" --state open --json number --jq 'length')
```

Print:
```
PHASE 1 COMPLETE — Simulate seeded [N] arch issues, [N] bug issues
```

If `$ARCH == 0` and `$BUGS == 0`:
- Print "No issues found. Project looks clean."
- Skip Phase 2 and proceed directly to Phase 3.

---

## Phase 2 — Build loop

Run the full `/build` loop to resolve all arch and bug issues found by simulate.

### 2a. Outer loop (controlled by vibeloop)

This phase repeats until either:
- All `arch` + `vibekit` labeled issues are closed AND no open `bug` issues remain, OR
- `--max-rounds` is reached

For each round:

**Step 1 — Build all arch/vibekit issues:**

Use the Agent tool to run one full `/build --once` pass (Phase 0 through Phase 2 of /build, then exit). This implements every open `arch`/`vibekit` issue once without running the inner simulate/poll loop — vibeloop controls that loop here.

**Step 2 — Simulate verification:**

Use the Agent tool to run one `/simulate --journey-only --count [sim-count]` cycle (customer journeys only, no full UX audit). This verifies the build didn't break anything and may find new bugs.

**Step 3 — Check gates:**

```bash
npx codebase scan-only --quiet --sync
ARCH=$(gh issue list --label "arch" --state open --json number --jq 'length')
BUGS=$(gh issue list --label "bug,critical" --state open --json number --jq 'length')
BUGS_HIGH=$(gh issue list --label "bug,high" --state open --json number --jq 'length')
```

Print round summary:
```
VIBELOOP ROUND [R] / [max-rounds]
════════════════════════════════════════════════════
  Arch issues remaining:    [N]
  Critical/high bugs:       [N]
  Status:                   [continuing | all clear]
════════════════════════════════════════════════════
```

If `$ARCH == 0` and `$BUGS == 0` and `$BUGS_HIGH == 0`: break loop → proceed to Phase 3.

If round >= `--max-rounds`: print "Max rounds reached. Some issues may remain." → proceed to Phase 3 anyway.

Otherwise: increment round, repeat Step 1.

### 2b. Final full simulate (pre-launch verification)

Before launching, run one final comprehensive simulate cycle:

Use the Agent tool to run one complete `/simulate` cycle (all phases). This is the final QA gate — any bugs found here must be fixed before launch can proceed.

```bash
BUGS=$(gh issue list --label "bug,critical" --state open --json number --jq 'length')
BUGS_HIGH=$(gh issue list --label "bug,high" --state open --json number --jq 'length')
```

If critical or high bugs remain after final simulate:
- Print "Final simulate found blocking bugs. Running one more build pass."
- Return to Phase 2a for one more round (hard cap at 3 extra rounds regardless of --max-rounds).

---

## Phase 3 — Launch

Skip this phase entirely if `--skip-launch` was passed. Print "Skipping launch (--skip-launch). Done." and exit.

### 3a. Pre-launch gate summary

```bash
CRITICAL=$(gh issue list --label "bug,critical" --state open --json number --jq 'length')
HIGH=$(gh issue list --label "bug,high"     --state open --json number --jq 'length')
ARCH=$(gh issue list --label "arch"         --state open --json number --jq 'length')
```

Print:
```
PRE-LAUNCH STATUS
════════════════════════════════════════════════════
  Critical bugs:   [N]    [BLOCKED if > 0]
  High bugs:       [N]    [BLOCKED if > 0]
  Arch issues:     [N]    [WARNING if > 0]
════════════════════════════════════════════════════
```

If `$CRITICAL > 0` or `$HIGH > 0`:
- Print "BLOCKED: Open critical/high bugs prevent launch. Fix them first or run /launch --dry-run to inspect."
- Exit.

### 3b. Execute launch

Use the Agent tool to run the full `/launch` logic (all phases of /launch). Pass:
- `--version [version]` if `--version` was specified
- `--dry-run` if `--dry-run` was specified

The launch sub-agent will:
- Run all gate checks (bugs, tests, UX scores, branch cleanliness)
- Generate `docs/RELEASE-NOTES.md`
- Create the GitHub release and tag
- Merge `develop` → `main`
- Rotate the milestone
- Refresh the codebase manifest

---

## Phase 4 — Final Summary

```
╔══════════════════════════════════════════════════════════╗
║                  /vibeloop COMPLETE                      ║
╠══════════════════════════════════════════════════════════╣
║  Simulate cycles:     [N]                                ║
║  Build rounds:        [N]                                ║
║  Issues implemented:  [N]                                ║
║  Bugs fixed inline:   [N]                                ║
║  Version released:    [vX.Y.Z | --dry-run | skipped]    ║
║  develop → main:      [merged | --dry-run | skipped]    ║
╚══════════════════════════════════════════════════════════╝

Next steps:
  • Check GitHub releases for the release notes
  • Run /vibeloop again next sprint to start a new cycle
  • Use /simulate for targeted UX testing
  • Use /build --issue N to fix a specific issue
```

---

## Ground Rules

1. **One agent per phase** — simulate, build, and launch each run as isolated sub-agents via the Agent tool
2. **vibeloop controls the outer loop** — do not let /build or /simulate run their own infinite loops; vibeloop orchestrates timing
3. **Never force push** — if git state is broken, investigate before acting
4. **Hard stop on launch blockers** — critical/high bugs always block Phase 3, no overrides
5. **Atomic commits throughout** — every fix in every sub-agent must be `git add [specific files]`, never `git add .`
6. **Dry-run is always safe** — `--dry-run` must propagate to all sub-agents and never touch `main` or create releases
7. **Max-rounds is a safety net** — if hit, proceed to launch anyway (with warnings in release notes about remaining issues)
8. **Always on develop** — vibeloop never switches away from develop except for the final merge to main in /launch
