# Usage

## Quick Reference

```bash
codebase                     # scan current directory (alias for codebase scan)
codebase scan                # scan and generate .codebase.json
codebase setup               # scan + auto-wire into all detected AI tools
codebase query <path>        # query a specific field
codebase watch               # watch for changes, re-scan automatically
codebase mcp                 # start as MCP server (stdio)
codebase serve               # start HTTP API server
codebase hook install        # install git post-commit hook
codebase diff                # show what changed since last scan
codebase export              # export to tool-specific formats
```

## Commands

### `codebase` / `codebase scan`

Scan and generate `.codebase.json`. Running `codebase` with no arguments is the same as `codebase scan`.

```bash
codebase                             # scan current dir
codebase scan /path/to/repo          # scan specific path
codebase scan --format yaml          # yaml output
codebase scan --depth 3              # directory tree depth (default: 4)
codebase scan --categories repo,stack # scan specific categories only
codebase scan --incremental          # only re-scan changed areas
codebase scan --quiet                # no stdout, just write the file
```

### `codebase setup`

Scan + auto-configure every AI tool detected in the project. This is the recommended first-run command.

```bash
codebase setup                       # detect and configure all tools
codebase setup --tools claude,cursor # configure specific tools only
codebase setup --dry-run             # show what would be configured
```

What it does:
1. Runs a full scan
2. Detects which AI tools are configured in the project (CLAUDE.md, .cursorrules, etc.)
3. Adds a `.codebase.json` reference to each tool's config
4. Installs a git post-commit hook for auto-updates
5. Adds `.codebase.json` to `.gitignore` (contains local paths)

### `codebase query`

Query specific fields. Returns JSON by default, `--raw` for plain text.

```bash
codebase query stack.languages            # ["typescript"]
codebase query commands.test              # "pnpm vitest"
codebase query commands.test --raw        # pnpm vitest
codebase query repo.is_monorepo           # false
codebase query structure.entry_points     # ["src/index.ts"]
codebase query dependencies.notable       # ["next", "react", "prisma"]

# Pipe into other commands
codebase query commands.test --raw | sh   # runs: pnpm vitest
```

### `codebase watch`

Watch filesystem for changes and re-scan automatically. Useful during development.

```bash
codebase watch                            # watch and re-scan
codebase watch --debounce 5000            # wait 5s after last change
```

### `codebase mcp`

Start as an MCP (Model Context Protocol) server over stdio. AI tools call it as a native tool.

```bash
codebase mcp                              # start MCP server
```

Exposes two tools:
- `get_codebase` - returns full manifest or a specific category
- `query_codebase` - query a specific field path

### `codebase serve`

Start an HTTP API server for IDE extensions and custom tools.

```bash
codebase serve                            # default port 7432
codebase serve --port 8080                # custom port
codebase serve --watch                    # re-scan on file changes
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/codebase` | Full manifest |
| `GET` | `/codebase/:category` | Single category |
| `GET` | `/codebase/query?path=stack.languages` | Query field |
| `POST` | `/codebase/scan` | Trigger re-scan |
| `GET` | `/health` | Health check |

### `codebase hook`

Manage git hooks for auto-updating the manifest.

```bash
codebase hook install                     # install post-commit hook
codebase hook uninstall                   # remove hook
```

### `codebase diff`

Show what changed since last scan.

```bash
codebase diff                             # diff against current .codebase.json
codebase diff --since HEAD~5              # diff against 5 commits ago
```

### `codebase export`

Export manifest to tool-specific config formats.

```bash
codebase export --format claude-md        # outputs CLAUDE.md snippet
codebase export --format cursor-rules     # outputs .cursorrules snippet
codebase export --format markdown         # outputs human-readable markdown
```

## Configuration

### `.codebaserc` (optional)

Override defaults for specific projects. Not required - works without it.

```json
{
  "ignore": ["node_modules", "dist", ".git", "vendor"],
  "depth": 4,
  "categories": ["repo", "structure", "stack", "commands", "dependencies", "config", "git", "quality", "patterns"],
  "custom_detectors": ["./detectors/my-framework.js"],
  "output": ".codebase.json",
  "hooks": {
    "post_scan": "echo 'Scan complete'"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEBASE_OUTPUT` | `.codebase.json` | Output file path |
| `CODEBASE_PORT` | `7432` | API server port |
| `CODEBASE_DEPTH` | `4` | Directory tree depth |
| `CODEBASE_QUIET` | `false` | Suppress stdout |
