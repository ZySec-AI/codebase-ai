# Architecture

## Design Principle

Scan once, read many. Convert expensive filesystem traversal into a cheap JSON read that any tool can consume.

## System Overview

```
                              ┌─────────────────────────────────┐
                              │         codebase CLI            │
                              │  scan | setup | query | watch   │
                              │  mcp  | serve | hook  | export  │
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
              │ MCP tool │ │HTTP API│ │ CLI  │ │AI configs│ │ pipe │
              │ (stdio)  │ │ :7432  │ │query │ │auto-wire │ │  jq  │
              └──────────┘ └────────┘ └──────┘ └──────────┘ └──────┘
```

## Core Components

### 1. CLI (`cli/`)

Entry point. No subcommand required - bare `codebase` runs scan.

```
cli/
  index.ts              # entry, arg parsing (no dependency - just process.argv)
  commands/
    scan.ts             # generate .codebase.json
    setup.ts            # scan + auto-wire into AI tools
    query.ts            # query fields from manifest
    watch.ts            # fs.watch + debounced re-scan
    mcp.ts              # MCP server over stdio
    serve.ts            # HTTP API server
    hook.ts             # git hook install/uninstall
    diff.ts             # diff against previous manifest
    export.ts           # export to tool-specific formats
```

### 2. Scanner Engine (`scanner/`)

Runs all detectors in parallel, merges results.

```
scanner/
  engine.ts             # Promise.all(detectors.map(d => d.detect(ctx)))
  cache.ts              # mtime-based incremental scanning
  resolver.ts           # merge + deduplicate detector outputs
```

### 3. Detectors (`detectors/`)

Each detector is a pure function: filesystem in, structured data out. No side effects. No AI.

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
```

**Detector interface:**

```typescript
interface Detector {
  name: string;
  category: string;
  detect(ctx: ScanContext): Promise<Record<string, unknown>>;
}

interface ScanContext {
  root: string;
  files: string[];
  readFile(path: string): Promise<string>;
  fileExists(path: string): boolean;
  glob(pattern: string): string[];
  exec(cmd: string): Promise<string>;  // for git commands
}
```

**Detection is pure heuristics:**

| Detector | How |
|----------|-----|
| `repo` | `.git/config`, `git remote -v`, `git branch -a` |
| `structure` | Walk dirs with depth limit, pattern-match entry points |
| `stack` | `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod` -> map deps to frameworks |
| `commands` | `scripts` in package.json, Makefile targets, Taskfile, Justfile |
| `dependencies` | Parse lock files, count direct deps |
| `config` | Glob `*.env*`, `*.config.*`, known filenames |
| `git` | `git log`, `git status`, `git shortlog` |
| `quality` | Presence of test configs, linter configs, `.github/workflows/` |
| `patterns` | Directory naming, import analysis, known conventions |

### 4. Integrations (`integrations/`)

Auto-wire into AI tool config files. This is what makes `codebase setup` magic.

```
integrations/
  detector.ts           # detect which AI tools are present
  claude.ts             # read/write CLAUDE.md
  cursor.ts             # read/write .cursorrules
  windsurf.ts           # read/write .windsurfrules
  copilot.ts            # read/write .github/copilot-instructions.md
  aider.ts              # read/write .aider.conf.yml
  cline.ts              # read/write .clinerules
  continue.ts           # read/write .continuerc.json
  gitignore.ts          # add .codebase.json to .gitignore
  githook.ts            # install/uninstall post-commit hook
```

Each integration implements:

```typescript
interface Integration {
  name: string;
  detect(root: string): boolean;           // is this tool configured?
  inject(root: string, manifest: string): void;  // add reference
  remove(root: string): void;              // remove reference
}
```

### 5. MCP Server (`mcp/`)

Runs over stdio. Any MCP-compatible tool calls it directly as a tool.

```
mcp/
  server.ts             # MCP protocol handler (stdio JSON-RPC)
  tools.ts              # get_codebase, query_codebase tool definitions
```

**Tools exposed:**

| Tool | Input | Output |
|------|-------|--------|
| `get_codebase` | `{ category?: string }` | Full manifest or single category |
| `query_codebase` | `{ path: string }` | Value at JSON path |

### 6. HTTP Server (`server/`)

For IDE extensions, dashboards, and any HTTP client.

```
server/
  index.ts              # node:http server, CORS enabled
  routes.ts             # /codebase, /codebase/:category, /health
```

### 7. Schema (`schema/`)

```
schema/
  v1.schema.json        # JSON Schema for .codebase.json
  types.ts              # TypeScript types
```

## How `codebase setup` Works

```
1. codebase scan              → generates .codebase.json

2. Detect AI tools:
   - CLAUDE.md exists?         → claude integration
   - .cursorrules exists?      → cursor integration
   - .windsurfrules exists?    → windsurf integration
   - .github/copilot-*.md?    → copilot integration
   - .aider.conf.yml?         → aider integration
   - .clinerules?             → cline integration

3. For each detected tool:
   - Check if .codebase.json reference already exists
   - If not, append a standard block:
     "Read .codebase.json for project context before exploring the codebase."

4. Install git hook:
   - Write .git/hooks/post-commit (or append to existing)
   - Hook runs: codebase scan --incremental --quiet

5. Update .gitignore:
   - Add .codebase.json if not present
```

## How MCP Integration Works

```
AI Tool (Claude Code, etc.)
    │
    │ stdio JSON-RPC
    ▼
codebase mcp
    │
    ├── tool: get_codebase({ category: "stack" })
    │   └── reads .codebase.json, returns stack section
    │
    └── tool: query_codebase({ path: "commands.test" })
        └── reads .codebase.json, returns "pnpm vitest"
```

The AI tool never scans the filesystem. It calls `get_codebase` once at session start and has full project context in ~500 tokens.

## Technology Choices

| Concern | Choice | Reason |
|---------|--------|--------|
| Runtime | Node.js >=18 | Universal, already installed everywhere |
| Language | TypeScript | Type safety, compiled to JS for distribution |
| Distribution | npm / pnpm / yarn / npx | Install the way you already work |
| HTTP | `node:http` | Built-in, zero deps |
| Filesystem | `node:fs/promises` | Built-in, zero deps |
| Git commands | `node:child_process` | Built-in, zero deps |
| MCP protocol | Custom (tiny) | JSON-RPC over stdio, ~100 lines |
| Arg parsing | Custom (tiny) | process.argv, ~50 lines |
| Build | `tsup` | Dev dependency only |

### Zero Runtime Dependency Philosophy

The published npm package has **zero dependencies**. Only Node.js built-ins:
- `node:http` for API server
- `node:fs/promises` + `node:path` for filesystem
- `node:child_process` for git commands

No lodash, no glob, no express, no commander. Every line is ours.

## Non-Goals

- **Not an AI** - No LLM calls. Pure heuristic detection. Deterministic.
- **Not docs** - Captures facts, not prose.
- **Not a scanner** - Detects stack, not vulnerabilities.
- **Not a daemon** - Runs once, writes a file. Watch/serve modes are optional.

## Size Budget

Manifest: under 10KB for typical projects (~500 tokens).
Package: under 100KB installed. Fast to install, fast to run.
