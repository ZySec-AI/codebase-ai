# codebase

<p align="center">
  <img src="https://img.shields.io/npm/v/codebase" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/codebase" alt="npm downloads" />
  <img src="https://img.shields.io/github/license/your-repo/codebase" alt="license" />
  <a href="https://github.com/your-repo/codebase/stargazers"><img src="https://img.shields.io/github/stars/your-repo/codebase?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <b>Your AI can now understand your project, find bugs by itself, fix them, and ship — while you sleep.</b>
</p>

---

## What is this, really?

Most developers use AI as a fancy autocomplete. You write a prompt, AI suggests code, you paste it in. Repeat 50 times a day. You're still doing all the thinking, all the coordination, all the shipping.

**codebase turns AI into an autonomous engineer on your project.**

It works in three stages:

**Stage 1 — Give AI permanent memory of your project**
One command scans your codebase and writes a compact manifest (`.codebase.json`) that captures everything: your tech stack, commands, file structure, open GitHub issues, recent decisions. Every AI tool you use reads this automatically — forever, on every session, without you doing anything.

**Stage 2 — Give AI the ability to act**
Seven slash commands are installed into Claude Code. These aren't just prompts — they're complete workflows that use Playwright to simulate real users, read your GitHub issues, write and test code, commit fixes, and open new issues for anything they find.

**Stage 3 — Let it run continuously**
A GitHub Actions workflow polls your repo every 15 minutes. When there's work to do, it runs the build loop automatically. You check GitHub in the morning and there are new commits, closed issues, and a healthier codebase. You didn't write a line.

---

## The three commands that matter

Once set up, your entire development loop is:

```
/simulate  →  /build  →  /launch
```

That's it. Here's what each one actually does:

---

### `/simulate` — AI becomes your user

Claude opens your app in a real browser (Playwright) and acts like a real customer. It tries to sign up, log in, complete purchases, hit edge cases. When something breaks or feels wrong, it:

1. Fixes the bug directly in your code
2. Commits the fix with a proper message
3. Opens a GitHub Issue if the bug is too complex to fix inline
4. Records UX problems (confusing copy, broken flows, accessibility issues) as issues

After `/simulate`, your repo has real user-found bugs tracked and many already fixed.

---

### `/build` — AI works through your issue backlog

Claude reads your open GitHub Issues (prioritized by label), picks the most important one, and implements the fix. It:

1. Reads `codebase brief` to understand your project
2. Picks the top issue labeled `vibekit`, `critical`, `high`, or `bug`
3. Writes the fix
4. Runs your test suite
5. Commits if tests pass — or opens a new issue if it gets stuck
6. Closes the original issue with a summary of what was done
7. Moves to the next issue
8. Repeats until the backlog is clear or you stop it

This runs in a loop. You can run `/build` once or let the GitHub Actions workflow run it continuously.

---

### `/launch` — AI ships your release

Before merging to `main`, Claude checks four quality gates:

