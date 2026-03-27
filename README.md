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
  <b>Automated vibecoding loop. AI finds bugs, fixes them, and ships — using GitHub as shared memory.</b>
</p>

---

## Install

```bash
npm install -g codebase-ai
```

Then in your project:

```bash
npx codebase-ai
```

That's it. Every Claude session now starts with instant project context.

> Requires Node.js 20+. For the autonomous loop, also install [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code) and run `gh auth login`.

---

## What it does

`codebase` is a vibecoding loop built around three ideas:

- **Codebase = brain.** One scan writes a compact snapshot (`.codebase.json`) — your stack, commands, open issues, recent decisions. AI reads this instead of exploring files. ~95% fewer tokens, instant context.
- **GitHub = memory.** Issues, PRs, and labels are the persistent state. The loop can restart anytime and pick up where it left off.
- **Claude = execution.** Slash commands give AI a complete workflow: simulate real users, fix bugs, run tests, commit, ship.

Multiple developers can jump into the same loop. Commit `.codebase.json` and `.claude/commands/` — everyone gets the same context and commands.

---

## The loop

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   /simulate  ──▶  /build  ──▶  /launch                   ║
║       │              │             │                      ║
║   Real browser    Fix issues    Ship it                   ║
║   finds bugs      one by one    to main                   ║
║       │              │             │                      ║
║       └──────── GitHub Issues ─────┘                      ║
║                  (shared memory)                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

Or run the entire loop hands-free with one command:

```
/vibeloop
```

| Command | What it does |
|---------|-------------|
| `/simulate` | Opens your app in a real browser. Acts like real users. Fixes bugs inline, tracks complex ones as GitHub Issues. |
| `/build` | Reads open issues, picks the highest priority, implements the fix, tests it, commits, closes the issue. Repeats. |
| `/launch` | Checks quality gates (open bugs, test suite, UX score). If all pass: bumps version, tags release, merges to main, publishes GitHub Release. |
| `/vibeloop` | **Runs everything.** Continuous `/simulate → /build → /launch` loop. Zero intervention. |

First time? Run `/setup` in Claude Code to create `docs/PRODUCT.md` and your first milestone.

---

## Quick start

**Level 1 — Give Claude memory of your project** (Node.js only)

```bash
cd your-project
npx codebase-ai
```

Scans your project and wires everything: `.codebase.json`, `CLAUDE.md`, MCP server, git hooks, `.gitignore`.

**Level 2 — Autonomous dev loop**

```bash
npm install -g @anthropic-ai/claude-code
gh auth login
```

Open Claude Code in your project, then:

```
/setup      ← run once
/simulate   ← find & fix bugs
/build      ← clear the backlog
/launch     ← ship
```

Or just:

```
/vibeloop   ← does all of the above, continuously
```

---

## `/vibeloop` — zero intervention mode

```
/vibeloop                    # full autonomous run: simulate → build → launch
/vibeloop --skip-launch      # simulate → build only, stop before release
/vibeloop --dry-run          # full run without committing to main or publishing
/vibeloop --max-rounds 5     # cap the build loop at 5 rounds (default: 20)
/vibeloop --sim-count 5      # number of simulated users per cycle (default: 3)
/vibeloop --version 1.2.0    # pin the release version tag
```

Invoke once. Come back to a shipped, tested, tagged release.

---

## All CLI commands

```bash
# First run
npx codebase-ai            # scan + wire AI tools + hooks

# Re-wire after adding a new AI tool
codebase setup

# AI interface
codebase brief             # full project briefing
codebase next              # highest-priority open issue
codebase status            # kanban board + milestones
codebase query <path>      # e.g. stack.languages or commands.test

# Issues
codebase issue create "title"
codebase issue close <n> --reason "why"
codebase issue comment <n> --message "text"

# Maintenance
codebase scan              # refresh .codebase.json
codebase doctor            # health check
codebase fix               # auto-repair
codebase mcp               # start MCP server
```

---

## MCP Server

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

Add to `.mcp.json` in your project root. Tools: `project_brief`, `get_codebase`, `query_codebase`, `get_next_task`, `get_blockers`, `create_issue`, `close_issue`, `rescan_project`, `list_commands`.

---

## Team usage

Commit `.codebase.json` and `.claude/commands/`. Every teammate with Claude Code gets the same context and slash commands. The loop is resumable — restart anytime, GitHub tracks state.

---

## FAQ

**Does it send my code to anyone?**
No. Everything runs locally. External calls go only to GitHub (via `gh` CLI) and Anthropic's API (only when you run Claude commands).

**What if I don't use GitHub?**
Manifest and AI tool wiring work without GitHub. You lose issues, PRs, releases, and labels — core context injection still works.

**My project isn't JavaScript — does it work?**
Yes. 30+ languages, 100+ frameworks detected automatically.

**Will the git hooks slow down my commits?**
No. Scan runs in ~200ms.

**What does "autonomous" mean — will it break my code?**
All AI commits go to `develop`. Nothing reaches `main` until `/launch` passes quality gates.

→ [Full how-it-works docs](docs/HOW-IT-WORKS.md)

---

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started, our commit conventions, and the PR process.

Found a security issue? See [SECURITY.md](SECURITY.md) — do not open a public issue.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full version history.

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## License

MIT — see [LICENSE](LICENSE) for details.
