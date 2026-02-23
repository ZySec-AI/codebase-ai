# Usage

## Quick Reference

```bash
# One-time setup (recommended first command)
codebase init                         # full setup: scan + AI tools + hooks

# Core commands
codebase scan                         # generate/update .codebase.json
codebase query <path>                 # query specific field
codebase watch                        # watch files, auto-update

# AI-facing commands (AI tools call these)
codebase brief                        # full project briefing
codebase next                         # what should I work on?
codebase status                       # kanban, priorities, milestones

# Maintenance
codebase doctor                       # health check
codebase fix                          # auto-repair issues
codebase hook uninstall               # remove git hooks

# Servers
codebase mcp                          # MCP server (stdio)
codebase serve                        # HTTP API server
```

---

## Commands

### `codebase init`

Full one-time setup. Scans project, configures AI tools, installs hooks.

```bash
codebase init                         # complete setup
codebase init --dry-run               # preview changes
codebase init --sync                  # include GitHub data
```

**What it does:**
1. Scans project (stack, commands, structure, patterns)
2. Syncs GitHub data (issues, PRs, milestones) if `gh` CLI available
3. Writes `.codebase.json`
4. Injects into all detected AI tool configs
5. Installs git hooks (post-commit, post-checkout)
6. Updates `.gitignore`

**Output:** `.codebase.json` (~4KB, ~500 tokens)

---

### `codebase scan` / `codebase`

Generate `.codebase.json` manifest. Running `codebase` with no arguments is the same as `codebase scan`.

```bash
codebase                              # scan current dir
codebase scan /path/to/repo          # scan specific path
codebase scan --depth 6              # directory tree depth (default: 4)
codebase scan --categories stack,commands  # scan specific categories
codebase scan --incremental          # only re-scan changed areas
codebase scan --quiet                # no stdout, just write file
codebase scan --sync                  # sync GitHub data (requires gh)
codebase scan --verbose              # show detailed progress
```

---

### `codebase brief` (AI-facing)

Full project briefing - AI tools run this first.

```bash
codebase brief                        # everything in one call
codebase brief | jq '.stack'         # extract specific section
```

**Returns:**
- Project identity
- Tech stack
- Commands
- Structure
- Current status (issues, PRs)
- Next task to work on
- Blockers
- Recent decisions

---

### `codebase next` (AI-facing)

Show highest-priority task and what's currently in progress.

```bash
codebase next                         # what should I work on?
```

**Returns:**
- Highest-priority issue (by labels: P0 > P1 > P2)
- Current in-progress work
- Suggested next action

---

### `codebase status` (AI-facing)

Kanban board, priorities, and milestones.

```bash
codebase status                       # full project status
codebase status --mine                # only your assigned items
```

**Returns:**
- Backlog items
- In-progress items
- Completed items
- Milestone progress
- Priority-ranked issues

---

### `codebase query`

Query specific field using dot-path notation.

```bash
codebase query stack.languages            # ["typescript"]
codebase query commands.test              # "pnpm vitest"
codebase query commands.test --raw        # pnpm vitest (plain text)
codebase query repo.is_monorepo           # false
codebase query structure.entry_points     # ["src/index.ts"]
codebase query dependencies.notable       # ["next", "react", "prisma"]

# Pipe into other commands
codebase query commands.test --raw | sh   # runs: pnpm vitest
codebase query commands.dev --raw &       # runs dev server in background
```

**Common Queries:**
- `stack.languages` - Detected languages
- `stack.frameworks` - Detected frameworks
- `commands.dev` - Dev server command
- `commands.test` - Test command
- `commands.build` - Build command
- `repo.is_monorepo` - Is this a monorepo?
- `structure.entry_points` - Main entry files

---

### `codebase setup`

Scan + auto-configure every AI tool detected in the project.

```bash
codebase setup                        # detect and configure all
codebase setup --tools claude,cursor  # configure specific tools
codebase setup --dry-run              # show what would change
```

**What it does:**
1. Runs a full scan
2. Detects AI tools (CLAUDE.md, .cursorrules, .windsurfrules, etc.)
3. Adds `.codebase.json` reference to each tool's config
4. Installs git post-commit hook
5. Adds `.codebase.json` to `.gitignore`

---

### `codebase watch`

Watch filesystem for changes and re-scan automatically.

```bash
codebase watch                        # watch and re-scan
codebase watch --debounce 5000        # wait 5s after last change
codebase watch --verbose              # show what changed
```

---

### `codebase diff`

Show what changed since last scan.

```bash
codebase diff                         # compare with current manifest
codebase diff --since HEAD~5          # compare against 5 commits ago
```

---

### `codebase export`

Export manifest to tool-specific formats.

```bash
codebase export --format claude-md     # CLAUDE.md snippet
codebase export --format cursor-rules  # .cursorrules snippet
codebase export --format markdown      # human-readable markdown
codebase export --format json          # JSON (with color)
```

