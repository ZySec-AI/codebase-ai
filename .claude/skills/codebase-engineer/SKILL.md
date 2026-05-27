---
name: codebase-engineer
description: Engineering skill for implementing features, fixing bugs, adding detectors/commands/MCP tools in the codebase-ai project. Use when implementing any code change in src/: new detector, new command, new MCP tool, bug fix, refactor. Enforces zero-deps constraint, TypeScript ESM conventions, manifest size limits, and traceability requirements. Triggers on: "implement", "add detector", "add command", "add MCP tool", "fix bug", "build feature", "write code for", "create the X detector/command/tool".
---

# codebase-engineer

Engineering playbook for the `codebase` TypeScript ESM project. Covers implementation patterns, conventions, and quality gates.

## Project Constraints (non-negotiable)

- **Zero production dependencies** — Node.js built-ins only, no exceptions
- **No AI in detectors** — pure heuristics, deterministic in/out
- **Manifest ≤ 10KB** — every new detector field must be budgeted
- **Facts not opinions** — detectors report what exists, not quality judgments
- **Detector isolation** — detectors run in `Promise.all()`, no cross-detector state

## Adding a Detector

1. Create `src/detectors/your-detector.ts` implementing `Detector` interface from `src/types.ts`
2. Register in `src/detectors/index.ts`
3. Add tests in `tests/detectors/your-detector.test.ts`
4. Budget the manifest fields: estimate JSON size of typical output before shipping

```typescript
// Detector interface contract
export interface Detector {
  name: string;
  detect(ctx: ScanContext): Promise<Partial<Manifest>>;
}
```

`ScanContext` (from `src/scanner/context.ts`) provides filesystem access — use it instead of direct `fs` calls so tests can inject mock filesystems.

## Adding a Command

1. Create `src/commands/your-command.ts` exporting `async function runYourCommand(options: CLIOptions): Promise<void>`
2. Import and register in `src/index.ts` commands map
3. Add to `COMMANDS` set in `src/utils/args.ts`
4. Add help text in `src/utils/help.ts` (both `HELP` record and `printMainHelp`)

**Common mistake**: forgetting the `args.ts` COMMANDS set registration — the command will silently fall through to the default handler.

## Adding an MCP Tool

MCP tools live in `src/mcp/server.ts`. Each tool needs:
1. A name string (snake_case)
2. A description (used by AI to decide when to call it)
3. An `inputSchema` (JSON Schema object)
4. A handler in the `switch` statement

The JSON-RPC server reads from stdin and writes to stdout — no HTTP, no external dependencies.

## Quality Gates

Run these in order before considering any implementation done:

```bash
npm run build          # tsup → dist/index.js
npm run typecheck      # tsc --noEmit
npm run test           # vitest
npm run lint           # eslint (if configured)
```

Fix all failures. Never use `as any`, `// @ts-ignore`, or `--no-verify`.

## Traceability Requirements

Every issue you work on must follow this chain:

1. **Start**: `mcp__codebase__update_issue({ issue: N, comment: "Starting work — branch feat/..." })`
2. **Implement**: commit with `#N` in message body
3. **Link**: `mcp__codebase__link_commits_to_issue({ issue: N })`
4. **Close**: `mcp__codebase__close_issue({ issue: N, reason: "fixed", comment: "..." })`

Never call `gh issue close` directly.

## Common Patterns

### Reading files safely
```typescript
import { readFileSync } from 'node:fs';
try {
  const content = readFileSync(path, 'utf8');
} catch {
  return null; // file doesn't exist or unreadable
}
```

### Glob walking (uses internal glob.ts)
```typescript
import { glob } from '../utils/glob.js';
const files = await glob('**/*.ts', { cwd: ctx.root, ignore: ['node_modules/**'] });
```

### Exponential backoff for GitHub API calls
```typescript
import { withRetry } from '../utils/retry.js';
const result = await withRetry(() => fetchFromGitHub(query));
```

## References

- Architecture deep-dive: read `CLAUDE.md` → Architecture section
- Detector examples: `src/detectors/stack.ts`, `src/detectors/git.ts`
- MCP tool examples: `src/mcp/server.ts` lines ~100-300
- Type definitions: `src/types.ts`
