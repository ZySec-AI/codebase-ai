---
description: Project status, metrics, and all GTM/developer artifacts from codebase brief + PRODUCT.md + GitHub highlights.
argument-hint: [--status] [--metrics] [--sales] [--dev] [--investor] [--one-pager]
model: sonnet
allowed-tools: Agent, Bash(gh:*), Bash(git:*), Bash(node:*), Bash(npx:*), Read, Write, Edit, Glob, Grep
---

# /pitch

Generate project status, trend metrics, and all documentation artifacts. Powered by `codebase` project intelligence — no file crawling needed for what the manifest already knows.

Branch: always `develop`.

## Arguments

```
$ARGUMENTS
```

- `--status` — Project state at a glance: issues, gates, recommended next command (read-only)
- `--metrics` — Trend analysis across simulation cycles: bug velocity, severity, carry bugs
- `--metrics --export` — Write `docs/METRICS.md` with Mermaid charts
- `--sales` — GTM: SALES-PLAY.md, PRODUCT-BROCHURE.md, DEMO-SEQUENCE.md
- `--dev` — Developer docs: API-REFERENCE.md, ARCHITECTURE.md, ONBOARDING.md
- `--investor` — PITCH-DECK.md
- `--one-pager` — ONE-PAGER.md
- *(no flags)* — all artifacts (sales + dev + investor + one-pager + PRODUCT-DOCS.md)

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

Read the brief as the **primary source** for all technical facts. This replaces manual codebase scanning for:
- Stack, languages, frameworks → Tech Stack sections
- Commands (dev, build, test, lint) → ONBOARDING.md
- Structure (entry points, tree) → ARCHITECTURE.md
- Patterns (architecture, api_style, key_modules) → system design sections
- Dependencies (notable) → dependency context
- Quality (test_framework, linter, ci) → quality sections
- Config (env_vars) → configuration reference

Read `docs/PRODUCT.md` before generating any artifact.

Fetch Highlights Index (single source of truth for positive signals):
```bash
HIGHLIGHTS_ISSUE=$(gh issue list --search "Highlights Index" --state all --limit 1 --json number --jq '.[0].number // empty' 2>/dev/null)
[ -n "$HIGHLIGHTS_ISSUE" ] && HIGHLIGHTS_DATA=$(gh issue view "$HIGHLIGHTS_ISSUE" --comments --json body,comments \
  --jq '[.body, (.comments[].body)] | join("\n---\n")' 2>/dev/null || echo "")
```

---

## If `--status`: Project Status

Use `codebase status` as the primary data source:
```bash
npx codebase status 2>/dev/null || true
npx codebase next 2>/dev/null || true
```

Supplement with:
```bash
BRANCH="$(git branch --show-current)"
BUG_TOTAL=$(gh issue list --label "bug" --state open --limit 100 --json number --jq 'length' 2>/dev/null || echo "?")
# ... (full status block as in /vb-pitch --status)
```

Print the full status table including RECOMMENDED NEXT based on current state.

Exit after printing. Do not proceed to doc generation.

---

## If `--metrics`: Trend Analysis

Follow the full `/vb-pitch --metrics` workflow. Use brief data for context (test framework, CI setup).

If `--export`: write `docs/METRICS.md` with Mermaid charts, commit to develop.

---

## Doc Generation

### Phase 0 — Codebase Scan

**Use `codebase brief` instead of re-scanning files:**

```bash
# Extract from brief — no globbing needed
ROUTES=$(node -e "
try {
  const b = require('/tmp/cb-brief.json');
  const mods = b.patterns?.key_modules || {};
  console.log(Object.entries(mods).map(([k,v]) => k+': '+v).join('\n'));
} catch {}
" 2>/dev/null)

ENTRY_POINTS=$(node -e "
try {
  const b = require('/tmp/cb-brief.json');
  console.log((b.structure?.entry_points || []).join('\n'));
} catch {}
" 2>/dev/null)

API_STYLE=$(node -e "
try {
  const b = require('/tmp/cb-brief.json');
  console.log(b.patterns?.api_style || '');
} catch {}
" 2>/dev/null)
```

Only glob for files the brief doesn't cover (e.g. specific route handlers for API-REFERENCE.md).

### Phase 1 — Generate Artifacts

Follow the `/vb-pitch` artifact generation exactly:

- `docs/SALES-PLAY.md` (--sales)
- `docs/PRODUCT-BROCHURE.md` (--sales)
- `docs/DEMO-SEQUENCE.md` (--sales)
- `docs/API-REFERENCE.md` (--dev)
- `docs/ARCHITECTURE.md` (--dev) — use `structure.tree` and `patterns` from brief for the Mermaid diagram
- `docs/ONBOARDING.md` (--dev) — use `commands.*` from brief for setup steps
- `docs/PITCH-DECK.md` (--investor)
- `docs/ONE-PAGER.md` (--one-pager)
- `docs/PRODUCT-DOCS.md` (no flags)

### Phase 2 — Commit

```bash
git checkout develop && git pull origin develop
git add docs/ 2>/dev/null || true
git diff --cached --quiet || git commit -m "docs: generate pitch artifacts

/pitch [flags used]
Sources: codebase brief, PRODUCT.md, Highlights Index issue"
git push origin develop
```

### Phase 3 — Refresh manifest

```bash
npx codebase scan-only --quiet --sync
```

### Phase 4 — Summary

```
/pitch COMPLETE
════════════════════════════════════════════════════════
Scope:     [all | sales | dev | investor | one-pager]

Artifacts written:
  [list each file]

Sources used:
  .codebase.json (via codebase brief)  [present]
  docs/PRODUCT.md                       [present]
  Highlights Index (GH Issue)           [N cycle comments | no data]

Committed: [sha] → develop
════════════════════════════════════════════════════════
```

---

## Ground Rules

1. **codebase brief is the truth** — use it for all technical facts, never re-scan what it already knows
2. **Grounded artifacts** — every claim traceable to brief, PRODUCT.md, or Highlights Index
3. **No invented proof points** — if data is missing, say so honestly
4. **Overwrite existing** — regenerate fresh each run
5. **Mermaid for diagrams** — no external image dependencies
6. **One commit** — all artifacts in a single commit
7. **Status is read-only** — `--status` never writes files or creates issues
