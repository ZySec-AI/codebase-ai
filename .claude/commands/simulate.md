---
description: Customer journeys (agent-browser) + UX audit (9 dimensions, 3 iterations). Fixes all bugs inline. Outputs GitHub Issues. Uses codebase context.
argument-hint: [country] [industry] [--count N] [--iterations N] [--cx-only] [--journey-only]
model: sonnet
allowed-tools: Agent, Bash(gh:*), Bash(pnpm:*), Bash(npx:*), Bash(npm:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git checkout:*), Bash(git pull:*), Bash(git fetch:*), Bash(git stash:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(node:*), Bash(curl:*), Bash(uv:*), Read, Write, Edit, Glob, Grep
---

# /simulate

Simulate real customers via agent-browser, perform a deep UX audit, fix everything fixable inline, and track all output in GitHub Issues. Powered by `codebase` project intelligence.

Runs indefinitely (Ctrl+C to stop). Branch: always `develop`. All inline fixes go directly to `develop` as atomic commits (one commit per fix).

> **Traceability contract** (applies to every issue this command touches):
> - Use MCP `create_issue` for new findings — include `## Triggering Prompt` and `## Acceptance` sections in the body. Pull the prompt via `get_prompt_history { since: "1h", limit: 5 }` if needed.
> - Use MCP `comment_issue { kind: "evidence" }` to attach screenshots, journey logs, before/after.
> - Never close an issue with raw `gh issue close`. If `/simulate` resolved a bug inline, close it via `close_issue { reason: "fixed", comment, evidence, commits }`.

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
if [ ! -s /tmp/cb-brief.json ]; then
  echo "WARNING: codebase brief failed or returned empty — proceeding with defaults"
fi
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

Node projects: use detected package manager from brief:
```bash
PKG_MGR=$(node -e "try{const b=require('/tmp/cb-brief.json');console.log(b.stack?.package_manager||'npm')}catch{}" 2>/dev/null || echo "npm")
```
Python: `uv run dev` or `uv run uvicorn main:app`.

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

## Phase 1 — Customer Journeys

Skip if `--cx-only` was passed.

### 1a. Generate customer profiles

For each of `--count N` customers (default 3), generate a realistic persona:
- **Name, role, company** — from roles in `docs/PRODUCT.md`
- **Country** — from `$ARGUMENTS` or random if not specified
- **Goals** — 3-5 tasks this persona would do in the app (derived from PRODUCT.md role tasks)
- **Tech comfort** — varies (some savvy, some not)

### 1b. Run each journey sequentially

For each customer, run a browser session via agent-browser:

```bash
# Sync before starting
git fetch origin && git checkout develop && git pull origin develop

# Start browser session
agent-browser open http://localhost:[port]
agent-browser snapshot -i  # accessibility tree → @e1, @e2 refs
```

**Login** using the detected mechanism from Phase 0:
```bash
agent-browser auth login [role]  # if saved
# OR navigate to login page and fill credentials from PRODUCT.md
```

**Execute each goal** as a sequence of browser actions:
1. Navigate to the relevant page
2. `agent-browser snapshot -i` to read the accessibility tree
3. Interact: `click @eN`, `fill @eN "value"`, navigate
4. After each action, `snapshot -i` again to verify state changed
5. `agent-browser screenshot` to capture evidence

**Triage findings** during the journey:

| Severity | Criteria | Action |
|----------|----------|--------|
| `critical` | App crash, data loss, security hole, blank page | Create issue immediately |
| `high` | Feature broken, workflow blocked, wrong data shown | Create issue immediately |
| `medium` | UI glitch, slow load, confusing UX, missing feedback | Create issue, fix inline if < 30 min |
| `low` | Cosmetic, minor copy, alignment | Create issue, fix inline if < 10 min |

**Inline fix flow** (for fixable bugs):
1. Read the source file causing the bug
2. Fix it
3. Verify the fix via browser (`snapshot -i` → confirm change)
4. Commit atomically:
```bash
git add [specific files only]
git commit -m "fix([severity]): [short description]

Simulation cycle [N] — [role] at [company]
Page: [route]
Closes #[issue-N if exists]"
git push origin develop
npx codebase scan-only --incremental --quiet --sync
```

**Create GitHub issues** for everything found — use the MCP `create_issue` tool, NOT raw `gh issue create`. The MCP path threads the trace footer + prompt id, so the audit chain stays intact.

```
create_issue {
  title: "[Sim] <severity>: <description>",
  labels: ["bug", "<severity>", "sim"],
  body: `## Bug Report
**Cycle:** <N>
**Customer:** <name> (<role> at <company>)
**Page:** <route>

## Triggering Prompt
<paste the prompt id and snippet from get_prompt_history { since: "1h", limit: 5 }>

## Acceptance
- [ ] <observable outcome that proves the fix>
- [ ] <regression test or screenshot diff>

**Steps to reproduce:**
1. <step>
2. <step>

**Expected:** <what should happen>
**Actual:** <what happened>
**Screenshot:** <attached or described>
**Fixed inline:** <yes/no — if yes, commit SHA>`
}
```

If you fixed the bug inline in this same `/simulate` run, follow up with `link_commits_to_issue { number: <N> }` and then `close_issue { number: <N>, reason: "fixed", comment, evidence, commits }`. Never call `gh issue close` directly.

### 1c. Session log

After each customer journey, write an HTML session log to `.vibekit/sessions/cycle-[N]-[role].html` with all screenshots, accessibility trees, and actions taken.

---

## Phase 2 — UX Audit

Skip if `--journey-only` was passed.

### 2a. Page inventory

Crawl the app to build a page list:
```bash
agent-browser open http://localhost:[port]
agent-browser snapshot -i
```
Navigate each link in the accessibility tree. Build a list of all unique routes.

### 2b. Audit each page across 9 dimensions

For each page, evaluate:

| # | Dimension | What to check |
|---|-----------|---------------|
| 1 | **Visual hierarchy** | Clear heading structure, logical reading order, emphasis on primary actions |
| 2 | **Navigation** | Breadcrumbs, back buttons, consistent nav, no dead ends |
| 3 | **Forms & input** | Labels, validation messages, error recovery, tab order |
| 4 | **Feedback** | Loading states, success/error messages, progress indicators |
| 5 | **Accessibility** | Contrast ratios, ARIA labels, keyboard navigation, screen reader text |
| 6 | **Responsive** | Layout at different viewport widths (if testable) |
| 7 | **Content** | Spelling, grammar, placeholder text, missing copy |
| 8 | **Performance** | Perceived speed, unnecessary spinners, layout shift |
| 9 | **Consistency** | Same patterns used across pages, no style drift |

Score each dimension 1-10. Repeat for `--iterations N` passes (default 3), improving scores each pass by fixing what you can inline.

### 2c. Fix and commit

Same inline fix flow as Phase 1. One commit per fix, push to develop.

---

## Phase 3 — Performance Audit

Quick performance check on the top 5 most-visited pages:
1. Navigate to each page
2. Note perceived load time (fast/medium/slow)
3. Check for layout shifts (`snapshot -i` before and after full load)
4. Check for unnecessary network requests if visible in page behavior

Create issues for any `medium` or `slow` pages with label `performance,sim`.

---

## Phase 4 — Dedup

Before creating the cycle summary, deduplicate findings:
```bash
EXISTING=$(gh issue list --label "sim" --state open --json title --jq '.[].title')
```
Skip creating any issue whose title matches an existing open issue (fuzzy — same key words).

---

## Phase 5 — GitHub Output

### 5a. Create cycle parent issue

Use MCP `create_issue` so the parent issue carries the trace footer:

```
create_issue {
  title: "[Sim] Cycle <N> — <date>",
  labels: ["cycle", "sim"],
  body: `## Simulation Cycle <N>

**Date:** <ISO date>
**Customers:** <count>
**Bugs found:** <N> (critical: <N>, high: <N>, medium: <N>, low: <N>)
**Fixed inline:** <N>
**Issues created:** <list of #numbers>

### UX Audit Scores
| Dimension | Score |
|-----------|-------|
| Visual hierarchy | [N]/10 |
| Navigation | [N]/10 |
| Forms & input | [N]/10 |
| Feedback | [N]/10 |
| Accessibility | [N]/10 |
| Responsive | [N]/10 |
| Content | [N]/10 |
| Performance | [N]/10 |
| Consistency | [N]/10 |
| **Average** | **[N]/10** |

### Highlights
<Notable positive findings — things working well>

### Session Logs
<Links to .vibekit/sessions/ HTML files>`
}
```

### 5b. Update Highlights Index

Find the Highlights Index issue and append new highlights:
```bash
HIGHLIGHTS_N=$(gh issue list --label "highlight" --state all --limit 1 --json number --jq '.[0].number // empty')
if [ -n "$HIGHLIGHTS_N" ]; then
  gh issue comment $HIGHLIGHTS_N --body "## Cycle [N] Highlights
[list of positive findings]"
fi
```

---

## Phase 6 — Refresh

```bash
npx codebase scan-only --quiet --sync
```

---

## Phase 7 — Loop

Print cycle summary:
```
CYCLE [N] COMPLETE
════════════════════════════════════════════════════
  Bugs found:      [N]
  Fixed inline:    [N]
  Issues created:  [N]
  UX average:      [N]/10
  Carry bugs:      [N]
════════════════════════════════════════════════════
```

If running in continuous mode (no `--journey-only` or `--cx-only`): increment cycle number, return to Phase 0 preflight.

Otherwise: exit.

---

## Ground Rules

1. **One fix, one commit** — never batch unrelated changes
2. **`git add [specific files]`** — never `git add .`
3. **Always push to develop** — no feature branches for inline fixes
4. **Create issues for everything** — even things you fix, so there's a record
5. **No force push** — use `git revert` to undo
6. **Read PRODUCT.md** — personas and roles come from there, never hardcoded
7. **Sequential browser sessions** — one tab at a time, no parallel navigation
8. **Screenshot evidence** — every bug needs visual proof
9. **Dedup before creating** — don't file duplicate issues
10. **Refresh manifest after every fix** — keeps `codebase next` current

## Browser Automation Reference (agent-browser)

```bash
agent-browser open <url>           # navigate to URL
agent-browser snapshot -i          # accessibility tree → @e1, @e2 element refs
agent-browser click @e1            # click element
agent-browser fill @e2 "text"      # type into input
agent-browser screenshot           # capture current page
agent-browser auth save <profile>  # save auth state
agent-browser auth login <profile> # restore auth state
agent-browser state save <name>    # save page state
agent-browser state load <name>    # restore page state
```
