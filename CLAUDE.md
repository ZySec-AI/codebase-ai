# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`codebase` gives AI tools permanent memory of any software project. One command scans a project and writes a compact snapshot (`.codebase.json`) — stack, commands, structure, open issues, recent decisions. AI tools read this instead of exploring files, saving ~95% of tokens and enabling fully autonomous workflows. Auto-wires into Claude Code and exposes an MCP server so Claude can query project context, manage GitHub issues, and drive the `/simulate → /build → /launch` loop without human guidance.

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

12 parallel detectors implement the `Detector` interface (`src/types.ts`). Each receives a `ScanContext` (filesystem abstraction from `src/scanner/context.ts`) and returns a slice of the manifest. The scanner engine (`src/scanner/engine.ts`) runs all detectors via `Promise.all()` and merges results.

Registered detectors: `project`, `repo`, `structure`, `stack`, `commands`, `dependencies`, `config`, `git`, `quality`, `patterns`, `api-docs`, `graph`

### Integrations (`src/integrations/`)

1 integration (Claude Code) implements the `Integration` interface (`src/types.ts`). It can `detect` if its config exists, `inject` a reference to `.codebase.json` into CLAUDE.md (between `<!-- codebase:start/end -->` markers), and `remove` it. Shared injection logic is in `shared.ts`. Git hooks (`githook.ts`) and `.gitignore` updates (`gitignore.ts`) live here too.

### MCP Server (`src/mcp/`)

JSON-RPC 2.0 over stdio. Exposes 25 tools including `project_brief` (supports `slim: true`, auto-slims when context is large), `get_next_task`, `create_issue`, `update_issue`, `get_issue`, `get_pr`, `token_budget`, `get_plan`, `update_plan`, `list_skills`, `refresh_status`, `generate_handoff`, plus 7 graph tools: `get_impact_radius`, `get_review_context`, `query_graph`, `rebuild_graph`, `get_dead_code`, `get_cycles`, `get_orphans`. Entry: `src/mcp/server.ts`.

### Graph Module (`src/graph/`)

Persistent call/import graph at `.codebase/graph.json`. Regex AST-lite parsers for TS/JS, Python, Go, Rust — zero new runtime deps. Supports incremental rebuild (SHA-256 content hash diff). Powers blast-radius analysis in `/review`, dead-code/cycles/orphans detection, and 7 MCP tools. No configuration required — `codebase graph build` to initialize.

Cleanup queries (post-build):

