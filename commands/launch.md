---
description: Gates on open bugs, runs test suite + world-class score check, generates release notes, creates GitHub release, merges develop to main.
argument-hint: [--version X.Y.Z] [--dry-run]
model: sonnet
allowed-tools: Agent, Bash(gh:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git checkout:*), Bash(git pull:*), Bash(git fetch:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git tag:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(git merge:*), Bash(npx:*), Bash(npm:*), Bash(node:*), Read, Write, Edit, Glob, Grep
---

# /launch

Release manager. Gate on open bugs, generate all release artifacts, create a GitHub release, merge to main.

Branch flow: `develop` → `main`.

## Arguments

```
$ARGUMENTS
```

- `--version X.Y.Z` — override version tag (default: auto-increment from latest tag)
- `--dry-run` — run all gates and generate artifacts, do NOT create release or merge

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

Read the brief. Extract: `project.name`, `project.description`, `commands.test`, `quality.test_framework`.

Read `docs/PRODUCT.md` before generating any artifact. Fetch highlights data from the Highlights Index GitHub Issue.

---

## Phase 0 — Gate Check

All gates must pass. Any blocking failure exits.

### Gate 1a — No open critical or high bugs

```bash
gh issue list --label "bug,critical" --state open --limit 10 --json number,title
gh issue list --label "bug,high"     --state open --limit 10 --json number,title
```

If any exist → print list, exit with "BLOCKED".

### Gate 1b — Test suite passes

Use `commands.test` from codebase brief. Fall back to package.json/pyproject.toml detection.

```bash
TEST_CMD=$(node -e "try{const b=require('/tmp/cb-brief.json');console.log(b.commands?.test||'')}catch{}" 2>/dev/null)
[ -z "$TEST_CMD" ] && TEST_CMD="npm test"
```

Run test suite. If failures → print last 10 lines, exit "BLOCKED".

If no test files exist: warn (not blocking) — "No tests found. Run /review --test to generate them."

### Gate 1c — World-class score ≥ 7.0

Read the most recent `[Sim]` cycle issue body. Parse world-class scores.

If average < 7.0 → exit "BLOCKED". If no data → warn only.

### Gate 2 — Carry bugs (warning, not blocking)

List open carry bugs — they appear in release notes as known issues.

### Gate 3 — Branch clean and current

```bash
git fetch origin
git status --short
git log HEAD..origin/develop --oneline
```

If uncommitted changes → exit "BLOCKED: commit or stash all changes first."
If behind remote → exit "BLOCKED: git pull origin develop".

Print gate summary:
```
LAUNCH GATES
════════════════════════════════════════════════════════
Gate 1a — Critical/high bugs:   PASS (0 open)
Gate 1b — Test suite:           [PASS | FAIL | WARNING: no tests]
Gate 1c — World-class score:    [PASS (N/10) | FAIL (N/10 < 7.0) | WARNING]
Gate 2  — Carry bugs:           [PASS | WARNING: N open]
Gate 3  — Branch clean:         PASS
All blocking gates passed. Proceeding.
════════════════════════════════════════════════════════
```

---

## Phase 1 — Version

```bash
LATEST=$(git tag --sort=-version:refname | head -1)
```

- `--version X.Y.Z` passed → use it
- No tags → `v0.1.0`
- Tags exist → increment patch

---

## Phase 2 — Release Notes

Generate `docs/RELEASE-NOTES.md`:
- **What's New** — closed `[Arch]` issues since last tag
- **Bug Fixes** — closed `bug,sim` issues
- **Improvements** — UX/content improvements
- **Known Issues** — open carry bugs + open arch issues (honest, never omit)

---

## Phase 3 — Create GitHub Release

```bash
# Always sync before tagging
git fetch origin
git checkout develop && git pull origin develop
git tag -a [version] -m "Release [version]"
git push origin [version]

gh release create [version] \
  --title "v[version]" \
  --notes-file docs/RELEASE-NOTES.md
```

If `--dry-run`: print what would be created, skip.

---

## Phase 4 — Merge to Main

```bash
git checkout main && git pull origin main
git merge develop --no-ff -m "Release [version]"
git push origin main
git checkout develop
```

If `--dry-run`: print what would happen, skip.

---

## Phase 5 — Milestone rotation

Load `.vibekit/milestone.env`. Close current milestone. Create next (increment minor: v0.1 → v0.2).

---

## Phase 6 — Refresh codebase manifest

```bash
npx codebase scan-only --quiet --sync
```

This updates `.codebase.json` with the new release tag so `codebase brief` reflects the released version.

---

## Phase 7 — Summary

```
/launch COMPLETE
════════════════════════════════════════════════════════
Version:        [version]
Release date:   [date]
GitHub release: [URL]

Artifacts:
  docs/RELEASE-NOTES.md

develop → main:  merged
Tag [version]:   pushed
Milestone:       [v0.1 closed → v0.2 created]
.codebase.json:  refreshed

[If --dry-run: DRY RUN — no release, no merge]
════════════════════════════════════════════════════════
```

---

## Ground Rules

1. **Gates 1a/1b/1c failures always block** — no exceptions
2. **Grounded release notes** — every item traceable to a closed GitHub Issue
3. **main is production** — merging to main is the last step, only via /launch
4. **Dry-run is safe** — never touches git history or creates releases
5. **Honest known issues** — never omit carry bugs or open arch from release notes
6. **No force push ever** — use `git revert` to undo commits
7. **No direct push to main** — only the merge step in Phase 4 touches main

## Branch Convention (reference)

```
main          protected — only /launch merges here
develop       integration branch — all work lands here
feat/<slug>   new features        (→ PR to develop)
fix/<slug>    bug fixes            (→ PR to develop)
chore/<slug>  maintenance          (→ PR to develop)
hotfix/<slug> urgent prod fixes    (→ PR to develop, then /launch fast-track)
docs/<slug>   documentation only   (→ PR to develop)
test/<slug>   test additions       (→ PR to develop)
```
