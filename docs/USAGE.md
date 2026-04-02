# Usage

## Quick Start (30 seconds)

```bash
npx codebase-ai          # one command — scans project, wires AI tools, installs hooks
```

That's it. Every AI tool that reads `CLAUDE.md` or `.codebase.json` now understands your project.

For the full autonomous loop (simulate → build → launch):
```bash
codebase setup            # installs slash commands, skills, GitHub labels, PRODUCT.md
```

---

## Quick Reference

```bash
# AI-facing (Claude calls these automatically)
codebase brief                              # full project briefing — run first
codebase next                               # highest-priority task to work on
codebase status                             # kanban board, priorities, milestones
codebase query stack.languages              # query any field by dot-path

# Issues
codebase issue create "Fix auth bug"        # create GitHub issue
codebase issue close 42 --reason "Fixed"    # close with reason
codebase issue list                         # list all issues

# Autonomous loop (slash commands in Claude Code)
/simulate                                   # customer journeys + UX audit
/build                                      # implement issues autonomously
/launch                                     # gate check → release → merge to main
/review                                     # security + quality + deps + accessibility audit

# Skills
codebase skills                             # list installed skills

# Session management
codebase handoff                            # generate HANDOFF.md for session transfer
codebase handoff --message "notes"          # include session notes
codebase tokens                             # token budget report (A/B/C/D grades)
codebase brief --slim                       # lightweight ~20-line brief

# Maintenance
codebase scan                               # refresh .codebase.json (lightweight)
codebase doctor                             # health check (includes TOKEN HEALTH section)
codebase fix                                # auto-repair issues
codebase release                            # gate check → tag → merge develop→main
```

---

## Commands

> **Which command do I use?**
> - `npx codebase-ai` / `codebase init` — first-time setup. Scans your project AND wires AI tools and hooks. Run once per project.
> - `codebase setup` — re-wire only. Reinstalls AI tool configs, slash commands, and hooks without re-scanning the project. Use this when adding a new AI tool or restoring hooks on an already-scanned project.

### `npx codebase-ai` / `codebase init`

Full one-time setup. Scans project, configures AI tools, installs hooks.

```bash
npx codebase-ai                       # complete setup
codebase init --sync                  # include GitHub data
```

**What it does:**
1. Scans project (stack, commands, structure, patterns)
2. Syncs GitHub data (issues, PRs, milestones) if `gh` CLI is available
3. Writes `.codebase.json`
4. Injects into `CLAUDE.md` (commands, rules, maintenance, MCP tools)
5. Configures MCP server in `.mcp.json`
6. Installs git hooks (pre-commit, post-commit, commit-msg)
7. Updates `.gitignore`

---

### `codebase setup`

Full vibekit bootstrap. Runs `init` plus installs the autonomous loop infrastructure.

```bash
codebase setup                        # full setup for autonomous loop
```

**What it adds beyond `init`:**
1. Claude Code hooks (git-guard for branch protection, PR reminders)
2. Session-start hook (`.claude/hooks/session-start.sh`) — auto-refreshes manifest on every new Claude session
3. Slash commands → `.claude/commands/` (/simulate, /build, /launch, /review, /setup)
4. Skills → `.claude/skills/` + `~/.claude/skills/` (py-declutter, nextjs-declutter, arch-review, vibeloop)
5. agent-browser (headless Chrome for /simulate)
6. GitHub labels (bug, arch, sim, critical, high, medium, low, vibekit, etc.)
7. `docs/PRODUCT.md` skeleton (personas, roles, dev credentials)
8. `.vibekit/` directory for loop state

---

### `codebase scan`

Lightweight manifest refresh. Updates `.codebase.json` without touching AI tool configs.

```bash
codebase scan                         # scan current dir
codebase scan --depth 6               # deeper directory tree (default: 4)
codebase scan --quiet                 # no stdout
codebase scan --sync                  # also refresh GitHub data
```

---

### `codebase brief`

Full project briefing. AI agents call this at session start.

