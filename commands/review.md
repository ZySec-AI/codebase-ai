---
description: Code review (security, quality, deps health, UI/accessibility) + test generation. Outputs GitHub Issues. Uses codebase context.
argument-hint: [--security] [--quality] [--deps] [--ui] [--test] [--pr N] [--fix]
model: sonnet
allowed-tools: Agent, Bash(gh:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git checkout:*), Bash(git pull:*), Bash(git fetch:*), Bash(git stash:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(npx:*), Bash(npm:*), Bash(node:*), Bash(python:*), Bash(python3:*), Bash(pnpm:*), Bash(uv:*), Bash(pip:*), Read, Write, Edit, Glob, Grep
---

# /review

Security, quality, dependency health, accessibility review + test generation. Every finding becomes a GitHub Issue. Powered by `codebase` project intelligence.

Branch: `develop` for read-only review. For `--fix`: use a `fix/<slug>` branch → PR → merge to develop.

## Arguments

```
$ARGUMENTS
```

- `--security` — OWASP top 10, dependency CVEs, secrets in code, auth/authz
- `--quality` — convention adherence (CLAUDE.md), dead code, lint, complexity, duplication
- `--deps` — outdated/vulnerable packages, suggest updates
- `--ui` — accessibility (contrast, ARIA, keyboard nav), responsive issues
- `--test` — generate and run persistent test suites for untested code
- `--test --unit` / `--integration` / `--e2e` / `--coverage` / `--for "feature"` — test scope
- `--pr N` — scope review to changes in PR #N
- `--fix` — auto-fix fixable quality, deps, UI issues, commit to develop
- *(no flags)* — runs all: security + quality + deps + ui

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

Read the brief. Extract and use throughout:
- `stack.languages`, `stack.frameworks` — language-specific review rules
- `dependencies.notable`, `dependencies.direct_count` — dependency surface
- `quality.linter`, `quality.formatter`, `quality.test_framework` — tooling
- `quality.pre_commit_hooks` — hook coverage
- `patterns.architecture`, `patterns.api_style` — architecture context
- `config.env_vars` — identify secrets/sensitive config exposure

Read `CLAUDE.md` if present — conventions drive the quality dimension.
Read `docs/PRODUCT.md` if present — product context informs security review (roles, auth model, data sensitivity).

### Ensure `review` label exists

```bash
gh label create "review" --color "6f42c1" --description "From a /review audit" 2>/dev/null || true
```

---

## Review Workflow

Follow the complete `/vb-review` workflow across all phases:

- **Phase 0** — Scope (`--pr N` or full codebase)
- **Phase 1** — Security Review (OWASP top 10, CVEs, secrets, auth/authz)
- **Phase 2** — Quality Review (CLAUDE.md conventions, dead code, lint, complexity, defensive programming, minimal code)
- **Phase 2b** — Dead Code Declutter (stack-aware — runs `/py-declutter` for Python, `/nextjs-declutter` for Next.js)
- **Phase 3** — Dependency Health (outdated, vulnerable, alternatives)
- **Phase 4** — UI/Accessibility (contrast, ARIA, keyboard, responsive)
- **Phase 5** — Consolidate & prioritize
- **Phase 6** — Create GitHub Issues (one per finding, labeled `review,[severity],[dimension]`)
- **Phase 7** — Auto-fix (if `--fix`) + commit
- **Phase 8** — Summary

### codebase integration points

**Use brief data to skip re-scanning what codebase already knows:**

```bash
# Instead of re-detecting test framework:
TEST_FRAMEWORK=$(node -e "try{const b=require('/tmp/cb-brief.json');console.log(b.quality?.test_framework||'')}catch{}" 2>/dev/null)

# Instead of re-detecting linter:
LINTER=$(node -e "try{const b=require('/tmp/cb-brief.json');console.log(b.quality?.linter||'')}catch{}" 2>/dev/null)

# Get dependency count for scope estimate:
DEPS=$(node -e "try{const b=require('/tmp/cb-brief.json');console.log(b.dependencies?.direct_count||0)}catch{}" 2>/dev/null)
```

**Issue creation** — after creating a GitHub Issue, also track in codebase:
```bash
npx codebase issue create "[title]" --message "[body summary]" 2>/dev/null || true
npx codebase scan-only --incremental --quiet --sync
```

**Pre-work sync:**
```bash
git fetch origin
git status  # abort if dirty
git checkout develop && git pull origin develop
```

**Commit convention (if `--fix`):**

For each finding, use an isolated branch:
```bash
SLUG=$(echo "[finding title]" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | cut -c1-40)
git checkout -b fix/${SLUG}

git add [specific files only]
git commit -m "fix([dim]): [short description]

/review --fix | Severity: [sev] | Dimension: [dim]
Closes #[N]"
git push origin fix/${SLUG}

gh pr create \
  --base develop \
  --head fix/${SLUG} \
  --title "fix(#[N]): [short description]" \
  --body "## Finding
[description]

## Fix
[what was changed]

Severity: [sev] | Closes #[N]"
```

After PR merge: `git checkout develop && git pull origin develop && git branch -d fix/${SLUG}`

Print scope banner:
```
REVIEW SCOPE
════════════════════════════════════════════════════════
Project:       [name from brief]
Stack:         [frameworks from brief]
Source files:  [N]
Dependencies:  [direct_count from brief]
Test framework:[quality.test_framework]
Linter:        [quality.linter]
Dimensions:    [security | quality | ui | all]
Auto-fix:      [yes | no]
════════════════════════════════════════════════════════
```

All other behavior (security agent prompts, CVE research, accessibility checks, test generation) follows the `/vb-review` specification exactly.

---

## Phase 2b — Dead Code Declutter (Stack-Aware)

After the quality review, detect the project stack from the brief and run the appropriate declutter skill if installed. This is automatic — no flags needed.

### Detection logic

```bash
# Read stack from brief (already loaded in Phase 0)
LANGUAGES=$(node -e "try{const b=require('/tmp/cb-brief.json');console.log((b.stack?.languages||[]).join(','))}catch{}" 2>/dev/null)
FRAMEWORKS=$(node -e "try{const b=require('/tmp/cb-brief.json');console.log((b.stack?.frameworks||[]).join(','))}catch{}" 2>/dev/null)
```

### Dispatch rules

| Condition | Action |
|-----------|--------|
| `LANGUAGES` contains `python` | Run `/py-declutter` |
| `FRAMEWORKS` contains `next` or `nextjs` | Run `/nextjs-declutter` |
| Both match | Run both sequentially (Python first, then Next.js) |
| Neither matches | Skip Phase 2b — log: "No declutter skill matches this stack" |

### Execution

When a matching skill is detected:
1. Call `list_skills` via MCP (or `codebase skills` via bash) to confirm the skill is installed
2. Read the skill's SKILL.md to understand its workflow (the skill file is at `~/.claude/skills/<name>.skill`)
3. Follow the workflow defined in SKILL.md using the tools available in the /review context (Agent, Bash, Read, Write, Edit, Glob, Grep)
4. For Python skills: run the analysis scripts via `Bash(python:*)`
5. For Node.js skills: run the analysis scripts via `Bash(node:*)`
6. Findings with confidence <80% are reported as GitHub Issues (labeled `review,quality,dead-code`)
7. Findings with confidence >=80% are auto-removed if `--fix` is active, otherwise reported as issues
8. After the skill completes, include its KPI summary (files removed, lines eliminated, functions cleaned) in the Phase 8 summary

### If skill is not installed

If the matching skill file is not found in `~/.claude/skills/`, log:
```
  Skill [name] not installed — run: codebase setup
```
Then continue to Phase 3. Do not fail the review.

---

## Phase 2 — Quality Review (Extended Rules)

The quality agent must check the following **in addition** to the base `/vb-review` quality rules.

### Defensive Programming

Check every function, method, and handler for:

- **Missing guard clauses** — function body has deep nesting where an early return/throw would flatten it. Flag any function with 3+ levels of nesting that could use guard clauses.
- **Missing input validation at boundaries** — functions that accept external input (API params, user input, env vars, CLI args, file reads) without validating type, range, or presence before use.
- **Unchecked null/undefined** — property access on values that could be null/undefined without a prior check (e.g. `user.name` where `user` could be null).
- **Silent failures** — empty `catch` blocks, `.catch(() => {})`, swallowed errors with no logging or rethrow. Every error boundary must either handle, log, or rethrow.
- **Missing error handling at I/O boundaries** — file reads, network calls, subprocess exec, DB queries with no error handling.
- **Optimistic assumptions** — code that assumes an array is non-empty before indexing, assumes a map key exists before accessing, or assumes an async call always resolves.
- **No fail-fast** — configuration or required env vars read lazily (mid-request) instead of validated at startup, so failures surface late and with poor context.

Severity guide:
- `high` — missing validation on external input, unchecked null on a hot path, silent catch hiding errors
- `medium` — deep nesting fixable with guard clauses, missing fail-fast for config
- `low` — optimistic array/map access in low-risk paths

### Minimal Code

Check for over-engineering and unnecessary complexity:

- **YAGNI violations** — abstractions, interfaces, config options, or generics added for hypothetical future use that have exactly one concrete caller/case today.
- **Premature abstraction** — a helper/utility/class created for code used in only one place. Three similar lines of code is better than a one-use abstraction.
- **Over-parameterization** — functions with options objects or boolean flags that only ever receive the same values. Flags that were never flipped from their default since they were added.
- **Unnecessary indirection** — wrapper functions that do nothing but call another function with the same signature.
- **Dead feature flags** — flags/toggles that are always `true` or always `false` in all environments; can just be removed.
- **Backwards-compatibility shims for internal code** — deprecated aliases, re-exports, or `_unused` renames for code that has no external consumers.
- **Excessive comments explaining obvious code** — comments that restate what the code already says clearly (e.g. `// increment counter` above `count++`). Flag only; do not auto-fix.
- **Over-engineered error messages** — error classes with elaborate hierarchies for a project that throws 2-3 distinct error types.

Severity guide:
- `medium` — YAGNI abstractions, over-parameterization, unnecessary indirection
- `low` — dead flags, excessive comments, minor shims

### Code Simplicity Principles

- **Flat over nested** — prefer early returns, guard clauses, and linear flow over pyramid/callback-hell structures.
- **Explicit over clever** — flag code that uses obscure language tricks, complex one-liners, or metaprogramming where a simple loop/condition would be clearer.
- **Consistent patterns** — same operation done differently in 2+ places (e.g. one place uses `?.` optional chaining, another uses explicit null check for the same pattern). Flag the inconsistency; suggest unifying to the simpler form.
- **Functions do one thing** — flag functions that mix concerns (e.g. validate + transform + persist in one function body >30 lines with no clear single responsibility).

Severity guide:
- `medium` — mixed concerns in large functions, inconsistent patterns across the codebase
- `low` — clever one-liners, minor style inconsistencies

### Auto-fixable vs Architectural

- **Auto-fixable (`--fix`)**: guard clause refactors (simple cases), removing empty catch blocks (replace with `// TODO: handle error`), removing dead flags set to constant values, removing unused re-exports.
- **Architectural (create issue, no auto-fix)**: adding input validation that requires schema/type decisions, restructuring mixed-concern functions, replacing premature abstractions (requires understanding callers).