- `getDeadCode(graph, root)` — entrypoint reachability BFS. Combines `detectEntrypoints()` with in-degree-0 files as seeds; reports unreachable files plus exported symbols inside reachable files that no other file calls. Each dead export carries a `confidence: "high" | "low"` flag — **high** = declaring file has zero importers (very likely dead), **low** = file is imported but no explicit `calls` edge resolved (may be reached via property-access dispatch the regex parser can't track, e.g. `mod.fn()` or `Record<string, handler>` lookups).
- `getCycles(graph)` — iterative Tarjan SCC over file-level import edges. Returns each SCC of size >= 2 (or self-loop) as a sorted list of files.
- `getOrphans(graph, root)` — files with zero in- and out-edges, excluding detected entry points.

The TS/JS parser handles multi-line braced imports — `collapseBracedImports()` flattens `import { a, b, } from "x"` blocks into one logical line for the import-detection regex pass. Declaration line numbers are preserved by keeping the original `lines` array for declaration scanning.

### GitHub Integration (`src/github/`)

Optional — requires `gh` CLI. Fetches issues, PRs, milestones via GitHub GraphQL API. Computes priorities from labels.

### Utilities (`src/utils/`)

CLI arg parser (`args.ts`), console output formatting with colors (`output.ts`), glob matching (`glob.ts`), dot-path JSON queries (`json-path.ts`), token estimation (`tokens.ts`), exponential backoff retry (`retry.ts`), circuit breaker for external APIs (`circuit-breaker.ts`), secret scanning for 20+ credential patterns (`secrets.ts`). All zero-dependency.

## Key Conventions

- **Zero runtime dependencies.** Node.js built-ins only. No exceptions.
- **No AI calls in detectors.** Detection is pure heuristics — deterministic in, deterministic out.
- **Facts, not opinions.** Detectors report what exists, not what's good or bad.
- **Manifest under 10KB.** Must stay small enough for a single AI context read.
- Detectors are self-contained and run in parallel — no cross-detector dependencies.
- File walking uses recursive traversal with depth limit (default 10), ignoring common dirs (node_modules, .git, dist, etc.).

## Traceability Contract

Every piece of agent work in this project — and every project that runs `codebase setup` — must produce a complete audit chain `prompt → status → commits → close`. This is enforced in code, not just documented.

**Capture layer** — `src/prompts/store.ts` writes every user prompt to `.codebase/prompts.jsonl` (mode 0o600, owner-only). The `prompt-capture.sh` UserPromptSubmit hook (installed by `setup`) runs in a detached background subshell so it never blocks the prompt. Optional GitHub mirror is **opt-in**: enable by exporting `CODEBASE_PROMPT_MIRROR=1` or passing `--mirror`. Token-precise redaction (JWT, PEM blocks, prefixed cloud keys, bearer-style tokens) runs over a 256 KB cap before write *or* mirror; if anything matches, the mirrored snippet is replaced with a generic notice rather than partial content.

**Enforce layer** — MCP `close_issue` requires `comment` + `reason` (one of `fixed | wont-fix | duplicate | not-reproducible | obsolete`). It composes a structured comment (reason + comment + evidence + commits + trace footer) and **closes the issue first, then posts the comment**. If the comment post fails the issue is still closed (recoverable via `comment_issue`); the timeline can never show `Closed: …` on an issue that's still open. `comment_issue` requires a `kind` (`status | evidence | decision | close-reason | note`) and adds the same trace footer. `update_issue` accepts a `comment` so status flips are visible. `link_commits_to_issue` scans recent commits for `#N` refs (with an allowlisted `since` arg) and posts a consolidated evidence comment. Every MCP tool call writes a `prompt_id` into `.codebase/session-log.jsonl`, closing the loop.

**Document layer** — every slash command (`/build`, `/simulate`, `/review`, `/launch`, `/vibeloop`) carries a "Traceability contract" block at the top that names the exact MCP tools to call and forbids raw `gh issue close`.

**Rules for Claude in this repo:**
1. Never call `gh issue close` directly — always go through MCP `close_issue`.
2. Post a `status` comment via `update_issue` or `comment_issue` when starting work.
3. Use `link_commits_to_issue` between implementation and close.
4. When in doubt about user intent, call `get_prompt_history { issue: N }` to see what triggered the work.
5. The trace footer (`---\n_<kind> via codebase MCP @ <ts> · branch <b> · prompt <id>_`) is the canonical audit marker — don't edit or remove it on existing comments.

### Browser Automation

`/simulate` uses [agent-browser](https://github.com/vercel-labs/agent-browser) for headless browser automation. Installed automatically by `codebase setup`.

Commands: `open <url>`, `snapshot -i` (accessibility tree → `@e1`/`@e2` refs), `click @e1`, `fill @e2 "text"`, `screenshot`, `auth save/login <profile>`, `state save/load <name>`.

### Doctor & Fix (`src/commands/doctor.ts`, `src/commands/fix.ts`)

`doctor` runs read-only health checks against the project setup: manifest presence/freshness, detector coverage, GitHub CLI status, AI tool injection markers, MCP configs, git hooks, Claude Code hooks (including session-start), and `.gitignore`. Includes a TOKEN HEALTH section (CLAUDE.md size, injection block size, MCP server count, session hook presence). `fix` auto-repairs anything `doctor` flags by re-scanning, re-injecting, reconfiguring MCP, reinstalling hooks, and restoring the session-start hook. Both reuse helpers exported from `init.ts` (`checkGhDetailed`, `detectGlobalTools`, `autoConfigureMcp`, `configureMcpFile`).

## Adding a Command

1. Create `src/commands/your-command.ts` exporting `async function runYourCommand(options: CLIOptions): Promise<void>`
2. Import and register in `src/index.ts` commands map
3. Add the command name to the `COMMANDS` set in `src/utils/args.ts`
4. Add help text in `src/utils/help.ts` (both `HELP` record and `printMainHelp`)

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
**Stack:** typescript, markdown, yaml, json, javascript

### Project Commands

| Task        | Command             |
| ----------- | ------------------- |
| `dev`       | `npm run dev`       |
| `build`     | `npm run build`     |
| `test`      | `npm run test`      |
| `lint`      | `npm run lint`      |
| `format`    | `npm run format`    |
| `typecheck` | `npm run typecheck` |
| `check`     | `npm run check`     |

**This project uses `codebase` for AI context. Run commands below instead of exploring files.**

### Session Start

```
codebase brief
```

Returns: project identity, tech stack, commands, structure, current status, next task, blockers, decisions — everything you need in one call.

### Commands (your interface — use these, don't read files)

| Command                                   | What it returns                                           |
| ----------------------------------------- | --------------------------------------------------------- |
| `codebase brief`                          | Full project briefing — **run this first**                |
| `codebase next`                           | Highest-priority task + what's in progress                |
| `codebase status`                         | Kanban board, priorities, milestones                      |
| `codebase query <path>`                   | Any data point (e.g. `stack.languages`, `commands.test`)  |
| `codebase issue create "title"`           | Track a bug, feature, or TODO                             |
| `codebase issue close <n> --reason "why"` | Close an issue after fixing it                            |
| `codebase handoff`                        | Generate HANDOFF.md — session transfer for next agent     |
| `codebase tokens`                         | Show token budget report for this project                 |
| `codebase sessions`                       | Recent session log: provider, model, duration per project |
| `codebase graph build`                    | Build call/import graph → `.codebase/graph.json`          |
| `codebase graph impact --pr N`            | Blast radius for PR N: callers + tests + risk score       |
| `codebase graph query callers <symbol>`   | Who calls this symbol?                                    |
| `codebase graph stats`                    | Node/edge counts per language                             |
| `codebase graph dead`                     | Unreachable files + dead exports (BFS from entry points)  |
| `codebase graph cycles`                   | Import cycles (Tarjan SCC) — refactor candidates          |
| `codebase graph orphans`                  | Files with zero importers and zero imports                |

### Maintenance

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `codebase doctor`   | Health check — diagnose broken setup         |
| `codebase fix`      | Auto-repair issues found by doctor           |
| `codebase skills`   | List installed skills and their capabilities |
| `codebase config`   | Show stored API keys and effective env vars  |
| `codebase sessions` | View recent Claude Code session history      |

### Rules

- **Never explore the codebase to discover stack/commands/structure** — it's already in `brief`
- **Check `next` before starting work** — don't duplicate in-progress tasks
- **Create issues for bugs/TODOs you find** — keep the project brain alive
- **Close issues when you fix them** — with a reason so the team knows why
- **If any command fails, run `codebase doctor` then `codebase fix`** — self-heal before asking for help

### Workflow Tips

- **Subagents for isolation**: use Task tool for large refactors — keeps main session clean
- **Session hygiene**: keep sessions focused; start fresh rather than pushing through context limits
- **Commit often**: detailed commit messages serve as memory between sessions
- **End of session**: run `codebase handoff` before closing to save state for the next agent
- **Model selection**: Opus for architecture/security decisions; Sonnet for implementation/iteration
- **Rewind mistakes**: ESC ESC after a bad edit — reverts and lets you try a different approach

### Where to Find More

- Vibekit loop: see `.claude/commands/` for /simulate, /build, /launch
- MCP tools: call `list_commands` or `list_skills` via MCP server
- Browser automation: see `~/.claude/skills/simulate/SKILL.md`
- Call graph: `codebase graph build` then `get_impact_radius` / `query_graph` via MCP
<!-- codebase:end -->
