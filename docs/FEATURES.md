# Features & Capabilities Reference

> Technical reference for engineering teams. Maps every capability to its commands, flags, MCP tools, and implementation.

---

## 1. Project Scanning

| Capability | Command | Flags | MCP Tool | Implementation |
|-----------|---------|-------|----------|----------------|
| Full project scan | `codebase scan` | `--depth`, `--sync`, `--quiet`, `--incremental` | `rescan_project` | `src/scanner/engine.ts` |
| Incremental scan (cache) | `codebase scan --incremental` | `--incremental` | `rescan_project { incremental: true }` | `src/scanner/cache.ts` |
| GitHub-only refresh | `codebase scan --sync` | `--sync` | `refresh_status` | `src/github/sync.ts` |
| First-time setup | `codebase init` | `--sync` | — | `src/commands/init.ts` |

### Detectors (12 parallel, zero-dependency)

| Detector | Category | What it detects | Source files |
|----------|----------|----------------|-------------|
| `project` | Identity | Name, description, README parsing | `src/detectors/project.ts` |
| `repo` | Repository | Git remote, branches, monorepo, workspaces | `src/detectors/repo.ts` |
| `structure` | Layout | Entry points, build output, directory tree | `src/detectors/structure.ts` |
| `stack` | Tech stack | Languages, frameworks, databases, ORMs (12+ languages) | `src/detectors/stack.ts` |
| `commands` | Build system | dev/build/test/lint commands (15+ ecosystems) | `src/detectors/commands.ts` |
| `dependencies` | Dependencies | Direct/dev counts, lock files, notable packages, **licenses** | `src/detectors/dependencies.ts` |
| `config` | Configuration | Env files, config files, feature flags, **secret detection** | `src/detectors/config.ts` |
| `git` | Git activity | Recent commits, committers, uncommitted changes | `src/detectors/git.ts` |
| `quality` | Quality tools | Test frameworks, linters, CI/CD (20+ platforms) | `src/detectors/quality.ts` |
| `patterns` | Architecture | Architecture style, state management, API style, modules | `src/detectors/patterns.ts` |
| `api-docs` | API specs | OpenAPI, GraphQL schemas, gRPC protos, Postman | `src/detectors/api-docs.ts` |
| `graph` | Call graph | Node/edge counts, languages, staleness of `.codebase/graph.json` | `src/detectors/graph.ts` |

---

## 2. Secret Detection

| Capability | How to use | Output |
|-----------|-----------|--------|
| Scan for leaked secrets | Automatic during `codebase scan` | `_secret_warnings` in config section |
| Detection patterns | 20+ regex patterns | AWS keys, GitHub tokens, Stripe, Slack, private keys, DB URLs, Google API keys, Anthropic keys, OpenAI keys, SendGrid, Twilio, generic api_key/secret_key assignments |
| Value safety | Values are never written to manifest | Only type, file, and line number reported |

**Implementation:** `src/utils/secrets.ts` → integrated into `src/detectors/config.ts`

**Scanned files:** `.env*`, `*.json`, `*.yaml`, `*.yml`, `*.toml`, `*.ini`, `*.cfg` (up to 20 files, max 100KB each)

---

## 3. License Detection

| Capability | How to use | Output |
|-----------|-----------|--------|
| Detect project license | Automatic during `codebase scan` | `dependencies.licenses.project_license` |
| Flag copyleft licenses | Automatic | `dependencies.licenses.copyleft_flags[]` |

**Copyleft licenses detected:** GPL-2.0, GPL-3.0, AGPL-3.0, LGPL-2.x/3.x, MPL-2.0, CDDL, EPL, EUPL, CPAL, OSL

**Implementation:** `src/detectors/dependencies.ts` → `detectLicenses()` function

---

## 4. Context & Intelligence

| Capability | Command | MCP Tool | Flags |
|-----------|---------|----------|-------|
| Full project briefing | `codebase brief` | `project_brief` | `--slim`, `--format json`, `--categories` |
| Auto-slim for large manifests | Automatic | `project_brief` (auto when grade D) | — |
| Token budget report | `codebase tokens` | `token_budget` | — |
| Per-section token breakdown | — | `token_budget` | — |
| Field query | `codebase query <path>` | `query_codebase` | `--force` (plain text) |
| Category read | — | `get_codebase` | `category`, `fields` |
| Next task | `codebase next` | `get_next_task` | — |
| Blockers | — | `get_blockers` | — |

### Token Grading

| Grade | Tokens | Action |
|-------|--------|--------|
| A | < 2,000 | Healthy |
| B | < 4,000 | Normal |
| C | < 8,000 | Prefer targeted queries |
| D | > 8,000 | Auto-slim, use `--slim` |

---

## 5. GitHub Integration

