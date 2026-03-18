---
description: Autonomous development loop — builds arch issues, simulates, watches for new issues, repeats until production-ready. Uses codebase context.
argument-hint: [--dry-run] [--issue N] [--once] [--interval N] [--max-rounds N]
model: sonnet
allowed-tools: Agent, Bash(gh:*), Bash(git:*), Bash(pnpm:*), Bash(npx:*), Bash(npm:*), Bash(node:*), Bash(uv:*), Read, Write, Edit, Glob, Grep
---

# /build

Autonomous development loop. Builds all open `[Arch]` and `vibekit`-labeled issues, runs the test suite, runs a `/simulate` cycle, polls for new issues, repeats until launch gates pass.

Branch: always `develop`. Never create feature branches.

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

Load project board config, define `add_to_project()` helper, parse flags, auto-triage unlabeled issues — all exactly as in `/vb-build`.

For the implementation plan, use `codebase next` to surface the highest-priority item first:
```bash
npx codebase next 2>/dev/null || true
```

---

## Phases 1–4 — Implementation Loop

Follow the complete `/vb-build` workflow:

- **Phase 0.5** — Mode selection, approval banner
- **Phase 1** — Plan (read issues, wait for approval, dry-run exit)
- **Phase 2** — Implement (read → implement → verify via Playwright → commit → close)
- **Phase 3** — Carry-forward resolution
- **Phase 4** — Summary

### codebase integration points

**Before implementing each issue**, get fresh context:
```bash
npx codebase brief 2>/dev/null > /tmp/cb-brief.json || true
```

Read `CLAUDE.md` if present — follow its conventions exactly.

**Commit format** (codebase git convention):
```bash
git checkout develop && git pull origin develop
git add [specific files changed]
git commit -m "feat: [short description]

Implements #[N]
[1-2 sentence description of what was built]"
git push origin develop
```

**After closing each issue**, update the manifest so `codebase next` stays current:
```bash
npx codebase scan-only --incremental --quiet --sync
```

**When closing an issue via gh**:
```bash
gh issue close [N] --comment "Implemented in $(git rev-parse --short HEAD). Verified via Playwright."
# Also update codebase issue tracking
npx codebase issue close [N] --reason "Implemented in $(git rev-parse --short HEAD)" 2>/dev/null || true
```

**simulate step** (in full loop mode): invoke `/simulate` with `--journey-only` on even rounds, full on odd rounds.

All other behavior (Playwright verification, project board updates, auto-launch gate, polling) follows the `/vb-build` specification exactly.
