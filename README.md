# CodeBase

<p align="center">
  <img src="https://img.shields.io/npm/v/codebase-ai" alt="npm version" />
  <img src="https://img.shields.io/npm/dm/codebase-ai" alt="npm downloads" />
  <img src="https://img.shields.io/github/license/ZySec-AI/codebase" alt="license" />
  <a href="https://github.com/ZySec-AI/codebase/stargazers"><img src="https://img.shields.io/github/stars/ZySec-AI/codebase?style=social" alt="GitHub stars"></a>
  <a href="https://github.com/ZySec-AI/codebase/actions/workflows/ci.yml"><img src="https://github.com/ZySec-AI/codebase/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://securityscorecards.dev/viewer/?uri=github.com/ZySec-AI/codebase"><img src="https://api.securityscorecards.dev/projects/github.com/ZySec-AI/codebase/badge" alt="OpenSSF Scorecard" /></a>
</p>

<p align="center">
  <b>One command. Your AI understands your project, finds bugs, fixes them, and ships.</b>
</p>

---

## The idea in plain English

Imagine hiring an engineer who reads your entire project in seconds and works through your bug list on demand. That's what `codebase` does — it gives AI the context and the tools to work *on* your project, not just *for* you.

**Without codebase:** Every time you open Claude Code, it starts from zero. You re-explain your project, paste in files, describe what's broken. You're the coordinator. Claude is the cursor.

**With codebase:** Claude reads a single compact file that captures everything about your project — your stack, your commands, your open issues. It knows where things are. It knows what needs doing. It can act.

**Two things happen:**

**1 — Claude gets permanent memory of your project**
One command scans your project and writes a small snapshot file (`.codebase.json`). Claude reads this automatically on every session via `CLAUDE.md`. You never re-explain your project again.

**2 — AI gets the ability to act**
Seven slash commands give AI a complete workflow: simulate real users in a browser, work through your bug backlog, run tests, commit fixes, and ship releases. Not prompts — real, repeatable actions.

---

## The loop

Once set up, your entire development loop is:

```
/simulate  →  /build  →  /launch
```

Or if you want zero intervention — one command that runs the entire loop automatically:

```
/vibeloop
```

Here's what each step does:

---

### `/simulate` — AI becomes your user

Claude opens your app in a real browser (agent-browser) and acts like a real customer. It tries to sign up, log in, complete purchases, hit edge cases. When something breaks or feels wrong, it:

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

This runs in a loop. You can run `/build` once or keep it running until the backlog is clear.

---

### `/launch` — AI ships your release

Before merging to `main`, Claude checks four quality gates:

| Gate | What it checks |
|------|---------------|
| **Bugs** | No open critical or high severity issues |
| **Tests** | Your full test suite passes |
| **UX score** | World-class score ≥ 7.0 (from `/simulate` cycles) |
| **Branch** | No uncommitted changes, branch is clean |

If all gates pass, it:
- Auto-increments your version
- Tags the release
- Merges `develop → main` with a proper merge commit
- Creates a GitHub Release with auto-generated release notes
- Rotates the milestone

One command. Zero manual steps.

---

## Quick start

### Level 1 — Give Claude memory of your project

Only requires Node.js 20+.

```bash
cd your-project
npx codebase-ai
```

This scans your project and wires everything automatically:
- Writes `.codebase.json` — a compact snapshot of your stack, commands, and structure
- Injects smart instructions into `CLAUDE.md`
- Configures the MCP server so Claude can query project context natively
- Installs git hooks so the manifest stays fresh on every commit
- Updates `.gitignore`

That's it. Every Claude session now starts with instant project context — no re-explaining, no file pasting.

---

### Level 2 — Autonomous dev loop

> **Requires:** Claude Code (`npm install -g @anthropic-ai/claude-code`) and GitHub CLI (`gh auth login`)

Open Claude Code in your project and run `/setup` — this creates `docs/PRODUCT.md` and sets up your first GitHub milestone.

Then run the loop:
```bash
/simulate    # find and fix bugs as a real user would
/build       # clear the issue backlog
/launch      # ship the release
```

---

## Why does Claude actually understand my project?

Without codebase, Claude starts every session knowing nothing:

```
Session start → reads package.json → reads src/ → reads tests/ → reads configs...
30 seconds + ~10,000 tokens later: "ok so you're using Next.js..."
```

With codebase, every session starts instantly:

```
Session start → reads .codebase.json (~500 tokens)
"I can see: Next.js 14, Prisma, Vitest, dev server on port 3000,
 3 open critical bugs, last commit 2 hours ago, milestone v1.2 is 60% done"
```

**~95% fewer tokens. Instant context. Every session.**

The autonomous commands (`/simulate`, `/build`, `/launch`) all read the same manifest. That's why they work without human guidance. They know your stack, your commands, your open issues, your product brief. They're not guessing.

---

## All slash commands

These live in `.claude/commands/` in your project. Commit this folder to share them with your team.

