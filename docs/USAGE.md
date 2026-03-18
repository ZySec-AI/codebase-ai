# Usage

## Quick Reference

```bash
# One-time setup
npx codebase-ai                       # full setup: scan + CLAUDE.md + hooks + MCP

# AI-facing commands (Claude calls these)
codebase brief                        # full project briefing
codebase next                         # what should I work on?
codebase status                       # kanban, priorities, milestones
codebase query <path>                 # query specific field

# Issues
codebase issue create "title"         # create GitHub issue
codebase issue close <n> --reason "why"   # close with reason
codebase issue comment <n> --message "text"  # add audit trail comment
codebase issue list                   # list all issues

# Maintenance
codebase scan                         # refresh .codebase.json
codebase release                      # gate check → tag → develop→main
codebase doctor                       # health check
codebase fix                          # auto-repair issues

# MCP server
codebase mcp                          # start MCP server (stdio)
```

---

## Commands

### `npx codebase-ai` / `codebase init`

Full one-time setup. Scans project, configures Claude Code, installs hooks.

```bash
npx codebase-ai                       # complete setup
codebase init --sync                  # include GitHub data
```

**What it does:**
1. Scans project (stack, commands, structure, patterns)
2. Syncs GitHub data (issues, PRs, milestones) if `gh` CLI is available
3. Writes `.codebase.json`
4. Injects into `CLAUDE.md`
5. Writes `.mcp.json`
6. Installs git hooks (pre-commit, post-commit, post-checkout, commit-msg)
7. Installs Claude Code hooks (`.claude/hooks/`)
8. Installs slash commands (`.claude/commands/`)
9. Updates `.gitignore`

---

### `codebase scan`

Generate `.codebase.json` manifest.

```bash
codebase scan                         # scan current dir
codebase scan --depth 6               # directory tree depth (default: 4)
codebase scan --quiet                 # no stdout, just write file
codebase scan --sync                  # sync GitHub data (requires gh)
```

---

### `codebase brief` (AI-facing)

Full project briefing. Claude calls this at session start.

```bash
codebase brief                        # everything in one call
```

Returns: project identity, tech stack, commands, structure, current status, next task, blockers, recent decisions.

---

### `codebase next` (AI-facing)

Show highest-priority task.

```bash
codebase next                         # what should I work on?
```

---

### `codebase status` (AI-facing)

Kanban board, priorities, and milestones.

```bash
codebase status                       # full project status
```

---

### `codebase query`

Query specific field using dot-path notation.

```bash
codebase query stack.languages            # ["typescript"]
codebase query commands.test              # "npx vitest run"
codebase query commands.test --raw        # npx vitest run (plain text)
codebase query repo.is_monorepo           # false

# Pipe into other commands
codebase query commands.test --raw | sh   # run tests directly
```

**Common paths:**
- `stack.languages`, `stack.frameworks`, `stack.database`
- `commands.dev`, `commands.test`, `commands.build`, `commands.lint`
- `repo.is_monorepo`, `repo.default_branch`
- `structure.entry_points`
- `dependencies.notable`

---

### `codebase setup`

Re-run wiring. Safe to run multiple times.

```bash
codebase setup                        # update commands, hooks, CLAUDE.md, MCP config
```

---

### `codebase issue`

Manage GitHub issues.

```bash
codebase issue create "Fix auth bug"                       # create
codebase issue close 42 --reason "Fixed in PR #43"         # close with reason
codebase issue comment 42 --message "Refactored auth flow" # add comment
codebase issue list                                        # list all
codebase issue list --mine                                 # list assigned to you
```

---

### `codebase mcp`

Start MCP server for native Claude Code integration.

```bash
codebase mcp                           # start stdio MCP server
```

Add to `.mcp.json`:
```json
{
  "mcpServers": {
    "codebase": {
      "command": "npx",
      "args": ["codebase-ai", "mcp"]
    }
  }
}
```

`codebase setup` writes this automatically.

---

### `codebase release`

Quality gates → tag → merge `develop → main` → GitHub Release.

```bash
codebase release                      # auto-increment version and release
codebase release v1.2.0               # explicit version
codebase release --dry-run            # preview without tagging
```

**Gates checked:**
1. No open critical/high bugs
2. Test suite passes
3. World-class UX score ≥ 7.0 (if `/simulate` has been run)
4. Branch is clean, no uncommitted changes

---

### `codebase doctor`

Diagnose setup issues.

```bash
codebase doctor                       # run health check
```

Checks: manifest freshness, CLAUDE.md injection, MCP config, git hooks, Claude Code hooks, `.gitignore`.

---

### `codebase fix`

Auto-repair anything `doctor` flags.

```bash
codebase fix                          # auto-repair all issues
```

---

## Global Options

| Option | Description |
|--------|-------------|
| `--help, -h` | Show help |
| `--version, -v` | Show version |
| `--verbose` | Detailed output |
| `--quiet` | Minimal output |
| `--path <dir>` | Target directory (default: current) |
| `--dry-run` | Preview without applying |
| `--sync` | Include GitHub data |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEBASE_PORT` | `7432` | MCP server port |
| `CODEBASE_DEPTH` | `4` | Directory tree depth |
| `CODEBASE_QUIET` | `false` | Suppress stdout |

---

## Language-Specific Examples

### JavaScript / TypeScript

```bash
codebase scan                        # detects package.json, tsconfig.json
codebase query commands.test --raw | sh  # runs: npm test / npx vitest run
```

### Python

```bash
codebase scan                        # detects pyproject.toml, poetry.lock, uv.lock
codebase query commands.test --raw | sh  # runs: poetry run pytest / uv run pytest
```

### Rust

```bash
codebase scan                        # detects Cargo.toml
codebase query commands.test --raw | sh  # runs: cargo test
```

### Go

```bash
codebase scan                        # detects go.mod
codebase query commands.test --raw | sh  # runs: go test ./...
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (see stderr for details) |
