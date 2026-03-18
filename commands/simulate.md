---
description: Customer journeys (agent-browser) + UX audit (9 dimensions, 3 iterations). Fixes all bugs inline. Outputs GitHub Issues. Uses codebase context.
argument-hint: [country] [industry] [--count N] [--iterations N] [--cx-only] [--journey-only]
model: sonnet
allowed-tools: Agent, Bash(gh:*), Bash(pnpm:*), Bash(npx:*), Bash(npm:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git checkout:*), Bash(git pull:*), Bash(git fetch:*), Bash(git stash:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(node:*), Bash(curl:*), Bash(uv:*), Read, Write, Edit, Glob, Grep
---

# /simulate

Simulate real customers via agent-browser, perform a deep UX audit, fix everything fixable inline, and track all output in GitHub Issues. Powered by `codebase` project intelligence.

Runs indefinitely (Ctrl+C to stop). Branch: always `develop`. All inline fixes go directly to `develop` as atomic commits (one commit per fix).

---

## Arguments

```
$ARGUMENTS
```

- First positional word(s) → `country` (optional)
- Any industry keyword → `industry` (optional)
- `--count N` — customers per cycle (default: 3)
- `--iterations N` — UX audit iterations (default: 3)
- `--cx-only` — UX audit only, skip journeys
- `--journey-only` — journeys only, skip UX audit

---

## Phase 0 — Preflight

```bash
gh auth status || { echo "ERROR: gh auth login first."; exit 1; }
git remote get-url origin || { echo "ERROR: No git remote."; exit 1; }
gh label list --limit 1 --json name --jq '.[0].name' 2>/dev/null | grep -q "sim" || {
  echo "Labels not found — run /setup first."; exit 1;
}
```

### Load codebase project intelligence

```bash
npx codebase brief 2>/dev/null > /tmp/cb-brief.json || true
```

Read `/tmp/cb-brief.json`. Extract and hold in context:
- `project.name`, `project.description`
- `commands.dev`, `commands.test`, `commands.build`
- `stack.frameworks`, `stack.languages`, `stack.package_manager`
- `patterns.architecture`, `patterns.api_style`
- `git.default_branch` — verify it's `develop`

Load vibekit config:
```bash
[ -f ".vibekit/project.env" ] && source .vibekit/project.env || true
[ -f ".vibekit/milestone.env" ] && source .vibekit/milestone.env || true
```

### Read PRODUCT.md (required)

Read `docs/PRODUCT.md`. If missing → print "Run /setup first." and exit.

Extract: **ICP**, **Roles**, **Role tasks**, **Competitive context**, **Dev credentials**.

**Never hardcode a country or industry list. Always read from PRODUCT.md.**

### Detect cycle number

```bash
LAST=$(gh issue list --label "cycle" --state all --limit 1 --json title --jq '.[0].title // ""')
# Parse N from "[Sim] Cycle N", default 0, set CYCLE_N=$((N+1))
```

Pull carry-forward bugs and open bugs.

### Detect dev server

Try ports 3000, 3001, 5173, 8000, 8080, 4000, 4200, 8888 with a quick curl.

If none respond, use `commands.dev` from codebase brief:
```bash
DEV_CMD=$(node -e "try{const b=require('/tmp/cb-brief.json');console.log(b.commands?.dev||'')}catch{}" 2>/dev/null)
```

Node projects: use detected package manager from brief. Python: `uv run dev` or `uv run uvicorn main:app`.

### Detect login mechanism

1. Check `.vibekit/repo.env` for `DEV_LOGIN_PATH`
2. Scan route files for `dev-login`, `dev_login`, `bypass`, `quick-login`
3. Standard form — seed creds from `docs/PRODUCT.md`
4. OAuth — note and warn

Print preflight summary:
```
PREFLIGHT — CYCLE [N]
══════════════════════════════════════════════════
  Project:        [name from codebase brief]
  Stack:          [frameworks from brief]
  Carry bugs:     [N]
  Open bugs:      [N]
  Server:         http://localhost:[port]
  Login:          [method]
  Customers:      [N]
══════════════════════════════════════════════════
```

---

## Phases 1–7 — Full Simulation Loop

Follow the complete `/vb-simulate` workflow:

- **Phase 1** — Customer Journeys (agent-browser, profile generation, triage, inline fixes)
- **Phase 2** — UX Audit (9 dimensions, 3 iterations, page inventory, IA audit, fixes)
- **Phase 3** — Performance Audit (Core Web Vitals via CDP)
- **Phase 4** — Dedup
- **Phase 5** — GitHub Output ([Sim] Cycle N parent issue, Highlights Index update)
- **Phase 6** — GTM Sync (DEMO-SEQUENCE.md)
- **Phase 7** — Status → Loop

### codebase integration points

**After every inline fix commit**, refresh the manifest so `codebase next` stays current:
```bash
npx codebase scan-only --incremental --quiet --sync
```

**Issue creation** uses the standard `gh issue create` flow. After creating any issue, also run:
```bash
npx codebase issue create "[title]" --message "[body summary]" 2>/dev/null || true
```
This keeps the codebase manifest's issue list in sync.

**Pre-work sync (run once at the start of each cycle):**
```bash
git fetch origin
git status  # if dirty, stash first: git stash
git checkout develop && git pull origin develop
```

**Commit convention — one atomic commit per fix, never batch:**
```bash
git add [specific files only — never git add .]
git commit -m "fix([severity]): [short description]

Simulation cycle [N] — [role] at [company]
Page: [route]
Closes #[issue-N if exists]"
git push origin develop
```

**If working files are dirty before checkout:**
```bash
git stash
git checkout develop && git pull origin develop
git stash pop
```

**After each full cycle** run a fresh scan:
```bash
npx codebase scan-only --quiet --sync
```

Use agent-browser for all browser automation. One sequential browser session per journey — no parallel tabs. Example session:
```bash
agent-browser open http://localhost:[port]
agent-browser snapshot -i              # get @e1, @e2 refs from accessibility tree
agent-browser click @e1
agent-browser fill @e2 "value"
agent-browser screenshot               # capture evidence
```

Auth persistence: `agent-browser auth save <role>` after login, `agent-browser auth login <role>` to restore. State: `agent-browser state save/load <name>` between pages.

All other behavior follows the `/vb-simulate` specification exactly.