| Command | Plain English |
|---------|--------------|
| `/setup` | First-time setup. Creates GitHub labels, your first milestone, and `docs/PRODUCT.md`. Run once per project. |
| `/simulate` | Opens your app in a real browser. Acts like multiple types of users. Finds bugs, UX problems, and accessibility issues. Fixes what it can, tracks the rest as GitHub Issues. |
| `/build` | Reads your open GitHub Issues. Picks the most important one. Implements the fix. Tests it. Commits it. Closes the issue. Moves to the next. Repeats. |
| `/launch` | Checks quality gates (bugs, tests, UX score). If everything passes: bumps version, tags release, merges to main, publishes GitHub Release. |
| `/review` | Deep code audit. Checks for security vulnerabilities, code quality problems, outdated/vulnerable dependencies, and accessibility issues. Everything goes to GitHub Issues. |
| `/vibeloop` | **The single command that does everything.** Runs `/simulate → /build → /launch` in a fully autonomous loop until your project is shipped. Zero human intervention required. |

### `/vibeloop` — the one command to rule them all

If you only remember one command, make it this one:

```
/vibeloop                    # full autonomous run: simulate → build → launch
/vibeloop --skip-launch      # simulate → build only, stop before release
/vibeloop --dry-run          # full run without committing to main or publishing
/vibeloop --max-rounds 5     # cap the build loop at 5 rounds (default: 20)
/vibeloop --sim-count 5      # number of simulated users per cycle (default: 3)
/vibeloop --version 1.2.0    # pin the release version tag
```

`/vibeloop` runs the full loop repeatedly — simulate real users, fix what breaks, clear the issue backlog, ship the release — without you touching the keyboard. You invoke it once and come back to a shipped, tested, tagged release.

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

Add to your Claude Code MCP config (`.mcp.json` in project root):

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


## Diagnostics

```bash
codebase doctor    # shows exactly what's broken and why
codebase fix       # auto-repairs everything doctor flags
```

`doctor` checks: manifest freshness, AI tool injection, MCP config, git hooks, commit-msg hook, `.claude/commands/`, and `.gitignore`.

---

## All CLI commands

```bash
# Setup
# Use `npx codebase` / `codebase init` the first time: scans your project AND wires AI tools + hooks.
# Use `codebase setup` to re-wire AI tools and hooks only — it does NOT re-scan. Run it when you
# add a new AI tool or need to reinstall hooks on an existing project.
npx codebase           # full setup — scan + wire AI tools + hooks (run once per project)
codebase setup         # re-wire AI tools and hooks only (no scan)

# AI interface (what AI tools call)
codebase brief         # full project briefing
codebase next          # highest-priority open issue
codebase status        # kanban board + milestones
codebase query <path>  # any field, e.g. stack.languages or commands.test

# Issues
codebase issue create "title"                    # create GitHub issue
codebase issue close <n> --reason "why"          # close with reason
codebase issue comment <n> --message "text"      # add comment (audit trail)

# Maintenance
codebase scan          # refresh .codebase.json
codebase release       # quality gates → tag → develop→main → GitHub release
codebase doctor        # health check
codebase fix           # auto-repair

# Integrations
codebase mcp           # start MCP server
```

---

## FAQ

**Do I need Claude Code for this to work?**
Yes. `codebase` is built for Claude Code. The MCP server, slash commands, and autonomous loop all require Claude Code.

**What does "autonomous" actually mean — will it break my code?**
All AI commits go to `develop`. Nothing reaches `main` until you run `/launch` and quality gates pass. You're always in control of what ships. The AI runs tests before committing and opens issues rather than guessing when it's stuck.

**Does it send my code to anyone?**
No. Everything runs locally. The only external calls are to GitHub (via `gh` CLI) and to Anthropic's API (only when you run Claude commands).

**Will the git hooks slow down my commits?**
No. The scan runs in ~200ms on most projects.

**What if I don't use GitHub?**
The manifest and AI tool wiring work without GitHub. You lose issues, PRs, releases, and labels — but the core context injection still works.

**My project isn't JavaScript — does it work?**
Yes. Detectors cover Python, Go, Rust, Ruby, Java, PHP, Swift, C#, and more. The slash commands use `codebase brief` to detect your stack and adapt automatically.

**Can my whole team use this?**
Yes. Commit `.codebase.json` and `.claude/commands/`. Every team member with Claude Code gets the same context and the same slash commands.

---

## Install

```bash
npm install -g codebase-ai    # global (recommended)
npx codebase-ai               # try without installing
pnpm add -g codebase-ai
```

Zero runtime dependencies. Node.js 20+ only.

---

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for
guidelines on how to get started, our commit conventions, and the PR process.

Found a security issue? See [SECURITY.md](SECURITY.md) — do not open a public issue.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full version history.

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you agree to uphold it.

## License

MIT — see [LICENSE](LICENSE) for details.