| Capability | Command | MCP Tool | Implementation |
|-----------|---------|----------|----------------|
| Sync issues/PRs/milestones | `codebase scan --sync` | `rescan_project { sync: true }` | `src/github/sync.ts` |
| Create issue | `codebase issue create "title"` | `create_issue` | `src/github/issues.ts` |
| Close issue | `codebase issue close <n> --reason "why"` | `close_issue` | `src/github/issues.ts` |
| Update issue labels | — | `update_issue` | `src/mcp/server.ts` |
| Get issue detail | — | `get_issue` | `src/mcp/server.ts` |
| Get PR detail | — | `get_pr` | `src/mcp/server.ts` |
| Kanban board | `codebase status` | — | `src/github/sync.ts` |
| Priority ranking | `codebase next` | `get_next_task` | `src/github/sync.ts` |
| Milestone tracking | `codebase status` | — | `src/github/sync.ts` |

### Resilience Features

| Feature | How it works | Implementation |
|---------|-------------|----------------|
| Circuit breaker | Opens after 5 failures, auto-recovers after 60s | `src/utils/circuit-breaker.ts` |
| Exponential backoff | Retries transient errors with jitter (2 attempts) | `src/utils/retry.ts` |
| Graceful fallback | Falls back to cached manifest on API failure | `src/github/graphql.ts` |
| Rate limit detection | Pre-flight check requires >10 remaining requests | `src/github/graphql.ts` |

---

## 6. AI Tool Integration

| Capability | Command | What it does |
|-----------|---------|-------------|
| Wire into Claude Code | `codebase init` | CLAUDE.md injection, MCP config, git hooks |
| Full vibekit setup | `codebase setup` | Init + slash commands + skills + hooks + agent-browser |
| MCP server | `codebase mcp` | JSON-RPC 2.0 over stdio, 18 tools |
| Session-start hook | Automatic | Auto-refreshes manifest on new Claude session |
| Context injection | Automatic | Slim brief injected on first prompt per session |

### Integration Points

| Integration | File | Markers |
|------------|------|---------|
| CLAUDE.md | `CLAUDE.md` | `<!-- codebase:start -->` / `<!-- codebase:end -->` |
| MCP server | `.mcp.json` | `{ "mcpServers": { "codebase": { ... } } }` |
| Git hooks | `.git/hooks/` | post-commit, pre-commit, post-checkout, commit-msg |
| Claude hooks | `.claude/hooks/` | git-guard.sh, git-post.sh, session-start.sh, context-inject.sh |
| Settings | `.claude/settings.json` | PreToolUse, PostToolUse, UserPromptSubmit hooks |

---

## 7. Autonomous Loop

| Command | Phase | What it does |
|---------|-------|-------------|
| `/setup` | Bootstrap | Create labels, milestone, PRODUCT.md |
| `/simulate` | Test | Browser journeys via agent-browser, UX audit (9 dimensions × 3 iterations) |
| `/build` | Implement | Pick top issue → implement → test → commit → close → repeat |
| `/launch` | Release | Gate check → version bump → tag → merge develop→main → GitHub Release |
| `/vibeloop` | All | Continuous simulate → build → launch, zero intervention |
| `/review` | Audit | Security (OWASP), quality, deps health, accessibility |

### Vibeloop Options

| Flag | Default | Description |
|------|---------|-------------|
| `--skip-launch` | — | Stop before release |
| `--dry-run` | — | Full run without committing |
| `--max-rounds` | 20 | Cap build loop iterations |
| `--sim-count` | 3 | Simulated users per cycle |
| `--version` | auto | Pin release version |

---

## 8. Skills

Skills extend `/review` with stack-specific analysis. Installed to `~/.claude/skills/` and `.claude/skills/`.

| Skill | Purpose | Auto-triggered for |
|-------|---------|-------------------|
| `py-declutter` | Python dead code elimination via AST | Python projects |
| `nextjs-declutter` | Next.js dead code via import graph | Next.js projects |
| `arch-review` | 5-expert architecture review (3 cycles) | Any project |
| `security-review` | OWASP-aligned security audit | Any project |
| `self-heal` | Auto-assemble expert team matched to stack | Any project |
| `simulate` | Browser-based customer journeys | Projects with dev server |
| `cx-review` | Customer experience review via browser | Projects with dev server |
| `dx-review` | Developer experience review | Any project |
| `rust-review` | Rust-specific architecture review | Rust projects |
| `expert-panel` | Multi-cycle expert panel simulation | Any project |
| `vibeloop` | Autonomous loop orchestration | Any project |

---

## 9. Diagnostics & Health

| Capability | Command | What it checks |
|-----------|---------|---------------|
| Health check | `codebase doctor` | Manifest freshness, detector coverage, GitHub CLI, AI tool injection, MCP config, git hooks, Claude hooks, `.gitignore`, TOKEN HEALTH |
| Auto-repair | `codebase fix` | Re-scans, re-injects, reconfigures MCP, reinstalls hooks |
| Session transfer | `codebase handoff` | Generates HANDOFF.md with git state, issues, blockers |
| Provider config | `codebase config` | Show/set API keys, custom endpoints |
| Session history | `codebase sessions` | Recent Claude Code sessions (provider, model, duration) |

---

## 10. Call/Import Graph

