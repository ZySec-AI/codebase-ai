# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`codebase` gives AI tools permanent memory of any software project. One command scans a project and writes a compact snapshot (`.codebase.json`) — stack, commands, structure, open issues, recent decisions. AI tools read this instead of exploring files, saving ~95% of tokens and enabling fully autonomous workflows. Auto-wires into 7 AI tools (Claude, Cursor, Windsurf, Copilot, Aider, Cline, Continue) and exposes an MCP server so Claude can query project context, manage GitHub issues, and drive the `/simulate → /build → /launch` loop without human guidance.

## Build & Development Commands

```bash
npm run build        # Build with tsup → dist/index.js (ESM, node20 target)
npm run dev          # Watch mode (rebuilds on changes)
npm run test         # Run vitest
npm run test:watch   # Watch mode tests
```

Run the CLI locally after building:
```bash
node dist/index.js <command>
```

## Architecture

**TypeScript ESM project** — strict mode, ES2022 target, Node.js >=20, zero production dependencies. Built with tsup, tested with vitest.

### Core Pipeline

`src/index.ts` (CLI entry) → parses args (`src/utils/args.ts`) → dispatches to `src/commands/*.ts`

The main flow is: **scan → detect → merge → output manifest**

Commands are registered in `src/index.ts` as a `Record<string, handler>` map and recognized in the `COMMANDS` set in `src/utils/args.ts`.

### Detectors (`src/detectors/`)

11 parallel detectors implement the `Detector` interface (`src/types.ts`). Each receives a `ScanContext` (filesystem abstraction from `src/scanner/context.ts`) and returns a slice of the manifest. The scanner engine (`src/scanner/engine.ts`) runs all detectors via `Promise.all()` and merges results.

Registered detectors: `project`, `repo`, `structure`, `stack`, `commands`, `dependencies`, `config`, `git`, `quality`, `patterns`, `api-docs`

### Integrations (`src/integrations/`)

7 integrations implement the `Integration` interface (`src/types.ts`). Each can `detect` if its AI tool config exists, `inject` a reference to `.codebase.json` into the config (between `<!-- codebase:start/end -->` or `# codebase:start/end` markers), and `remove` it. Shared injection logic is in `shared.ts`. Git hooks (`githook.ts`) and `.gitignore` updates (`gitignore.ts`) live here too.

### MCP Server (`src/mcp/`)

JSON-RPC 2.0 over stdio. Exposes 10 tools including `project_brief`, `query_codebase`, `create_issue`. Entry: `src/mcp/server.ts`.

### GitHub Integration (`src/github/`)

Optional — requires `gh` CLI. Fetches issues, PRs, milestones via GitHub GraphQL API. Computes priorities from labels.

### Utilities (`src/utils/`)

CLI arg parser (`args.ts`), console output formatting with colors (`output.ts`), glob matching (`glob.ts`), dot-path JSON queries (`json-path.ts`). All zero-dependency.

## Key Conventions

- **Zero runtime dependencies.** Node.js built-ins only. No exceptions.
- **No AI calls in detectors.** Detection is pure heuristics — deterministic in, deterministic out.
- **Facts, not opinions.** Detectors report what exists, not what's good or bad.
- **Manifest under 10KB.** Must stay small enough for a single AI context read.
- Detectors are self-contained and run in parallel — no cross-detector dependencies.
- File walking uses recursive traversal with depth limit (default 10), ignoring common dirs (node_modules, .git, dist, etc.).

### Browser Automation

