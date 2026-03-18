# codebase

<p align="center">
  <img src="https://img.shields.io/npm/v/codebase" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/codebase" alt="npm downloads" />
  <img src="https://img.shields.io/github/license/your-repo/codebase" alt="license" />
  <a href="https://github.com/your-repo/codebase/stargazers"><img src="https://img.shields.io/github/stars/your-repo/codebase?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <b>Zero-dependency project intelligence for AI tools.<br>One command. Instant context. Autonomous development loop.</b>
</p>

---

## Quick Start

```bash
npx codebase
```

That's it. Your project is AI-ready — and you get the full autonomous development loop.

**What happens in one command:**
1. Scans your project → writes `.codebase.json` (~4KB, ~500 tokens)
2. Injects context into all detected AI tools (Claude, Cursor, Windsurf, Copilot, Aider, Cline, Continue + 4 more)
3. Configures MCP server for native AI tool access
4. Installs git hooks (auto-updates manifest on every commit)
5. Sets up GitHub labels, milestone, and Highlights Index issue
6. Installs 7 Claude Code slash commands into your project

**After this, you never run it again.** The manifest auto-updates on every commit.

---

## The Autonomous Loop

Once set up, your project runs itself:

```
/setup      ← run once per project
/simulate   ← AI customer journeys find & fix bugs (Playwright)
/build      ← implement architectural issues autonomously
/launch     ← gate check → tag → release → merge to main
```

```
/review     ← security, quality, deps, accessibility audit
/pitch      ← GTM docs, dev docs, investor deck, metrics
/daemon     ← background worker — polls GitHub every 3 min, ships automatically
```

These 7 slash commands are installed into your project by `codebase setup` and work in any Claude Code session.

> **Tip:** Commit `.claude/commands/` to your repo so the whole team shares the same commands.

---

## Why codebase?

Every AI coding session wastes **5,000–15,000 tokens** re-discovering your project.

```
Without codebase:  session start → AI explores files → 30s + ~10K tokens
With codebase:     session start → AI reads .codebase.json → ~1s + ~500 tokens
```

**~95% fewer discovery tokens. Instant context. Every session.**

But codebase is more than a manifest. It's the connective tissue between your codebase and the full autonomous development workflow — project intelligence that every command in the loop reads first.

---

## What Gets Captured

| Category | Data |
|----------|------|
| **Project** | Name, description |
| **Repo** | URL, default branch, monorepo detection, active branches |
| **Structure** | Directory tree, entry points, build output paths |
| **Stack** | 30+ languages, 100+ frameworks, package manager, database, ORM |
| **Commands** | Dev, build, test, lint, format (auto-detected, 15+ languages) |
| **Dependencies** | Direct/dev counts, lock file, notable packages |
| **Config** | Env files, feature flags, env vars |
| **Git** | Recent commits, last committers, uncommitted changes |
| **Quality** | Test framework, linter, formatter, CI pipeline, pre-commit hooks |
| **Patterns** | Architecture style, state management, API style, key modules |
| **GitHub** | Issues, PRs, milestones, releases, project boards, priorities |

---

## AI Interface

These are the commands your AI tools call:

```bash
codebase brief              # Full project briefing — call this first every session
codebase next               # Highest-priority task + what's in progress
codebase status             # Kanban board, priorities, milestones
codebase query <path>       # Any field (e.g. stack.languages, commands.test)
codebase issue create "title"           # Track a bug or feature
codebase issue close <n> --reason "…"  # Close after fixing
```

---

## Human Commands

```bash
codebase init       # Full setup (scan + AI tools + hooks + commands)
codebase scan       # Refresh .codebase.json
codebase watch      # Auto-update on file changes
codebase diff       # Show changes since last scan
codebase doctor     # Health check — diagnose setup issues
codebase fix        # Auto-repair anything doctor flags
codebase release    # Gate check → tag → develop→main → GitHub release
codebase serve      # Start HTTP API server (localhost:7432)
codebase mcp        # Start MCP server (stdio)
```

---

## MCP Server

```bash
codebase mcp  # Start MCP server
```

Add to your AI tool's MCP config:

```json
{
  "mcpServers": {
    "codebase": {
      "command": "npx",
      "args": ["codebase", "mcp"]
    }
  }
}
```

Exposes 10 native tools: `project_brief`, `get_manifest`, `query_field`, `get_next_task`, `get_blockers`, `create_issue`, `close_issue`, `rescan`, and more.

---

## Slash Commands (Claude Code)

After `codebase setup`, these 7 commands are available in any Claude Code session in your project:

| Command | What it does |
|---------|-------------|
| `/setup` | Bootstrap project — labels, milestone, PRODUCT.md, daemon script |
| `/simulate` | AI customer journeys via Playwright, UX audit, fixes bugs inline |
| `/build` | Autonomous loop — build → test → simulate → poll → repeat |
| `/launch` | Gate check (bugs, tests, UX score, GTM docs) → release → merge |
| `/review` | Security, quality, deps health, accessibility → GitHub Issues |
| `/pitch` | GTM docs, dev docs, investor deck, metrics from project data |
| `/daemon` | Install/manage background worker (launchd/cron, polls every 3 min) |

The daemon runs `claude --print "/build --once"` in the background — your product ships while you sleep.

---

## GitHub Actions

`codebase setup` generates `.github/workflows/codebase.yml` — a workflow that runs the autonomous build loop in the cloud:

```yaml
on:
  push:
    branches: [develop]   # runs on every push
  schedule:
    - cron: '*/15 * * * *'  # polls every 15 minutes
  workflow_dispatch:        # manual trigger from GitHub UI
```

**To activate:** Add `ANTHROPIC_API_KEY` to your repo's GitHub Secrets (Settings → Secrets → Actions).

Once active, the daemon runs in the cloud — no local process needed. Every 15 minutes, it:
1. Reads `codebase brief` for project context
2. Checks `codebase next` for the highest-priority open issue
3. Runs `/build --once` — implements the fix, commits, creates/closes issues

---

## Git Workflow

codebase enforces a clean git convention:

- **All commits go to `develop`** — no feature branches
- **Direct commits to `main`/`master` blocked** via `commit-msg` hook
- **`develop → main` only at release** via `codebase release` (no-ff merge)
- **One commit per verified fix** — never batch unrelated changes

---

## Supported AI Tools

Auto-detected and wired on `codebase init`:

| Tool | Config |
|------|--------|
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursorrules` |
| Windsurf | `.windsurfrules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Aider | `.aider.conf.yml` |
| Cline | `.clinerules` |
| Continue | `.continue/config.json` |
| VS Code | `.vscode/settings.json` |
| WebStorm | `.idea/` |
| Neovim | `init.lua` |
| Copilot Enterprise | `.github/` |

---

## HTTP API

```bash
codebase serve  # localhost:7432

curl localhost:7432/codebase           # Full manifest
curl localhost:7432/codebase/stack     # Just stack
curl localhost:7432/codebase/commands  # Just commands
curl localhost:7432/codebase/status    # GitHub status
```

---

## Installation

```bash
npm install -g codebase    # Global (recommended)
npx codebase               # Run without installing
pnpm add -g codebase
```

**Requirements:** Node.js 18+, optional: `gh` CLI for GitHub features

---

## Zero Dependencies

No runtime dependencies. Node.js built-ins only. Works everywhere Node 18+ runs.

---

## License

MIT