| Gate | What it checks |
|------|---------------|
| **Bugs** | No open critical or high severity issues |
| **Tests** | Your full test suite passes |
| **UX score** | World-class score ≥ 7.0 (from `/simulate` cycles) |
| **Docs** | GTM docs exist (warns if missing, doesn't block) |

If all gates pass, it:
- Auto-increments your version
- Tags the release
- Merges `develop → main` with a proper merge commit
- Creates a GitHub Release with auto-generated release notes
- Rotates the milestone

One command. Zero manual steps.

---

## Quick start

**Prerequisites:**
```bash
node --version    # needs 18+
gh auth login     # GitHub CLI — needed for issues, releases, labels
```

**Setup (run once per project):**
```bash
cd your-project
npx codebase
```

This wires everything. You'll see it:
- Scan your project and write `.codebase.json`
- Detect and configure your AI tools (Claude, Cursor, Copilot, etc.)
- Install git hooks so the manifest stays fresh forever
- Create GitHub labels for the autonomous workflow
- Generate `.github/workflows/codebase.yml` for cloud automation

**Then open Claude Code and run `/setup`** — this creates your `docs/PRODUCT.md` (the product brief every slash command reads) and sets up your first GitHub milestone.

**Then run the loop:**
```bash
/simulate    # find and fix bugs as a real user would
/build       # clear the issue backlog
/launch      # ship the release
```

---

## Enable the cloud loop (no daemon needed)

`codebase setup` generates a GitHub Actions workflow. To activate it:

1. Go to your repo on GitHub
2. Settings → Secrets and variables → Actions
3. Add a secret: `ANTHROPIC_API_KEY` = your Anthropic API key

**That's it.** Now every push to `develop` triggers a build cycle. And every 15 minutes, GitHub checks if there's work to do and runs `/build --once` automatically. You can also trigger it manually from the Actions tab.

Your project now has an always-on AI engineer. No local machine. No cron job. Just GitHub.

---

## Why does the AI actually understand my project?

Without codebase, AI starts every session knowing nothing:

```
Session start → AI reads package.json → reads src/ → reads tests/ → reads configs...
30 seconds + ~10,000 tokens later: "ok so you're using Next.js..."
```

With codebase, every session starts instantly:

```
Session start → AI reads .codebase.json (~500 tokens)
"I can see: Next.js 14, Prisma, Vitest, dev server on port 3000,
 3 open critical bugs, last commit 2 hours ago, milestone v1.2 is 60% done"
```

**~95% fewer tokens. Instant context. Every session. Every AI tool.**

But more importantly — the autonomous commands (`/simulate`, `/build`, `/launch`) all read the same manifest. That's why they work without human guidance. They know your stack, your commands, your open issues, your product brief. They're not guessing.

---

## All seven slash commands

These live in `.claude/commands/` in your project. Commit this folder to share them with your team.

| Command | Plain English |
|---------|--------------|
| `/setup` | First-time setup. Creates GitHub labels, your first milestone, `docs/PRODUCT.md`, and the GitHub Actions workflow. Run once per project. |
| `/simulate` | Opens your app in a real browser. Acts like multiple types of users. Finds bugs, UX problems, and accessibility issues. Fixes what it can, tracks the rest as GitHub Issues. |
| `/build` | Reads your open GitHub Issues. Picks the most important one. Implements the fix. Tests it. Commits it. Closes the issue. Moves to the next. Repeats. |
| `/launch` | Checks quality gates (bugs, tests, UX, docs). If everything passes: bumps version, tags release, merges to main, publishes GitHub Release. |
| `/review` | Deep code audit. Checks for security vulnerabilities, code quality problems, outdated/vulnerable dependencies, and accessibility issues. Everything goes to GitHub Issues. |
| `/pitch` | Reads your project data and writes real GTM documents: a sales playbook, product brochure, and technical docs. Useful for investors, customers, and new engineers. |
| `/daemon` | Manages the background worker. Can use GitHub Actions (recommended) or a local process. Run `/daemon install` to activate, `/daemon status` to check, `/daemon logs` to debug. |

---

## How the git workflow works

codebase enforces a simple convention that makes autonomous commits safe:

- **All work happens on `develop`** — the AI commits here
- **`main` is protected** — direct commits are blocked by a git hook
- **Releases merge `develop → main`** — only via `codebase release`, with a proper merge commit
- **One commit per verified fix** — the AI never batches unrelated changes

This means you can safely let the AI commit to `develop`. Nothing reaches `main` until you run `/launch` and the quality gates pass.

---

## What gets captured in `.codebase.json`

| Category | Examples |
|----------|---------|
| **Stack** | TypeScript, Next.js, Prisma, PostgreSQL, Vitest |
| **Commands** | `npm run dev`, `npm test`, `npm run build` |
| **Structure** | Where `src/` is, entry points, build output |
| **Dependencies** | What's installed, what's outdated, what's notable |
| **Config** | Which env vars exist, feature flags, CI setup |
| **Git** | Recent commits, active branches, uncommitted changes |
| **Quality** | Test framework, linter, formatter, pre-commit hooks |
| **GitHub** | Open issues by priority, PRs, milestones, releases |
| **Patterns** | Architecture style, API patterns, state management |

30+ languages and 100+ frameworks detected automatically.

---

## MCP Server

For AI tools that support Model Context Protocol:

```bash
codebase mcp    # start stdio MCP server
```

Add to your Claude/Cursor config:

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

Tools available: `project_brief`, `get_codebase`, `query_codebase`, `get_next_task`, `get_blockers`, `create_issue`, `close_issue`, `rescan_project`, `list_commands`.

---

## Supported AI tools

`codebase init` auto-detects and wires all of these:

| Tool | What gets updated |
|------|------------------|
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

---

## Diagnostics

```bash
codebase doctor    # shows exactly what's broken and why
codebase fix       # auto-repairs everything doctor flags
```

`doctor` checks: manifest freshness, AI tool injection, MCP config, git hooks, commit-msg hook, `.claude/commands/`, GitHub Actions workflow, and `.gitignore`.

---

## All CLI commands

```bash
# Setup
npx codebase           # full setup — run once per project
codebase setup         # re-run wiring (updates commands, hooks, tools)

# AI interface (what AI tools call)
codebase brief         # full project briefing
codebase next          # highest-priority open issue
codebase status        # kanban board + milestones
codebase query <path>  # any field, e.g. stack.languages or commands.test

# Issues
codebase issue create "title"              # create GitHub issue
codebase issue close <n> --reason "why"   # close with reason

# Maintenance
codebase scan          # refresh .codebase.json
codebase watch         # auto-refresh on file changes
codebase diff          # what changed since last scan
codebase release       # quality gates → tag → develop→main → GitHub release
codebase doctor        # health check
codebase fix           # auto-repair

# Integrations
codebase mcp           # start MCP server
codebase serve         # start HTTP API (localhost:7432)
```

---

## FAQ

**Do I need Claude Code for this to work?**
The manifest (`.codebase.json`) and MCP server work with any AI tool — Cursor, Copilot, Aider, etc. The slash commands (`/simulate`, `/build`, `/launch`) require Claude Code specifically.

**What does "autonomous" actually mean — will it break my code?**
All AI commits go to `develop`. Nothing reaches `main` until you run `/launch` and quality gates pass. You're always in control of what ships. The AI runs tests before committing and opens issues rather than guessing when it's stuck.

**Does it send my code to anyone?**
No. Everything runs locally or inside your own GitHub Actions. The only external calls are to GitHub (via `gh` CLI) and to Anthropic's API (only when you run Claude commands).

**Will the git hooks slow down my commits?**
No. The scan runs in ~200ms on most projects.

**What if I don't use GitHub?**
The manifest and AI tool wiring work without GitHub. You lose issues, PRs, releases, labels, and the GitHub Actions workflow — but the core context injection still works.

**My project isn't JavaScript — does it work?**
Yes. Detectors cover Python, Go, Rust, Ruby, Java, PHP, Swift, C#, and more. The slash commands use `codebase brief` to detect your stack and adapt automatically.

**Can my whole team use this?**
Yes. Commit `.codebase.json`, `.claude/commands/`, and `.github/workflows/codebase.yml`. Every team member gets the same context, the same slash commands, and shares the same GitHub Actions loop.

---

## Install

```bash
npm install -g codebase    # global (recommended)
npx codebase               # try without installing
pnpm add -g codebase
```

Zero runtime dependencies. Node.js 18+ only.

---

## License

MIT
