# Contributing to codebase-ai

Thank you for your interest in contributing! This document explains how to
participate in this project effectively.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Report Bugs](#how-to-report-bugs)
- [How to Request Features](#how-to-request-features)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Commit Conventions](#commit-conventions)
- [Coding Standards](#coding-standards)
- [Architecture Rules](#architecture-rules)
- [Adding Detectors, Commands, and Skills](#adding-detectors-commands-and-skills)

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you agree to uphold it.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/codebase
   cd codebase
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature
   ```

## How to Report Bugs

Use the [bug report template](https://github.com/ZySec-AI/codebase/issues/new?template=bug_report.yml).

Include:
- Your OS and Node.js version (`node --version`)
- `codebase-ai` version (`codebase --version`)
- Steps to reproduce
- Expected vs actual behavior
- Any error output

**Security vulnerabilities:** Do NOT open public issues. See [SECURITY.md](SECURITY.md).

## How to Request Features

Use the [feature request template](https://github.com/ZySec-AI/codebase/issues/new?template=feature_request.yml).

For significant changes, open an issue first to discuss the approach before
writing code — this prevents wasted effort.

## Development Setup

```bash
npm install                # install dev dependencies
npm run build:dev          # fast rebuild, no minification, with sourcemaps
npm link                   # makes `codebase` available globally as local build
```

Or run without building:
```bash
npx tsx src/index.ts <command>
```

Run the full quality check before opening a PR:
```bash
npm run check              # typecheck + lint + format check
npm test                   # run all tests
```

## Pull Request Process

1. **Open an issue first** for significant changes — discuss before coding
2. Keep PRs focused: one concern per PR
3. All CI checks must pass (typecheck, lint, format, tests, build)
4. One approving review required from a maintainer
5. Add a `CHANGELOG.md` entry under `[Unreleased]` for user-visible changes
6. Expect a response within 7 days; follow up if you haven't heard back

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>
```

Types: `feat` | `fix` | `docs` | `style` | `refactor` | `perf` | `test` | `build` | `ci` | `chore`

Examples:
- `feat(detector): add Go module detector`
- `fix(mcp): handle missing manifest gracefully`
- `docs: update installation instructions`
- `chore: bump version to 0.3.3`

Breaking changes: add `!` after type (`feat!: rename scan to refresh`) or include
a `BREAKING CHANGE:` footer in the commit body.

## Coding Standards

- **TypeScript strict mode** — `tsc --noEmit` must pass with zero errors
- **No `any`** unless explicitly justified with a comment
- **Zero runtime dependencies** — Node.js built-ins only, no exceptions
- Run `npm run format` and `npm run lint` before pushing
- All exported functions should have JSDoc comments

## Architecture Rules

These rules are non-negotiable:

| Rule | Reason |
|------|--------|
| **Zero runtime dependencies** | The CLI ships as a single file; no `node_modules` in prod |
| **No AI calls in detectors** | Detection is pure heuristics — deterministic in, deterministic out |
| **Facts, not opinions** | Detectors report what exists, not what's good or bad |
| **Manifest under 10KB** | Must fit in a single AI context read |
| **Detectors run in parallel** | No cross-detector dependencies allowed |

## Adding Detectors, Commands, and Skills

### Adding a Detector

Detectors are pure functions: filesystem in, structured data out.

1. Create `src/detectors/your-detector.ts` implementing the `Detector` interface
2. Register in `src/detectors/index.ts`
3. Add tests in `tests/detectors/your-detector.test.ts`

```typescript
import type { Detector } from "../types.js";

export const yourDetector: Detector = {
  name: "your-detector",
  category: "your-category",
  async detect(ctx) {
    const hasConfig = ctx.fileExists("your.config.json");
    return { detected: hasConfig };
  },
};
```

### Adding a Command

1. Create `src/commands/your-command.ts` exporting `async function runYourCommand(options: CLIOptions): Promise<void>`
2. Import and register in `src/index.ts`
3. Add the command name to the `COMMANDS` set in `src/utils/args.ts`
4. Add help text in `src/utils/help.ts`

### Adding a Skill

Skills are `.skill` zip archives installed to `~/.claude/skills/` by `codebase setup`.

1. Create a directory with `SKILL.md` (frontmatter: `name`, `description`) and an optional `scripts/` folder
2. Package it: `zip -r your-skill.skill your-skill/`
3. Drop the `.skill` file in `skills/` — it ships with the npm package
4. Optionally add a dispatch rule in `commands/review.md` to auto-invoke based on detected stack

### Adding an Integration

Integrations wire `.codebase.json` into AI tool configs.

1. Create `src/integrations/your-tool.ts` implementing the `Integration` interface
2. Register in `src/integrations/index.ts`

## Project Structure

```
src/
  commands/       CLI command implementations
  detectors/      11 parallel filesystem detectors
  integrations/   AI tool config injection (Claude, Cursor, etc.)
  github/         GitHub CLI / GraphQL integration
  mcp/            MCP server (stdio JSON-RPC 2.0)
  scanner/        engine + cache + context
  server/         local HTTP API
  utils/          arg parsing, output formatting, glob, json-path
  types.ts        all shared interfaces
tests/
  detectors/      one test file per detector
  integrations/   integration tests
  e2e/            end-to-end CLI tests
commands/         slash command .md files (copied to .claude/commands/ by setup)
skills/           .skill archives (copied to ~/.claude/skills/ by setup)
```