`/simulate` uses [agent-browser](https://github.com/vercel-labs/agent-browser) for headless browser automation. Installed automatically by `codebase setup`.

Commands: `open <url>`, `snapshot -i` (accessibility tree → `@e1`/`@e2` refs), `click @e1`, `fill @e2 "text"`, `screenshot`, `auth save/login <profile>`, `state save/load <name>`.

### Doctor & Fix (`src/commands/doctor.ts`, `src/commands/fix.ts`)

`doctor` runs read-only health checks against the project setup: manifest presence/freshness, detector coverage, GitHub CLI status, AI tool injection markers, MCP configs, git hooks, and `.gitignore`. `fix` auto-repairs anything `doctor` flags by re-scanning, re-injecting, reconfiguring MCP, and reinstalling hooks. Both reuse helpers exported from `init.ts` (`checkGhDetailed`, `detectGlobalTools`, `autoConfigureMcp`, `configureMcpFile`).

## Adding a Command

1. Create `src/commands/your-command.ts` exporting `async function runYourCommand(options: CLIOptions): Promise<void>`
2. Import and register in `src/index.ts` commands map
3. Add the command name to the `COMMANDS` set in `src/utils/args.ts`
4. Add help text in the `printHelp()` function in `src/utils/args.ts`

## Adding a Detector

1. Create `src/detectors/your-detector.ts` implementing the `Detector` interface
2. Register in `src/detectors/index.ts`
3. Add tests in `tests/detectors/your-detector.test.ts`

## Adding an Integration

1. Create `src/integrations/your-tool.ts` implementing the `Integration` interface
2. Register in `src/integrations/index.ts`

## Adding a Skill

Skills are `.skill` zip archives installed to `~/.claude/skills/` by `codebase setup`. They extend `/review` with stack-specific analysis (e.g. dead code elimination for Python or Next.js).

1. Create a directory with `SKILL.md` (frontmatter: name, description) + `scripts/`
2. Zip it: `zip -r your-skill.skill your-skill/`
3. Drop the `.skill` file in `skills/` — it ships with the npm package
4. Optionally add a dispatch rule in `commands/review.md` Phase 2b to auto-invoke based on detected stack

See `docs/CONTRIBUTING.md` for the full guide.

<!-- codebase:start -->
## Project Context (auto-generated by codebase)

**codebase-ai** — One command. Every AI tool understands your project instantly.
**Stack:** typescript, markdown, json, yaml, javascript

### Project Commands
| Task | Command |
|---|---|
| `dev` | `npm run dev` |
| `build` | `npm run build` |
| `test` | `npm run test` |
| `lint` | `npm run lint` |
| `format` | `npm run format` |
| `typecheck` | `npm run typecheck` |
| `check` | `npm run check` |

**This project uses `codebase` for AI context. Run commands below instead of exploring files.**

### Session Start
```
npx codebase brief
```
Returns: project identity, tech stack, commands, structure, current status, next task, blockers, decisions — everything you need in one call.

### Commands (your interface — use these, don't read files)
| Command | What it returns |
|---|---|
| `npx codebase brief` | Full project briefing — **run this first** |
| `npx codebase next` | Highest-priority task + what's in progress |
| `npx codebase status` | Kanban board, priorities, milestones |
| `npx codebase query <path>` | Any data point (e.g. `stack.languages`, `commands.test`) |
| `npx codebase issue create "title"` | Track a bug, feature, or TODO |
| `npx codebase issue close <n> --reason "why"` | Close an issue after fixing it |

### Rules
- **Never explore the codebase to discover stack/commands/structure** — it's already in `brief`
- **Check `next` before starting work** — don't duplicate in-progress tasks
- **Create issues for bugs/TODOs you find** — keep the project brain alive
- **Close issues when you fix them** — with a reason so the team knows why

### Vibekit Workflow
```
/simulate → /build → /launch
```
- `/simulate` — Playwright customer journeys find & fix bugs inline. Creates GitHub issues for arch problems.
- `/build` — Implements architectural issues autonomously. Runs until all `arch`+`vibekit` issues are closed.
- `/launch` — Gates on open bugs, generates GTM artifacts, creates GitHub release, merges to main.

### Browser Automation (agent-browser)
Commands: `open <url>`, `snapshot -i` (→ `@e1`/`@e2` refs), `click @e1`, `fill @e2 "text"`, `screenshot`, `auth save/login <profile>`, `state save/load <name>`.
<!-- codebase:end -->