```bash
codebase brief                        # everything in one call
codebase brief --slim                 # lightweight ~20-line brief (manifest age, next task, blockers, last commits)
codebase brief --format json          # structured JSON output
codebase brief --categories stack,status  # filter to specific sections
```

Returns: project identity, tech stack, commands, structure, current status (kanban, priorities), next task with body snippet, blockers, milestones, recent decisions, recent commits.

`--slim` returns a concise ~20-line summary ideal for session-start hooks and low-context situations.

---

### `codebase next`

Highest-priority task to work on, with issue body and mapped files.

```bash
codebase next                         # what should I work on?
```

---

### `codebase status`

Kanban board, priorities, and milestones.

```bash
codebase status                       # full project status
codebase status --mine                # only your assigned items
```

---

### `codebase query`

Query any field using dot-path notation.

```bash
codebase query stack.languages            # ["typescript"]
codebase query commands.test              # "npx vitest run"
codebase query commands.test --force      # npx vitest run (plain text, no JSON)

# Run commands directly
codebase query commands.test --force | sh
```

**Common paths:**
- `stack.languages`, `stack.frameworks`, `stack.database`
- `commands.dev`, `commands.test`, `commands.build`, `commands.lint`
- `repo.is_monorepo`, `repo.default_branch`
- `structure.entry_points`, `patterns.architecture`
- `dependencies.notable`, `dependencies.direct_count`

---

### `codebase skills`

List installed Claude skills with descriptions.

```bash
codebase skills                       # show all installed skills
```

Skills extend `/review` and other commands with stack-specific analysis. Installed by `codebase setup`.

**Bundled skills:**
| Skill | What it does |
|-------|--------------|
| py-declutter | Python dead code elimination via AST call graph |
| nextjs-declutter | Next.js dead code via import graph analysis |
| arch-review | 5-expert architecture review (3 cycles) |
| vibeloop | Autonomous build → simulate → launch loop |

---

### `codebase issue`

Manage GitHub issues.

```bash
codebase issue create "Fix auth bug"                       # create
codebase issue close 42 --reason "Fixed in PR #43"         # close with reason
codebase issue comment 42 --message "Refactored auth flow" # add comment
codebase issue list                                        # list all
codebase issue list --mine                                 # list yours
```

---

### `codebase mcp`

Start MCP server for IDE/agent integrations (Claude Desktop, Cursor, Cline, etc.).

```bash
codebase mcp                           # start stdio MCP server
```

**MCP tools available:**
| Tool | What it does |
|------|--------------|
| `project_brief` | Full project briefing (call first); `slim: true` for ~20-line brief |
| `get_next_task` | Highest-priority task with body |
| `get_blockers` | Issues blocked, PRs failing, merge conflicts |
| `get_issue` | Full issue detail by number |
| `get_pr` | Full PR detail by number |
| `create_issue` | Create GitHub issue |
| `close_issue` | Close issue with comment |
| `update_issue` | Add/remove labels, set assignee |
| `refresh_status` | Refresh GitHub data (fast, no filesystem scan) |
| `rescan_project` | Full rescan + optional GitHub sync |
| `list_commands` | List installed slash commands |
| `list_skills` | List installed skills |
| `get_plan` | Read PLAN.md (loop memory) |
| `update_plan` | Append to PLAN.md |
| `get_codebase` | Get structured manifest data |
| `query_codebase` | Query specific field by dot-path |
| `generate_handoff` | Generate HANDOFF.md for session transfer |

`codebase init` writes `.mcp.json` automatically.

---

### `codebase release`

Quality gates → tag → merge `develop → main` → GitHub Release.

```bash
codebase release                      # auto-increment version
codebase release v1.2.0               # explicit version
codebase release --dry-run            # preview without tagging
```

**Gates checked:**
1. No open critical/high bugs
2. Test suite passes
3. World-class UX score ≥ 7.0 (if `/simulate` has been run)
4. Branch is clean, no uncommitted changes

---

### `codebase tokens`

Token budget report — estimates per-session context cost across all sources.