---

### `codebase issue` / `codebase pr`

Manage GitHub issues and pull requests.

```bash
# Issues
codebase issue create "Fix auth bug"           # create new issue
codebase issue close 42 --reason "Fixed"       # close with reason
codebase issue list                          # list all issues
codebase issue list --mine                    # list your issues

# Pull Requests
codebase pr list                             # list all PRs
codebase pr list --mine                      # list your PRs
```

---

### `codebase hook`

Manage git hooks for auto-updates.

```bash
codebase hook install                   # install post-commit hook
codebase hook uninstall                 # remove git hooks
```

---

### `codebase mcp`

Start MCP (Model Context Protocol) server for native AI tool integration.

```bash
codebase mcp                           # start stdio MCP server
```

**Exposes tools:**
- `project_brief` - Full manifest or category
- `query_codebase` - Dot-path queries
- `get_blockers` - Current blockers
- `get_next_task` - Next priority task
- `create_issue` - Create GitHub issue
- `close_issue` - Close issue with reason

**MCP Config (add to your tool's MCP settings):**
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

---

### `codebase serve`

Start HTTP API server for IDE extensions and dashboards.

```bash
codebase serve                        # localhost:7432
codebase serve --port 8080            # custom port
codebase serve --watch                # re-scan on manifest changes
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/codebase` | Full manifest |
| `GET` | `/codebase/:category` | Single category (stack, commands, etc.) |
| `GET` | `/codebase/query?path=stack.languages` | Query field |
| `POST` | `/codebase/scan` | Trigger re-scan |
| `GET` | `/health` | Health check |

---

### `codebase doctor`

Diagnose setup and configuration issues.

```bash
codebase doctor                       # run health check
```

**Checks:**
- Manifest presence/freshness
- Detector coverage
- GitHub CLI status
- AI tool injection markers
- MCP configuration
- Git hooks
- `.gitignore` configuration

---

### `codebase fix`

Auto-repair any issues found by `doctor`.

```bash
codebase fix                          # auto-repair all issues
```

---

## Global Options

| Option | Description |
|--------|-------------|
| `--help, -h` | Show help (main or command-specific) |
| `--version, -v` | Show version |
| `--verbose` | Show detailed progress output |
| `--quiet, -q` | Minimal output |
| `--path <dir>` | Target directory (default: current) |
| `--dry-run` | Preview changes without applying |

---

## Language-Specific Examples

### JavaScript/TypeScript

```bash
codebase scan                        # Detects package.json, tsconfig.json
codebase query commands.test --raw | sh  # Runs: npm test
```

### Python

```bash
# Poetry
codebase scan                        # Detects pyproject.toml, poetry.lock
codebase query commands.test --raw | sh  # Runs: poetry run pytest

# pipenv
codebase scan                        # Detects Pipfile, Pipfile.lock
codebase query commands.dev --raw | sh  # Runs: pipenv run python

# UV (new)
codebase scan                        # Detects uv.lock
codebase query commands.test --raw | sh  # Runs: uv run pytest
```

### Rust

```bash
codebase scan                        # Detects Cargo.toml, Cargo.lock
codebase query commands.test --raw | sh  # Runs: cargo test
codebase query commands.lint --raw | sh  # Runs: cargo clippy
```

### Go

```bash
codebase scan                        # Detects go.mod, go.sum
codebase query commands.dev --raw | sh  # Runs: go run main.go
codebase query commands.test --raw | sh  # Runs: go test ./...
```

### Java (Maven)

```bash
codebase scan                        # Detects pom.xml
codebase query commands.test --raw | sh  # Runs: mvn test
```

### Ruby

```bash
codebase scan                        # Detects Gemfile, Gemfile.lock
codebase query commands.test --raw | sh  # Runs: bundle exec rspec
```

### C# (.NET)

```bash
codebase scan                        # Detects .csproj
codebase query commands.test --raw | sh  # Runs: dotnet test
```

---

## Configuration

### `.codebaserc` (optional)

Override defaults for specific projects.

```json
{
  "ignore": ["node_modules", "dist", ".git", "vendor"],
  "depth": 4,
  "categories": ["repo", "structure", "stack", "commands", "dependencies", "config", "git", "quality", "patterns"],
  "output": ".codebase.json"
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEBASE_OUTPUT` | `.codebase.json` | Output file path |
| `CODEBASE_PORT` | `7432` | API server port |
| `CODEBASE_DEPTH` | `4` | Directory tree depth |
| `CODEBASE_QUIET` | `false` | Suppress stdout |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (see error message for details) |

---

## Getting Help

- **Command help:** `codebase <command> --help`
- **Main help:** `codebase --help`
- **Issues:** https://github.com/your-repo/codebase/issues
- **Docs:** https://github.com/your-repo/codebase/wiki
