# Architecture

## Design Principle

Scan once, read many. Convert expensive filesystem traversal into a cheap JSON read that any AI tool can consume.

## System Overview

```
                              ┌─────────────────────────────────┐
                              │         codebase CLI            │
                              │  scan | setup | brief | next    │
                              │  query | status | mcp | release │
                              └──────────────┬──────────────────┘
                                             │
                              ┌──────────────▼──────────────────┐
                              │        Scanner Engine           │
                              │  parallel detector orchestrator  │
                              └──────────────┬──────────────────┘
                                             │
               ┌─────────┬──────────┬────────┼────────┬──────────┬─────────┐
               ▼          ▼          ▼        ▼        ▼          ▼         ▼
            ┌──────┐ ┌────────┐ ┌───────┐ ┌──────┐ ┌──────┐ ┌───────┐ ┌────────┐
            │ repo │ │ stack  │ │  cmds │ │ deps │ │  git │ │quality│ │patterns│
            └──┬───┘ └───┬────┘ └──┬────┘ └──┬───┘ └──┬───┘ └──┬────┘ └───┬────┘
               └─────────┴────────┴─────┬────┴────────┴────────┴──────────┘
                                        ▼
                              ┌──────────────────────┐
                              │   .codebase.json     │
                              └──────────┬───────────┘
                                         │
                    ┌────────────┬────────┼────────┬────────────┐
                    ▼            ▼        ▼        ▼            ▼
              ┌──────────┐ ┌────────┐ ┌──────┐ ┌──────────┐ ┌──────┐
              │ MCP tool │ │CLAUDE  │ │ CLI  │ │git hooks │ │ pipe │
              │ (stdio)  │ │  .md   │ │query │ │auto-sync │ │  jq  │
              └──────────┘ └────────┘ └──────┘ └──────────┘ └──────┘
```

## Core Components

### 1. CLI (`src/index.ts`)

Entry point. No subcommand required — bare `codebase` runs full init.

```
src/
  index.ts              # entry, arg parsing, command dispatch
  commands/
    scan.ts             # generate .codebase.json
    init.ts             # scan + auto-wire into Claude + hooks
    setup.ts            # re-run wiring, install slash commands + Claude hooks
    brief.ts            # full project briefing (AI-facing)
    next.ts             # highest-priority task (AI-facing)
    status.ts           # kanban board (AI-facing)
    query.ts            # query fields from manifest
    issue.ts            # create/close/comment/list GitHub issues
    mcp.ts              # MCP server over stdio
    release.ts          # gate check → tag → merge → GitHub release
    doctor.ts           # health check
    fix.ts              # auto-repair
```

### 2. Scanner Engine (`src/scanner/`)

Runs all detectors in parallel, merges results.

```
scanner/
  engine.ts             # Promise.all(detectors.map(d => d.detect(ctx)))
  cache.ts              # mtime-based incremental scanning
  context.ts            # filesystem abstraction (ScanContext)
```

### 3. Detectors (`src/detectors/`)

Each detector is a pure function: filesystem in, structured data out. No side effects. No AI calls.

```
detectors/
  repo.ts               # git remote, branches, monorepo detection
  structure.ts          # directory tree, entry points, build outputs
  stack.ts              # languages, frameworks, databases
  commands.ts           # dev/build/test/lint from package.json, Makefile, etc.
  dependencies.ts       # deps, lock files, notable packages
  config.ts             # env files, config files, feature flags
  git.ts                # recent commits, committers, changes
  quality.ts            # test framework, linter, CI, hooks
  patterns.ts           # architecture style, state mgmt, modules
  api-docs.ts           # OpenAPI / AsyncAPI detection
```

**Detector interface:**

```typescript
interface Detector {
  name: string;
  category: string;
  detect(ctx: ScanContext): Promise<Record<string, unknown>>;
}
```

**Detection is pure heuristics:**

| Detector | How |
|----------|-----|
| `repo` | `.git/config`, `git remote -v`, `git branch -a` |
| `structure` | Walk dirs with depth limit, pattern-match entry points |
| `stack` | `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod` → map deps to frameworks |
| `commands` | `scripts` in package.json, Makefile targets, Taskfile, Justfile |
| `dependencies` | Parse lock files, count direct deps |
| `config` | Glob `*.env*`, `*.config.*`, known filenames |
| `git` | `git log`, `git status`, `git shortlog` |
| `quality` | Presence of test configs, linter configs, `.github/workflows/` |
| `patterns` | Directory naming, import analysis, known conventions |

### 4. Integrations (`src/integrations/`)

Auto-wire into Claude Code. Git hooks keep the manifest fresh.

