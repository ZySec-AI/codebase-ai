---
description: Code review (security, quality, deps health, UI/accessibility) + test generation. Outputs GitHub Issues. Uses codebase context.
argument-hint: [--security] [--quality] [--deps] [--ui] [--test] [--pr N] [--fix]
model: sonnet
allowed-tools: Agent, Bash(gh:*), Bash(git:*), Bash(npx:*), Bash(npm:*), Bash(node:*), Bash(pnpm:*), Bash(uv:*), Bash(pip:*), Read, Write, Edit, Glob, Grep
---

# /review

Security, quality, dependency health, accessibility review + test generation. Every finding becomes a GitHub Issue. Powered by `codebase` project intelligence.

Branch: always `develop`.

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
- **Phase 2** — Quality Review (CLAUDE.md conventions, dead code, lint, complexity)
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

**Commit format** (if `--fix`):
```bash
git checkout develop && git pull origin develop
git add [specific files]
git commit -m "fix(review): [dimension] — [short description]

/review --fix | Severity: [sev] | Dimension: [dim]"
git push origin develop
```

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

All other behavior (security agent prompts, quality rules, CVE research, accessibility checks, test generation) follows the `/vb-review` specification exactly.
