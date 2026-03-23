---
description: Bootstrap a project for the /simulate → /build → /launch loop. Run once per project.
argument-hint: [--auto] [--refresh]
model: sonnet
allowed-tools: Bash(gh:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git checkout:*), Bash(git pull:*), Bash(git fetch:*), Bash(git status:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(git remote:*), Bash(node:*), Bash(npx:*), Bash(npm:*), Bash(brew:*), Bash(curl:*), Bash(chmod:*), Read, Write, Edit, Glob, Grep
---

# /setup

Bootstrap this project for the codebase + vibekit development loop. Run once when starting on a new project.

## Arguments

```
$ARGUMENTS
```

- `--auto` — generate PRODUCT.md entirely from codebase scan, zero questions. Marks uncertain sections with `[INFERRED]`.
- `--refresh` — re-scan codebase, diff against existing PRODUCT.md, propose updates for stale sections.

---

## Step 1 — Prerequisites

```bash
node --version     2>/dev/null || echo "MISSING: install Node.js 18+"
claude --version   2>/dev/null || echo "MISSING: npm install -g @anthropic-ai/claude-code"
gh --version       2>/dev/null || echo "MISSING: brew install gh"
gh auth status     2>/dev/null || echo "NOT AUTHENTICATED: gh auth login"
git remote get-url origin 2>/dev/null || echo "NO REMOTE: git remote add origin <url>"
agent-browser --version 2>/dev/null || {
  echo "Installing agent-browser..."
  npm install -g agent-browser && agent-browser install
}
```

Print status table:
```
PREREQUISITE CHECK
══════════════════════════════════════
Node.js:       [OK vX.X.X | MISSING]
Claude Code:   [OK vX.X.X | MISSING]
gh CLI:        [OK vX.X.X | MISSING]
gh auth:       [OK | NOT AUTHENTICATED]
git remote:    [OK | MISSING]
agent-browser: [OK | installed now]
══════════════════════════════════════
```

Stop if any prerequisite is missing. Do not proceed until all are resolved.

---

## Step 2 — codebase init

Run the full codebase setup to generate `.codebase.json`, wire AI tools, and install git hooks:

```bash
npx codebase setup --sync 2>/dev/null || npx codebase init --sync
```

This installs:
- `.codebase.json` manifest
- `CLAUDE.md` injection
- `post-commit` hook (auto-updates manifest)
- `commit-msg` hook (blocks direct commits to main/master)
- `.claude/hooks/git-guard.sh` (PreToolUse — blocks unsafe git ops in Claude)
- `.claude/hooks/git-post.sh` (PostToolUse — PR reminder after branch push)
- `.claude/settings.json` (wires Claude Code hooks)
- `.gitignore` entries

Print: `codebase manifest: generated`

---

## Step 2b — Project Structure Standardisation

Scaffold the standard project structure. **Never overwrite existing files or directories.**

For each path, only create if it does not already exist:

```bash
# Directories
mkdir -p docs src/core src/modules src/interfaces tests scripts

# README.md — only if missing
[ -f README.md ] || cat > README.md << 'EOF'
# [Project Name]

[What this project does — 1-2 sentences.]

## Getting Started

```bash
# install dependencies
# run the project
```

## Development

```bash
# build
# test
# lint
```
EOF

# .env.example — only if missing and no .env exists
[ -f .env.example ] || [ -f .env ] || cat > .env.example << 'EOF'
# Required environment variables
# Copy to .env and fill in values

# APP_PORT=3000
# DATABASE_URL=
# SECRET_KEY=
EOF

# docs/ARCHITECTURE.md — only if missing
[ -f docs/ARCHITECTURE.md ] || cat > docs/ARCHITECTURE.md << 'EOF'
# Architecture

## System Overview

[High-level description of how the system works.]

## Key Components

| Component | Purpose |
|---|---|
| `src/core/` | Business logic |
| `src/modules/` | Feature modules |
| `src/interfaces/` | Contracts, APIs, types |

## Data Flow

[Describe the main request/data flow through the system.]

## Key Design Decisions

[Document architectural decisions and their rationale here.]
EOF

# docs/IMPLEMENTATION.md — only if missing
[ -f docs/IMPLEMENTATION.md ] || cat > docs/IMPLEMENTATION.md << 'EOF'
# Implementation Guide

## Code Organisation

[How the source code is structured and why.]

## Patterns & Conventions

[Coding patterns, naming conventions, module rules.]

## Adding Features

[Step-by-step guide for contributing new functionality.]

## Common Tasks

[Runbook for frequent development tasks.]
EOF
```

Print a structure report:
```
PROJECT STRUCTURE
══════════════════════════════════════
docs/                [created | exists]
  ARCHITECTURE.md    [created | exists]
  IMPLEMENTATION.md  [created | exists]
  PRODUCT.md         [pending — Step 6]
src/core/            [created | exists]
src/modules/         [created | exists]
src/interfaces/      [created | exists]
tests/               [created | exists]
scripts/             [created | exists]
README.md            [created | exists]
.env.example         [created | exists | skipped — .env present]
══════════════════════════════════════
```

**Rules:**
- Never delete or overwrite anything that already exists
- If the project has a non-standard structure (e.g. `app/` instead of `src/`), adapt the report but do not force-rename existing dirs
- Add any newly created paths to the Step 8 commit

---

## Step 3 — GitHub labels

```bash
for label in \
  "bug:d73a4a:Something isn't working" \
  "arch:0075ca:Architectural change needed" \
  "sim:e4e669:Found by simulation" \
  "carry:ff6b35:Bug surviving 2+ cycles" \
  "cycle:c5def5:Simulation cycle summary" \
  "critical:b60205:Critical severity" \
  "high:d93f0b:High severity" \
  "medium:e99695:Medium severity" \
  "low:fef2c0:Low severity" \
  "highlight:0e8a16:Positive product signal" \
  "vibekit:7057ff:Queued for autonomous build" \
  "performance:ff8c00:Performance issue" \
  "review:6f42c1:From a code review"; do
  NAME=$(echo "$label" | cut -d: -f1)
  COLOR=$(echo "$label" | cut -d: -f2)
  DESC=$(echo "$label" | cut -d: -f3-)
  gh label list --json name --jq '.[].name' 2>/dev/null | grep -q "^${NAME}$" || \
    gh label create "$NAME" --color "$COLOR" --description "$DESC" 2>/dev/null || true
done
echo "Labels ready"
```

---

## Step 4 — Milestone + .vibekit dir

```bash
mkdir -p .vibekit
[ -f ".vibekit/milestone.env" ] && source .vibekit/milestone.env || true

if [ -z "${MILESTONE_NUMBER:-}" ]; then
  REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null)
  MS_NUM=$(gh api "repos/${REPO}/milestones" -X POST \
    -f title="v0.1" -f state="open" \
    -f description="First release — managed by codebase" \
    --jq '.number' 2>/dev/null || echo "")
  if [ -n "$MS_NUM" ]; then
    echo "MILESTONE_NUMBER=${MS_NUM}" > .vibekit/milestone.env
    echo "MILESTONE_TITLE=v0.1" >> .vibekit/milestone.env
    echo "Milestone v0.1 created (#${MS_NUM})"
  fi
fi
```

Add `.vibekit/` entries to `.gitignore` (lock/log files only):
```bash
grep -q "build.lock" .gitignore 2>/dev/null || printf "\n.vibekit/build.lock\n" >> .gitignore
```

---

## Step 5 — Highlights Index issue

```bash
EXISTING=$(gh issue list --search "Highlights Index" --state all --limit 1 --json number --jq '.[0].number // empty' 2>/dev/null)
if [ -z "$EXISTING" ]; then
  gh issue create \
    --title "Highlights Index" \
    --label "highlight" \
    --body "# Product Highlights Index

Tracks positive signals from /simulate cycles. Updated automatically — do not edit manually.

## Index
<!-- /simulate appends here -->"
  echo "Highlights Index issue created"
else
  echo "Highlights Index already exists (#$EXISTING)"
fi
```

---

## Step 6 — Docs (PRODUCT.md, ARCHITECTURE.md, IMPLEMENTATION.md)

Use `codebase brief` as the primary source of project intelligence:

```bash
npx codebase brief 2>/dev/null > /tmp/cb-brief.json || true
```

Read the brief. If `docs/PRODUCT.md` exists and `--refresh` not passed: show diff of stale sections, ask user to confirm updates.

Otherwise generate `docs/PRODUCT.md` from (note: filename is all-caps `PRODUCT.md`):
- `project.name`, `project.description` → Summary
- `stack.languages`, `stack.frameworks`, `commands.*` → Tech Stack (auto-filled)
- `patterns.architecture`, `patterns.api_style` → Context
- Route/page file scan → infer User Roles
- `repo.url` → links

Mark genuinely unknown sections with `[INFERRED: ...]`.

**Never hardcode example industries, roles, or countries** — infer from codebase or ask the user.

---

## Step 7 — CLAUDE.md (last — reads everything set up above)

Write (or update) `CLAUDE.md` for this specific project. At this point all other setup steps are complete — read `.codebase.json`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION.md`, and the full project structure before writing, so CLAUDE.md accurately reflects the final state of the project.

**If `CLAUDE.md` already exists:** read it first. Preserve any existing sections. Only update the `<!-- codebase:start -->...<!-- codebase:end -->` block and add missing sections without removing human-authored content.

**If `CLAUDE.md` does not exist:** generate it from scratch.

The file must include these sections, tailored to the actual project:

### Project Overview
One paragraph describing what the project does, who it's for, and its current state (alpha/beta/production).

### Build & Development Commands
Exact commands from `.codebase.json` → `commands.*`. Include build, dev, test, lint, typecheck.

### Architecture
How the codebase is structured — key directories, entry points, data flow. Pull from `docs/ARCHITECTURE.md` if it was populated, otherwise infer from `structure`, `patterns`, and file scanning. Be specific, not generic.

### Key Conventions
Language/framework conventions detected. Coding patterns observed. Things an AI must know to not break the codebase (e.g. "zero runtime dependencies", "no cross-module state", "all DB calls go through /lib/db").

### Current Status
From `.codebase.json` → `status`: open issues count, any blockers, active milestone. One short paragraph.

### Vibekit Workflow
Always include this verbatim at the end (before the codebase injection block):

```markdown
## Vibekit Workflow

```
/simulate → /build → /launch
```

- `/simulate` — Playwright customer journeys find & fix bugs inline. Creates GitHub issues for arch problems.
- `/build` — Implements architectural issues autonomously. Runs until all `arch`+`vibekit` issues are closed.
- `/launch` — Gates on open bugs, generates GTM artifacts, creates GitHub release, merges to main.

### Browser Automation (agent-browser)

Commands: `open <url>`, `snapshot -i` (→ `@e1`/`@e2` refs), `click @e1`, `fill @e2 "text"`, `screenshot`, `auth save/login <profile>`, `state save/load <name>`.
```

After writing CLAUDE.md, re-run the codebase injection to ensure the context block is up to date:

```bash
npx codebase init --quiet 2>/dev/null || true
```

---

## Step 8 — Commit

```bash
git checkout develop 2>/dev/null || git checkout -b develop
git add docs/PRODUCT.md docs/ARCHITECTURE.md docs/IMPLEMENTATION.md CLAUDE.md README.md .env.example .vibekit/ .gitignore src/ tests/ scripts/ 2>/dev/null || true
git diff --cached --quiet || git commit -m "chore: bootstrap codebase + vibekit setup

Initialized by /setup"
```

---

## Step 9 — Summary

```
/setup COMPLETE
══════════════════════════════════════════════════
.codebase.json:      generated
GitHub labels:       13 ready
Milestone:           v0.1 (#N)
Highlights Index:    #N
docs/PRODUCT.md:     [generated | updated]
CLAUDE.md:           [generated | updated]
Branch:              develop
Claude hooks:        git-guard + git-post active

Branch convention:
  main          protected — only /launch merges here
  develop       integration — all work lands here
  feat/<slug>   new features  → PR to develop
  fix/<slug>    bug fixes     → PR to develop
  chore/<slug>  maintenance   → PR to develop
  hotfix/<slug> urgent fixes  → PR to develop
  docs/<slug>   docs only     → PR to develop
  test/<slug>   tests only    → PR to develop

Commit format:
  feat(#N): short description
  fix(#N):  short description
  chore:    short description
  docs:     short description

Next steps:
  1. Review docs/PRODUCT.md — fill in [INFERRED] sections
  2. /simulate    — AI customer journeys find & fix bugs
  3. /build       — implement architectural issues
  4. /launch      — gate check, release, merge to main
══════════════════════════════════════════════════
```