```bash
codebase tokens                       # show token budget with A/B/C/D grades
```

**Sources measured:** CLAUDE.md, `.codebase.json`, MCP servers (~10k tokens each), slash commands, `settings.json`.

**Grades:** A (<15k) | B (<30k) | C (<60k) | D (>60k)

Includes recommendations when CLAUDE.md is large or too many MCP servers are configured.

---

### `codebase handoff`

Generate `HANDOFF.md` capturing current session state for context transfer to the next agent or human.

```bash
codebase handoff                           # generate HANDOFF.md in project root
codebase handoff --message "notes"         # include session notes
```

**Captures:** branch, recent commits, changed files, uncommitted changes, stashes, in-progress issues, next priority task, blockers, and active PLAN.md snippet.

Run this at the end of a session so the next session can pick up instantly with full context.

---

### `codebase doctor` / `codebase fix`

Health check and auto-repair.

```bash
codebase doctor                       # diagnose issues
codebase fix                          # auto-repair everything
```

**Checks:** manifest freshness, detector coverage, CLAUDE.md injection, MCP config, git hooks, Claude Code hooks, slash commands, skills, GitHub CLI status, `.gitignore`, and TOKEN HEALTH (CLAUDE.md size, injection block size, MCP server count, session-start hook).

**TOKEN HEALTH section** grades your context setup and warns when:
- CLAUDE.md exceeds 300 lines (tokens wasted per session)
- Injection block exceeds 80 lines
- More than 3 MCP servers configured
- Session-start hook is missing

---

## Autonomous Loop

After running `codebase setup`, the full autonomous development loop is available:

```
/simulate → /build → /launch
```

1. **`/simulate`** — Generates customer personas from `docs/PRODUCT.md`, runs browser journeys via agent-browser, performs 9-dimension UX audit (3 iterations), fixes bugs inline, creates GitHub issues for everything found
2. **`/build`** — Picks highest-priority `arch`/`vibekit` issue, implements it, runs tests, verifies via browser, commits, polls for new issues, repeats up to 20 rounds
3. **`/launch`** — Checks all gates (bugs, tests, UX score, clean branch), generates release notes, creates GitHub release, merges develop → main
4. **`/review`** — Security (OWASP), quality (conventions, dead code), dependency health, accessibility audit. Auto-dispatches stack-specific skills (py-declutter for Python, nextjs-declutter for Next.js)

All commands are fully self-contained — every phase specified inline with exact shell commands.

---

## Global Options

| Option | Description |
|--------|-------------|
| `--help, -h` | Show help (or `<command> --help` for command-specific) |
| `--version, -v` | Show version |
| `--verbose` | Detailed output |
| `--quiet` | Minimal output |
| `--path <dir>` | Target directory (default: current) |
| `--dry-run` | Preview without applying |
| `--sync` | Include GitHub data |
| `--force` | Skip gates / plain text output (replaces deprecated `--raw`) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEBASE_MANIFEST_TTL_HOURS` | `24` | How long before manifest is considered stale |
| `CODEBASE_DEPTH` | `4` | Directory tree depth |
| `CODEBASE_QUIET` | `false` | Suppress stdout |
| `CODEBASE_NO_UPDATE_CHECK` | — | Skip npm update check |
| `NO_COLOR` | — | Disable colored output |

---

## Language Support

Works with any project. Auto-detects:

| Language | Detected from | Test command |
|----------|---------------|-------------|
| JavaScript / TypeScript | `package.json`, `tsconfig.json` | `npm test` / `npx vitest run` |
| Python | `pyproject.toml`, `requirements.txt` | `pytest` / `uv run pytest` |
| Rust | `Cargo.toml` | `cargo test` |
| Go | `go.mod` | `go test ./...` |
| Java | `pom.xml`, `build.gradle` | `mvn test` / `gradle test` |
| Ruby | `Gemfile` | `bundle exec rspec` |
| PHP | `composer.json` | `phpunit` |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (see stderr for details) |
