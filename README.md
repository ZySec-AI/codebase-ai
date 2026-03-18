# codebase

<p align="center">
  <img src="https://img.shields.io/npm/v/codebase" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/codebase" alt="npm downloads" />
  <img src="https://img.shields.io/github/license/your-repo/codebase" alt="license" />
  <a href="https://github.com/your-repo/codebase/stargazers"><img src="https://img.shields.io/github/stars/your-repo/codebase?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <b>Your AI coding assistant is flying blind. This fixes that.</b><br>
  One command wires every AI tool into your project — and unlocks a fully autonomous development loop.
</p>

---

## The problem

Every time you start an AI coding session, the AI has to re-discover your project from scratch:

> *"What's the tech stack? Where are the tests? What's the dev command? What issues are open?"*

That costs **5,000–15,000 tokens** and 30+ seconds — every single session. It's also error-prone. The AI guesses wrong and builds in the wrong place.

**codebase solves this permanently, in one command.**

---

## Quick start

```bash
npx codebase
```

That's it. Run this once in any project directory.

**What just happened:**

1. Your project was scanned — stack, commands, structure, dependencies, git history
2. A `.codebase.json` manifest was written (~4KB, ~500 tokens of pure signal)
3. Every AI tool you use (Claude, Cursor, Copilot, etc.) was wired to read it automatically
4. Git hooks were installed — the manifest stays fresh on every commit, forever
5. 7 Claude Code slash commands were installed: `/setup`, `/simulate`, `/build`, `/launch`, `/review`, `/pitch`, `/daemon`
6. A GitHub Actions workflow was generated — your project can now build itself in the cloud

**You never run it again.** It's a one-time setup.

---

## What changes immediately

Before codebase, every AI session starts like this:

```
You:  "fix the login bug"
AI:   reading package.json... reading src/... reading tests/...
      (30 seconds, ~10K tokens later)
AI:   "ok I see you're using Next.js with Prisma..."
```

After codebase, every session starts like this:

```
You:  "fix the login bug"
AI:   reads .codebase.json (1 second, ~500 tokens)
AI:   "on it — I can see the auth flow is in src/lib/auth.ts,
       tests are in tests/auth/, and you're running vitest"
```

**~95% fewer tokens. Instant context. Every session.**

---

## The autonomous loop

Once set up, your project can ship itself. These slash commands work in any Claude Code session:

```
/simulate  →  AI acts as a real user (via Playwright), finds bugs, fixes them inline
/build     →  works through your GitHub issues autonomously, one verified fix per commit
/launch    →  checks quality gates, tags a release, merges develop → main
```

```
/review    →  security audit, code quality, dependency health, accessibility
/pitch     →  generates GTM docs, developer docs, and investor materials
/daemon    →  background worker that runs /build every few minutes while you sleep
```

Run `/simulate → /build → /launch` and your product ships. No human in the loop required.

---

## Requirements

| Requirement | Why |
|-------------|-----|
| **Node.js 18+** | To run `codebase` |
| **Claude Code** | For the slash commands (`/simulate`, `/build`, etc.) |
| **`gh` CLI** (optional) | For GitHub features — issues, PRs, releases, labels |

```bash
# Install gh CLI (if you don't have it)
brew install gh
gh auth login
```

---

## Step-by-step: your first session

**Step 1 — Run setup once**

```bash
cd your-project
npx codebase
```

**Step 2 — Open Claude Code and run `/setup`**

This creates your GitHub labels, milestone, and `docs/PRODUCT.md` — the product brief that every slash command reads.

**Step 3 — Run the loop**

```bash
# In Claude Code:
/simulate    # find bugs by acting as a user
/build       # fix them all
/launch      # ship it
```

**Step 4 — Enable cloud automation (optional but powerful)**

Add `ANTHROPIC_API_KEY` to your GitHub repo secrets:

> GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Now your project builds itself in the cloud every 15 minutes. You wake up to commits.

---

## Slash commands reference

These are installed into `.claude/commands/` in your project by `codebase setup`.

> **Tip:** Commit `.claude/commands/` to share them with your whole team.

| Command | What it does |
|---------|-------------|
| `/setup` | One-time bootstrap — GitHub labels, milestone, `PRODUCT.md`, GitHub Actions |
| `/simulate` | AI plays a real user via Playwright across key journeys. Finds bugs, fixes them inline, opens GitHub Issues for anything it can't fix. |
| `/build` | Autonomous dev loop — reads open issues, implements fixes, runs tests, commits. Repeats until everything passes. |
| `/launch` | Quality gate check (no critical bugs, tests pass, UX score ≥7) → tags release → merges `develop` → `main` → creates GitHub release |
| `/review` | Deep audit: security vulnerabilities, code quality, outdated deps, accessibility. All findings go to GitHub Issues. |
| `/pitch` | Generates `docs/SALES-PLAY.md`, `PRODUCT-DOCS.md`, `PRODUCT-BROCHURE.md` from your project data. Ready for investors and customers. |
| `/daemon` | Installs a background worker (GitHub Actions or local launchd/cron) that runs `/build` automatically. Ship while you sleep. |

