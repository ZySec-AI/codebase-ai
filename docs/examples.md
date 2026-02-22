# Examples

## 1. First Run on Any Project

```bash
$ cd my-project
$ npx codebase
Scanning /Users/dev/my-project...
  [x] Repository (github.com/acme/webapp, main)
  [x] Structure (Next.js app-router, 5 top-level dirs)
  [x] Stack (typescript, react@18, next@14, prisma)
  [x] Commands (pnpm dev, pnpm test, pnpm lint)
  [x] Dependencies (24 direct, pnpm-lock.yaml)
  [x] Config (.env.local, next.config.js, tsconfig.json)
  [x] Git (3 recent commits, 2 active branches)
  [x] Quality (vitest, eslint, prettier, github-actions)
  [x] Patterns (app-router, react-query + zustand)

Written: .codebase.json (4.2 KB)
```

## 2. Auto-Wire Into All AI Tools

```bash
$ npx codebase setup

Scanning... done (4.2 KB)

Detected AI tools:
  [x] CLAUDE.md - added .codebase.json reference
  [x] .cursorrules - added .codebase.json reference
  [x] .github/copilot-instructions.md - added .codebase.json reference

Installed:
  [x] Git post-commit hook (auto-updates .codebase.json)
  [x] .gitignore updated

Done. All AI tools will now read your project context instantly.
```

## 3. Output for a Next.js Project

```json
{
  "version": "1.0",
  "generated_at": "2026-02-22T10:30:00Z",
  "repo": {
    "url": "git@github.com:acme/webapp.git",
    "default_branch": "main",
    "is_monorepo": false,
    "active_branches": ["main", "feature/auth-v2", "fix/cart-total"]
  },
  "structure": {
    "entry_points": ["src/app/layout.tsx"],
    "build_output": [".next", "out"],
    "tree": {
      "src/": ["app/", "components/", "lib/", "hooks/", "types/"],
      "public/": ["images/"],
      "prisma/": ["schema.prisma"]
    }
  },
  "stack": {
    "languages": ["typescript"],
    "frameworks": ["next.js@14.1", "react@18.2"],
    "package_manager": "pnpm",
    "database": "postgresql",
    "orm": "prisma",
    "styling": "tailwindcss"
  },
  "commands": {
    "dev": "pnpm dev",
    "build": "pnpm build",
    "test": "pnpm vitest",
    "lint": "pnpm eslint .",
    "format": "pnpm prettier --write ."
  },
  "dependencies": {
    "direct_count": 24,
    "lock_file": "pnpm-lock.yaml",
    "notable": ["next", "react", "prisma", "@tanstack/react-query", "zod"]
  },
  "config": {
    "env_files": [".env.local", ".env.example"],
    "config_files": ["next.config.js", "tailwind.config.ts", "tsconfig.json"],
    "feature_flags": null
  },
  "git": {
    "recent_commits": [
      "fix: cart total calculation on discount",
      "feat: add OAuth2 login flow",
      "chore: upgrade prisma to 5.x"
    ],
    "last_committers": ["alice", "bob"],
    "uncommitted_changes": false
  },
  "quality": {
    "test_framework": "vitest",
    "linter": "eslint",
    "formatter": "prettier",
    "ci": "github-actions",
    "pre_commit_hooks": true
  },
  "patterns": {
    "architecture": "app-router",
    "state_management": "react-query + zustand",
    "api_style": "server-actions + route-handlers",
    "key_modules": {
      "src/app/": "routes and pages",
      "src/lib/": "shared utilities and db client",
      "src/components/": "reusable UI components"
    }
  }
}
```

## 4. Monorepo (Turborepo)

```json
{
  "version": "1.0",
  "repo": { "is_monorepo": true, "workspace_manager": "turborepo" },
  "structure": {
    "workspaces": {
      "apps/web": { "framework": "next.js", "entry": "src/app/layout.tsx" },
      "apps/api": { "framework": "fastify", "entry": "src/server.ts" },
      "packages/ui": { "type": "library", "entry": "src/index.ts" },
      "packages/db": { "type": "library", "orm": "drizzle" }
    }
  },
  "commands": { "dev": "turbo dev", "build": "turbo build", "test": "turbo test" }
}
```

## 5. Python FastAPI

```json
{
  "version": "1.0",
  "stack": {
    "languages": ["python@3.12"],
    "frameworks": ["fastapi@0.109"],
    "package_manager": "poetry",
    "database": "postgresql",
    "orm": "sqlalchemy"
  },
  "commands": {
    "dev": "poetry run uvicorn app.main:app --reload",
    "test": "poetry run pytest",
    "lint": "poetry run ruff check .",
    "format": "poetry run ruff format ."
  },
  "structure": {
    "entry_points": ["app/main.py"],
    "tree": {
      "app/": ["api/", "models/", "services/", "core/"],
      "tests/": ["unit/", "integration/"],
      "alembic/": ["versions/"]
    }
  }
}
```

## 6. Query and Pipe

```bash
# What language is this?
$ codebase query stack.languages
["typescript"]

# How do I run tests?
$ codebase query commands.test --raw
pnpm vitest

# Actually run them
$ codebase query commands.test --raw | sh

# Feed into jq
$ codebase --json | jq '.stack.frameworks'
["next.js@14.1", "react@18.2"]
```

## 7. MCP Server Config

**Claude Code** (`~/.claude/mcp.json`):
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

**Cursor** (MCP settings):
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

Now the AI tool has `get_codebase` and `query_codebase` as callable tools. Zero file scanning.

## 8. CI Pipeline

```yaml
name: Update Codebase Manifest
on:
  push:
    branches: [main]

jobs:
  codebase:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx codebase scan
      - uses: actions/upload-artifact@v4
        with:
          name: codebase-manifest
          path: .codebase.json
```
