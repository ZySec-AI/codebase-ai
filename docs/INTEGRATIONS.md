# Integrations

`codebase` is built for **Claude Code**. There are two integration levels.

## Level 1: File Reference — CLAUDE.md

`codebase setup` automatically injects a context block into `CLAUDE.md`:

```markdown
<!-- codebase:start -->
## Project Context

Read `.codebase.json` for project structure, tech stack, commands, and open issues
before exploring the codebase.
<!-- codebase:end -->
```

This block is maintained automatically. Running `codebase setup` again updates it if it's stale.

## Level 2: MCP Server (native tool access)

Claude Code calls `codebase` directly as a tool via stdio JSON-RPC. No file reading needed.

```bash
codebase mcp    # starts MCP server
```

**Add to `.mcp.json` in your project root:**

```json
{
  "mcpServers": {
    "codebase": {
      "command": "npx",
      "args": ["codebase-ai", "mcp"]
    }
  }
}
```

`codebase setup` writes this file automatically.

**Tools exposed:**

| Tool | What it does |
|------|-------------|
| `project_brief` | Full project briefing — stack, commands, structure, issues |
| `get_codebase` | Full manifest or single category |
| `query_codebase` | Dot-path field query (e.g. `commands.test`) |
| `get_next_task` | Highest-priority open issue |
| `get_blockers` | Current blockers |
| `create_issue` | Create a GitHub issue |
| `close_issue` | Close a GitHub issue with reason |
| `rescan_project` | Trigger manifest refresh |
| `list_commands` | List available slash commands |

## Claude Code Hooks

`codebase setup` installs two hook scripts into `.claude/hooks/` that enforce safe git practices at the tool-call level:

**`git-guard.sh` (PreToolUse on Bash)**
- Blocks `git commit` on `main`, `master`, or `prod`
- Blocks `git push --force`
- Blocks `git push origin main/master/prod`
- Blocks commit if local branch is behind remote (forces pull first)

**`git-post.sh` (PostToolUse on Bash)**
- After pushing a feature branch, prints a PR creation reminder

These are wired into `.claude/settings.json` automatically.

## Slash Commands

`codebase setup` installs five slash commands into `.claude/commands/`:

| Command | What it does |
|---------|-------------|
| `/setup` | Bootstrap project — labels, milestone, PRODUCT.md |
| `/simulate` | AI customer journeys (agent-browser) + UX audit |
| `/build` | Autonomous loop — implement issues until backlog is clear |
| `/launch` | Gate check → tag → release → merge to main |
| `/review` | Security, quality, deps, accessibility audit |

Commit `.claude/commands/` to share these with your whole team.

## Auto-Detection

`codebase setup` detects Claude Code by checking for `CLAUDE.md` in the project root. If it doesn't exist yet, it creates one.

## Git Hooks

Three git hooks are installed into `.git/hooks/`:

| Hook | What it does |
|------|-------------|
| `pre-commit` | Runs lint + typecheck before every commit |
| `post-commit` | Runs `codebase scan --quiet` to keep manifest fresh |
| `post-checkout` | Runs `codebase scan --quiet` on branch switch |
| `commit-msg` | Blocks direct commits to `main`/`master` |
