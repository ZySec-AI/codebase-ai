# codebase

One command. Every AI tool understands your project instantly.

## The Problem

Every AI coding session wastes **5,000-15,000 tokens** re-discovering your project. Structure, stack, commands, config - the AI figures it all out from scratch, every time. Across a team, that's millions of wasted tokens per week and slower first responses in every session.

**Without codebase:**
```
Session start → AI runs 8-12 tool calls to understand your project → ~30s + ~10K tokens
```

**With codebase:**
```
Session start → AI reads .codebase.json → ~1s + ~500 tokens
```

Average savings: **~95% fewer discovery tokens, instant project context.**

## The Solution

```bash
npx codebase
```

That's it. It scans your project, generates `.codebase.json`, and auto-wires it into every AI tool it detects.

```
$ npx codebase
Scanning /Users/dev/my-project...
  [x] Repository metadata
  [x] Project structure (Next.js app-router)
  [x] Tech stack (typescript, react, prisma)
  [x] Commands (pnpm dev / pnpm test / pnpm lint)
  [x] Dependencies (24 direct, pnpm-lock.yaml)
  [x] Git context (3 recent commits, 2 active branches)

Written: .codebase.json (4.2 KB)

Auto-configured:
  [x] CLAUDE.md - added .codebase.json reference
  [x] .cursorrules - added .codebase.json reference
  [x] .gitignore - excluded .codebase.json (contains local paths)
```

## Install

```bash
npm install -g codebase       # global
npx codebase                  # or just run it, no install needed
pnpm add -g codebase          # pnpm
yarn global add codebase      # yarn
```

## What Makes It Powerful

### 1. Zero Config

No setup file needed. Detects everything from your filesystem. Works on any project: JavaScript, Python, Go, Rust, Java, C#, Ruby, PHP.

### 2. One Command, All Tools

```bash
codebase setup    # auto-wires into every AI tool detected in your project
```

Detects and configures:

| Tool | What it does |
|------|-------------|
| **Claude Code** | Adds `Read .codebase.json first` to CLAUDE.md |
| **Cursor** | Adds reference to `.cursorrules` |
| **Windsurf** | Adds reference to `.windsurfrules` |
| **Aider** | Adds reference to `.aider.conf.yml` |
| **Copilot** | Adds reference to `.github/copilot-instructions.md` |
| **Cline** | Adds reference to `.clinerules` |
| **Continue** | Adds reference to `.continuerc.json` |

### 3. Native MCP Server

Any tool that supports MCP can call `codebase` as a tool directly. No file reading needed.

```bash
codebase mcp                  # start MCP server (stdio)
```

Add to Claude Code's MCP config:

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

Now Claude Code has `get_codebase` and `query_codebase` as native tools.

### 4. Self-Updating

```bash
codebase watch                # watches filesystem, re-scans on changes
codebase hook install         # installs git post-commit hook automatically
```

Or run in CI - the manifest stays current without thinking about it.

### 5. Pipe-Friendly

```bash
codebase query commands.test              # "pnpm vitest"
codebase query commands.test | sh         # runs: pnpm vitest
codebase query stack.languages            # ["typescript"]
codebase query --raw commands.dev         # pnpm dev (no quotes, no JSON)
codebase --json | jq '.stack.frameworks'  # pipe full manifest to jq
```

### 6. HTTP API

```bash
codebase serve                            # localhost:7432
curl localhost:7432/codebase              # full manifest
curl localhost:7432/codebase/stack        # just the stack
curl localhost:7432/codebase/commands     # just the commands
```

Any IDE extension, dashboard, or custom tool can consume it.

## What It Captures

| Category | Data |
|----------|------|
| **Repo** | URL, default branch, monorepo detection, active branches |
| **Structure** | Directory tree, entry points, build output paths |
| **Stack** | Languages, frameworks, package manager, database, ORM |
| **Commands** | Dev server, build, test, lint, format (auto-detected) |
| **Dependencies** | Direct deps with versions, lock file, notable packages |
| **Config** | Environment files, feature flags, config file locations |
| **Git** | Recent commits, active PR branches, last committers |
| **Quality** | Test framework, coverage, CI pipeline, pre-commit hooks |
| **Patterns** | Architecture style, state management, key module map |

## How It Works Under the Hood

No AI, no network calls, no magic. Just fast filesystem reads and git commands.

```
What the AI does today (per session)         What codebase does (once)
──────────────────────────────────────       ─────────────────────────────
ls -R (directory tree)         ~2K tokens    fs.readdir recursive → structure
cat package.json               ~500 tokens   parse package.json → stack, deps, commands
cat tsconfig.json, *.config.*  ~1.5K tokens  glob config files → config paths
git log, git status            ~800 tokens   child_process git → git context
read wrong files, retry        ~3K tokens    (doesn't happen - deterministic)
grep for patterns              ~1K tokens    heuristic pattern matching → patterns
read test/lint configs         ~500 tokens   check file existence → quality
──────────────────────────────────────       ─────────────────────────────
Total: ~9K tokens, 8-12 tool calls           Total: 1 file read, ~500 tokens
```

The tool uses Node.js built-in `fs`, `path`, and `child_process` to gather everything in a single pass. No dependencies. The output is a ~4KB JSON file that any tool reads in one shot.

## Why Developers Love It

- **Faster first response** - AI doesn't spend 30s exploring before answering your question
- **Consistent behavior** - Every session, every team member, every AI tool gets the same facts
- **Works offline** - No API calls, no cloud, no account. Just a local JSON file
- **Set and forget** - Git hook keeps it updated. You never think about it again
- **Not vendor-locked** - Switch from Cursor to Claude Code? The manifest still works
- **Composable** - Pipe into `jq`, `sh`, or any Unix tool. It's just JSON

## Docs

- [USAGE.md](docs/USAGE.md) - Full CLI reference
- [examples.md](docs/examples.md) - Real output examples and integrations
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design and extension points
- [WHY.md](docs/WHY.md) - The problem quantified
- [COMPARISON.md](docs/COMPARISON.md) - vs other approaches
- [INTEGRATIONS.md](docs/INTEGRATIONS.md) - How each AI tool connects

## License

MIT
