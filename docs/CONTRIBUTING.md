# Contributing

## Running Locally

```bash
npm install       # install dev dependencies
npm run build     # build dist/index.js
npm test          # run all tests
npm run check     # typecheck + lint + format check
```

Run the CLI locally:
```bash
node dist/index.js <command>
```

---

## Adding a Detector

Detectors are pure functions: filesystem in, structured data out. No AI calls, no side effects.

1. Create `src/detectors/your-detector.ts`
2. Implement the `Detector` interface
3. Register in `src/detectors/index.ts`
4. Add tests in `tests/detectors/your-detector.test.ts`

```typescript
import type { Detector } from "../types.js";

export const yourDetector: Detector = {
  name: "your-detector",
  category: "your-category",
  async detect(ctx) {
    const hasConfig = ctx.fileExists("your.config.json");
    return { detected: hasConfig };
  }
};
```

---

## Adding a Command

1. Create `src/commands/your-command.ts` exporting `async function runYourCommand(options: CLIOptions): Promise<void>`
2. Import and register in `src/index.ts`
3. Add the command name to the `COMMANDS` set in `src/utils/args.ts`
4. Add help text in `src/utils/help.ts`

---

## Adding a Skill

Skills are Claude Code `.skill` archives (zip files) that get installed to `~/.claude/skills/` during `codebase setup`. They extend `/review` with stack-specific analysis.

### 1. Create the skill

A `.skill` file is a zip containing a directory with at least a `SKILL.md`:

```
your-skill/
  SKILL.md              # frontmatter (name, description) + workflow instructions
  scripts/              # analysis scripts the skill invokes
    analyze.py          # or .js, .sh — whatever the skill needs
  references/           # optional reference docs (false positives, entry points)
    patterns.md
```

The `SKILL.md` frontmatter must include:

```yaml
---
name: your-skill
description: >
  One-paragraph description. Include trigger phrases so Claude knows when to invoke it.
---
```

### 2. Package it

```bash
cd /path/to/your-skill-source
zip -r your-skill.skill your-skill/
```

### 3. Bundle it with codebase

Copy the `.skill` file to the `skills/` directory in this repo:

```bash
cp your-skill.skill skills/
```

It ships automatically — `package.json` includes `"skills"` in the `files` array.

### 4. Wire it into `/review` (optional)

If the skill should run automatically during code review, add a dispatch rule to `commands/review.md` in the **Phase 2b — Dead Code Declutter** section:

```markdown
| `LANGUAGES` contains `go` | Run `/your-skill` |
```

The detection logic reads `stack.languages` and `stack.frameworks` from the codebase brief, so any language/framework the scanner detects can trigger a skill.

### 5. Test installation

```bash
npm run build
node dist/index.js setup
# Verify: ls ~/.claude/skills/your-skill.skill
```

### Currently bundled skills

| Skill | Triggers on | What it does |
|-------|-------------|--------------|
| `py-declutter` | Python projects | AST call graph → dead code, unused functions, duplicate consolidation |
| `nextjs-declutter` | Next.js projects | Import graph → unused files, dead exports, dead components, duplicates |
| `arch-review` | Any project (manual) | 5-expert panel × 3 cycles → top 10 architectural changes, parallel implementation |

---

## Adding an Integration

Integrations wire `.codebase.json` into AI tool configs (Claude, Cursor, Copilot, etc.).

1. Create `src/integrations/your-tool.ts` implementing the `Integration` interface
2. Register in `src/integrations/index.ts`

```typescript
import type { Integration, InjectResult } from "../types.js";

export const yourToolIntegration: Integration = {
  name: "your-tool",
  detect(root: string): boolean {
    // Return true if this tool's config exists
  },
  async inject(root: string): Promise<InjectResult> {
    // Inject codebase reference between markers
  },
  remove(root: string): void {
    // Remove injected content
  },
};
```

---

## Rules

- **Zero runtime dependencies.** Node.js built-ins only. No exceptions.
- **No AI calls in detectors.** Detection is pure heuristics — deterministic in, deterministic out.
- **Facts, not opinions.** Detectors report what exists, not what's good or bad.
- **Manifest under 10KB.** Must stay small enough for a single AI context read.
- **strict TypeScript.** `tsc --noEmit` must pass with zero errors.
- **Tests for detectors.** Every new detector needs a test file.

---

## Code Style

```bash
npm run format       # prettier --write
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
```

The `npm run check` script runs all three.

---

## Project Structure

```
src/
  commands/       # CLI commands
  detectors/      # filesystem detectors (11 parallel)
  integrations/   # Claude Code wiring (injection, git hooks)
  github/         # GitHub CLI integration
  mcp/            # MCP server (stdio JSON-RPC)
  scanner/        # engine + cache + context
  server/         # HTTP API server
  utils/          # arg parsing, output, glob, json-path
  types.ts        # all shared interfaces
  globals.d.ts    # __VERSION__ declaration
tests/
  detectors/      # one test file per detector
  integrations/   # integration tests
  e2e/            # end-to-end CLI tests
  scanner/        # scanner engine tests
  github/         # GitHub integration tests
commands/         # slash commands (copied to .claude/commands/ by setup)
skills/           # .skill archives (copied to ~/.claude/skills/ by setup)
```
