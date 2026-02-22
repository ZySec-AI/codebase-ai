# Integrations

How `codebase` connects to each AI coding tool. There are three integration levels, from simplest to most powerful.

## Level 1: File Reference (works today, any tool)

The tool's config file tells the AI to read `.codebase.json` first. `codebase setup` does this automatically.

### Claude Code

Appends to `CLAUDE.md`:
```markdown
## Project Context
Read .codebase.json for project structure, tech stack, and available commands before exploring the codebase.
```

### Cursor

Appends to `.cursorrules`:
```
Read .codebase.json for project structure, tech stack, and available commands before exploring the codebase.
```

### Windsurf

Appends to `.windsurfrules`:
```
Read .codebase.json for project structure, tech stack, and available commands before exploring the codebase.
```

### GitHub Copilot

Appends to `.github/copilot-instructions.md`:
```markdown
Read .codebase.json for project structure, tech stack, and available commands before exploring the codebase.
```

### Aider

Appends to `.aider.conf.yml`:
```yaml
read: [".codebase.json"]
```

### Cline

Appends to `.clinerules`:
```
Read .codebase.json for project structure, tech stack, and available commands before exploring the codebase.
```

### Continue

Adds to `.continuerc.json`:
```json
{
  "docs": [{ "path": ".codebase.json", "name": "Project Context" }]
}
```

## Level 2: MCP Server (native tool access)

The AI tool calls `codebase` directly as a tool. No file reading, no prompt engineering.

```bash
codebase mcp    # starts MCP server over stdio
```

**Add to any MCP-compatible tool:**

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

**Tools exposed:**

### `get_codebase`

Returns the full manifest or a specific category.

```
Input:  { "category": "stack" }        // optional
Output: { "languages": ["typescript"], "frameworks": ["next.js@14.1"], ... }
```

### `query_codebase`

Returns a specific field by dot-path.

```
Input:  { "path": "commands.test" }
Output: "pnpm vitest"
```

**Supported MCP clients:**
- Claude Code
- Cursor
- Windsurf
- Continue
- Cline
- Any tool implementing the MCP spec

## Level 3: HTTP API (any client)

For IDE extensions, dashboards, CI tools, or anything that speaks HTTP.

```bash
codebase serve --port 7432
```

```bash
curl localhost:7432/codebase                     # full manifest
curl localhost:7432/codebase/stack               # just stack
curl localhost:7432/codebase/query?path=commands.test  # specific field
curl -X POST localhost:7432/codebase/scan        # trigger re-scan
```

CORS enabled by default for local browser-based tools.

## Auto-Detection

`codebase setup` detects tools by checking for their config files:

| Tool | Detection |
|------|-----------|
| Claude Code | `CLAUDE.md` exists |
| Cursor | `.cursorrules` exists |
| Windsurf | `.windsurfrules` exists |
| Copilot | `.github/copilot-instructions.md` exists |
| Aider | `.aider.conf.yml` exists |
| Cline | `.clinerules` exists |
| Continue | `.continuerc.json` exists |

If no AI tool configs exist yet, `codebase setup` creates a `CLAUDE.md` as a sensible default (since it's the most widely adopted format).

## Custom Integrations

Build your own integration by reading `.codebase.json` or calling the API:

```javascript
// Read from file
const manifest = JSON.parse(fs.readFileSync('.codebase.json', 'utf8'));
console.log(manifest.stack.frameworks); // ["next.js@14.1"]

// Read from API
const res = await fetch('http://localhost:7432/codebase/stack');
const stack = await res.json();

// Read from MCP
// Your MCP client calls get_codebase({ category: "stack" })
```