```
integrations/
  claude.ts             # read/write CLAUDE.md (inject project context block)
  gitignore.ts          # add .codebase.json to .gitignore
  githook.ts            # install post-commit / post-checkout / pre-commit hooks
  shared.ts             # shared inject/remove helpers
```

**Integration interface:**

```typescript
interface Integration {
  name: string;
  detect(root: string): boolean;    // is this tool configured?
  inject(root: string): void;       // add .codebase.json reference
  remove(root: string): void;       // remove reference
}
```

### 5. MCP Server (`src/mcp/`)

Runs over stdio. Claude Code calls it directly via `.mcp.json`.

```
mcp/
  server.ts             # JSON-RPC 2.0 over stdio
  brief.ts              # generates human-readable brief from manifest
```

**Tools exposed:**

| Tool | Description |
|------|-------------|
| `project_brief` | Full project briefing (auto-slims when context is large) |
| `get_codebase` | Full manifest or single category with sparse field selection |
| `query_codebase` | Dot-path field query |
| `get_next_task` | Highest-priority open issue |
| `get_blockers` | Current blockers |
| `create_issue` | Create GitHub issue |
| `close_issue` | Close issue with reason |
| `update_issue` | Add/remove labels, set assignee |
| `get_issue` | Full issue detail |
| `get_pr` | Full PR detail |
| `get_plan` | Read PLAN.md |
| `update_plan` | Append to PLAN.md |
| `rescan_project` | Trigger manifest refresh |
| `refresh_status` | Refresh GitHub data only |
| `list_commands` | List available slash commands |
| `list_skills` | List installed skills |
| `generate_handoff` | Generate HANDOFF.md |
| `token_budget` | Token count, grade, per-section breakdown |

### 6. GitHub Integration (`src/github/`)

Optional — only active when `gh` CLI is authenticated. Protected by circuit breaker.

```
github/
  sync.ts               # fetch issues, PRs, milestones via GraphQL
  graphql.ts            # GraphQL query builder with retry + circuit breaker
  issues.ts             # create / close / comment issues
```

### 7. Claude Code Hooks (`.claude/hooks/`)

Installed into user projects by `codebase setup`. Enforces safe git practices at the tool-call level.

```
.claude/
  hooks/
    git-guard.sh        # PreToolUse — blocks commits to main, force push, commit if behind remote
    git-post.sh         # PostToolUse — PR reminder after feature branch push
  settings.json         # wires both hooks into Claude Code
  commands/             # slash commands copied from package commands/
```

### 8. Resilience Utilities (`src/utils/`)

Fault-tolerance primitives used by GitHub API, MCP server, and scanner.

```
utils/
  retry.ts              # exponential backoff with jitter, configurable retryable predicate
  circuit-breaker.ts    # closed/open/half-open state machine, auto-recovery, fallback support
  secrets.ts            # regex-based secret scanner (20+ patterns, never exposes values)
  tokens.ts             # token estimation, grading (A-D), context budget management
```

## How `codebase setup` Works

```
1. Scan project          → generates .codebase.json
2. Inject CLAUDE.md      → adds <!-- codebase:start --> block
3. Configure MCP         → writes .mcp.json
4. Install git hooks     → pre-commit, post-commit, post-checkout, commit-msg
5. Install Claude hooks  → .claude/hooks/ + .claude/settings.json
6. Install slash cmds    → commands/*.md → .claude/commands/
7. Update .gitignore     → adds .codebase.json
```

## Technology Choices

| Concern | Choice | Reason |
|---------|--------|--------|
| Runtime | Node.js >=18 | Universal, pre-installed everywhere |
| Language | TypeScript (strict) | Type safety, compiled to ESM |
| Distribution | npm / npx | Install the way you already work |
| Filesystem | `node:fs/promises` | Built-in, zero deps |
| Git | `node:child_process` | Built-in, zero deps |
| MCP protocol | Custom JSON-RPC | ~100 lines, zero deps |
| Build | `tsup` | Dev dependency only |

### Zero Runtime Dependency Philosophy

The published npm package has **zero runtime dependencies**. Every production line uses Node.js built-ins only.

## Non-Goals

- **Not an AI** — No LLM calls. Pure heuristic detection. Deterministic.
- **Not docs** — Captures facts, not prose.
- **Not a CVE scanner** — Detects leaked secrets and license issues, not known vulnerabilities (use `npm audit` or Snyk for CVEs).
- **Not a daemon** — Runs once, writes a file. Git hooks keep it fresh.

## Size Budget

Manifest: under 10KB for typical projects (~500 tokens).
Package: under 250KB installed. Fast to install, fast to run.