Persistent blast-radius analysis. Zero new runtime deps — regex AST-lite parsers for TS/JS, Python, Go, Rust. Graph stored at `.codebase/graph.json` (gitignored, separate from the 10KB manifest).

| Capability | Command | MCP Tool | Implementation |
|-----------|---------|----------|----------------|
| Full graph build | `codebase graph build` | `rebuild_graph` | `src/graph/engine.ts` |
| Incremental update | `codebase graph update` | `rebuild_graph { incremental: true }` | `src/graph/incremental.ts` |
| Blast radius (files) | `codebase graph impact <file...>` | `get_impact_radius { files }` | `src/graph/query.ts` |
| Blast radius (PR) | `codebase graph impact --pr N` | `get_impact_radius { pr }` | `src/graph/query.ts` |
| Callers of a symbol | `codebase graph query callers <sym>` | `query_graph { kind: "callers" }` | `src/graph/query.ts` |
| Tests covering a file | `codebase graph query tests <file>` | `query_graph { kind: "tests" }` | `src/graph/query.ts` |
| Entry points | `codebase graph query entrypoints` | `query_graph { kind: "entrypoints" }` | `src/graph/entrypoints.ts` |
| Graph statistics | `codebase graph stats` | — | `src/commands/graph.ts` |
| Minimal review context | — | `get_review_context { files, token_budget }` | `src/mcp/server.ts` |

**Languages:** TypeScript, JavaScript, Python, Go, Rust

**`/review` integration:** Phase 0 uses `get_review_context` to scope PR reviews; Phase 2b uses `query_graph` for dead-code detection; Phase 5 enriches issues with caller/test counts; Phase 7 blocks unsafe auto-fix if callers are outside scope.

**No configuration required.** Run `codebase graph build` once. The `graph` detector includes slim metadata in the manifest automatically on next scan.

---

## 11. Cleanup

| Capability | Command | Flags | What it removes |
|-----------|---------|-------|----------------|
| Uninstall | `codebase uninstall --force` | `--force` (required) | `.codebase.json`, CLAUDE.md injection, `.claude/hooks/`, `.claude/skills/` (project), `.claude/commands/` (codebase), `.claude/settings.json` hooks, `.mcp.json` entry, git hooks, `.vibekit/`, `HANDOFF.md`, `PLAN.md`, `.gitignore` entries |

**Not removed:** Global skills (`~/.claude/skills/`), global commands (`~/.claude/commands/`), docs/PRODUCT.md, CLAUDE.md itself (only the injection block).

---

## Complete Command Reference

```
codebase                      # Interactive launcher (default)
codebase start                # Same, explicit
codebase init                 # First-time setup
codebase setup                # Full vibekit setup
codebase scan                 # Refresh manifest
codebase scan --sync          # Refresh + GitHub
codebase scan --incremental   # Cache-aware refresh
codebase brief                # Full briefing
codebase brief --slim         # ~20-line brief
codebase next                 # Next priority task
codebase status               # Kanban board
codebase query <path>         # Field query
codebase issue create "title" # Create issue
codebase issue close <n>      # Close issue
codebase handoff              # Session transfer
codebase tokens               # Token budget
codebase doctor               # Health check
codebase fix                  # Auto-repair
codebase skills               # List skills
codebase config               # Show/set config
codebase sessions             # Session history
codebase mcp                  # MCP server (stdio)
codebase release              # Gate → release → merge
codebase graph build          # Build call/import graph → .codebase/graph.json
codebase graph update         # Incremental graph update (hash-diff)
codebase graph impact <file>  # Blast radius: callers + covering tests + risk score
codebase graph impact --pr N  # Blast radius for PR N's changed files
codebase graph query callers <sym>     # Callers of a symbol
codebase graph query callees <sym>     # Callees of a symbol
codebase graph query tests <file>      # Tests covering a file
codebase graph query entrypoints       # All detected entry points
codebase graph stats          # Node/edge counts per language
codebase uninstall --force    # Remove all artifacts
```

## Complete MCP Tool Reference (22 tools)

```
project_brief       — Full briefing (slim: true for compact, auto-slims when large)
get_codebase        — Category read with sparse field selection
query_codebase      — Dot-path field query
get_next_task       — Highest-priority issue
get_blockers        — Current blockers
create_issue        — Create GitHub issue
close_issue         — Close with reason
update_issue        — Labels, assignee
get_issue           — Issue detail
get_pr              — PR detail
get_plan            — Read PLAN.md
update_plan         — Append to PLAN.md
rescan_project      — Full rescan
refresh_status      — GitHub data refresh (fast)
list_commands       — Slash commands
list_skills         — Installed skills
generate_handoff    — HANDOFF.md
token_budget        — Token count, grade, breakdown, recommendations
get_impact_radius   — Blast radius: transitive callers + covering tests + risk score (files or --pr N)
get_review_context  — Token-budgeted minimal file set for a diff (used by /review Phase 0)
query_graph         — callers | callees | imports | tests | entrypoints for a symbol/file
rebuild_graph       — Full or incremental graph rebuild; returns node/edge counts + duration
```
