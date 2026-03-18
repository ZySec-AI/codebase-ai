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
```