---

## GitHub Actions

`codebase setup` generates `.github/workflows/codebase.yml`:

```yaml
on:
  push:
    branches: [develop]      # triggers on every commit
  schedule:
    - cron: '*/15 * * * *'   # polls every 15 minutes
  workflow_dispatch:           # run manually from GitHub UI anytime
```

**To activate:** Go to your repo → Settings → Secrets → Actions → add `ANTHROPIC_API_KEY`.

That's it. GitHub will now run your autonomous build loop in the cloud. Every 15 minutes:
1. Reads your project context from `codebase brief`
2. Picks the highest-priority open issue
3. Implements the fix, runs tests, commits, closes the issue

**No daemon. No always-on machine. Just GitHub.**

---

## How it stays fresh

You never need to manually update the manifest. It auto-updates via git hooks:

- **Every commit** → `post-commit` hook re-scans and writes `.codebase.json`
- **Every branch switch** → `post-checkout` hook refreshes context
- **Direct commits to `main` are blocked** → `commit-msg` hook enforces the `develop` → `main` flow

The git workflow is simple:
- All work happens on `develop`
- Releases merge `develop → main` via `codebase release` (always a proper merge commit)
- No feature branches needed

---

## Everything it captures

One scan. Everything your AI needs to understand your project.

| Category | What's captured |
|----------|-----------------|
| **Project** | Name, description, type |
| **Stack** | 30+ languages, 100+ frameworks, package manager, database, ORM |
| **Commands** | dev, build, test, lint, format — auto-detected for 15+ languages |
| **Structure** | Directory tree, entry points, build outputs |
| **Dependencies** | Direct/dev counts, lock file, notable packages |
| **Config** | Env files, feature flags, environment variables |
| **Git** | Recent commits, active branches, uncommitted changes |
| **Quality** | Test framework, linter, formatter, CI pipeline |
| **Patterns** | Architecture style, state management, API style |
| **GitHub** | Open issues, PRs, milestones, releases, project boards, priorities |

---

## MCP Server

For AI tools that support the Model Context Protocol natively:

```bash
codebase mcp  # start stdio MCP server
```

Add to your AI tool's config:

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

Exposes 10 tools: `project_brief`, `get_codebase`, `query_codebase`, `get_next_task`, `get_blockers`, `create_issue`, `close_issue`, `rescan_project`, `list_commands`.

---

## Supported AI tools

Auto-detected and wired on `codebase init`:

| Tool | Config file updated |
|------|---------------------|
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

## All commands

**Run once:**
```bash
npx codebase          # full setup (recommended — does everything)
codebase init         # same as above
codebase setup        # re-wire AI tools + reinstall slash commands
```

**Day-to-day:**
```bash
codebase brief        # full project briefing (AI calls this at session start)
codebase next         # what's the highest-priority task right now?
codebase status       # kanban board, open issues, milestones
codebase scan         # manually refresh .codebase.json
codebase release      # gate check → tag → develop→main → GitHub release
```

**Diagnostics:**
```bash
codebase doctor       # health check — shows what's broken
codebase fix          # auto-repairs everything doctor flags
codebase diff         # show what changed since last scan
codebase watch        # auto-scan on file changes
```

**Integrations:**
```bash
codebase mcp          # start MCP server (for Claude, Cursor, etc.)
codebase serve        # start HTTP API (localhost:7432)
```

---

## HTTP API

```bash
codebase serve        # starts on localhost:7432

curl localhost:7432/codebase            # full manifest
curl localhost:7432/codebase/stack      # just the stack
curl localhost:7432/codebase/commands   # just the commands
curl localhost:7432/codebase/status     # GitHub issues + PRs
```

---

## Install

```bash
npm install -g codebase    # global install (recommended)
npx codebase               # try without installing
pnpm add -g codebase       # pnpm
```

**Requirements:** Node.js 18+. Zero runtime dependencies — pure Node.js built-ins.

---

## FAQ

**Do I need Claude Code?**
No — codebase works with any AI tool. But the slash commands (`/simulate`, `/build`, `/launch`) require Claude Code. The manifest and MCP server work everywhere.

**Will this slow down my git commits?**
No. The scan runs in ~200ms for most projects.

**Is `.codebase.json` safe to commit?**
It's added to `.gitignore` by default because it contains paths and possibly env var names. You can commit it if you want the team to share context without re-scanning.

**Does it send my code anywhere?**
No. Everything runs locally. The only network calls are to GitHub (via `gh` CLI) if you opt in.

**What if my project isn't JavaScript?**
Works with any language. Detectors cover Python, Go, Rust, Ruby, Java, PHP, Swift, and more.

---

## License

MIT
