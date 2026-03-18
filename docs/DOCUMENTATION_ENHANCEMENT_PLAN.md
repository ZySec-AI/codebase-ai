# Documentation Enhancement Plan
**Created:** 2026-02-23
**Status:** Ready for Implementation
**Priority:** P1 (High)

## Executive Summary

Comprehensive audit of all documentation revealed solid foundation with specific enhancement opportunities. The documentation is well-structured but needs updates for new features (multi-language support, GitHub GraphQL, enhanced CLI help) and improved open-source readiness.

## Current State Assessment

### ✅ Strengths

1. **Comprehensive Coverage** - All major features documented
2. **Good Organization** - Logical document structure
3. **Real Examples** - Practical usage shown
4. **Technical Depth** - Architecture doc is thorough

### ⚠️ Areas for Improvement

1. **Outdated Content** - Missing new features (GraphQL, multi-language)
2. **Inconsistent Formatting** - Some docs need polish
3. **Missing Open-Source Elements** - No contributing guide, no troubleshooting
4. **Incomplete Examples** - Need more language/project type examples

---

## Document-by-Document Analysis

### README.md

**Status:** ✅ Recently Enhanced
**Last Updated:** 2026-02-23

**Completed:**
- ✅ Added badges (version, downloads, license, stars)
- ✅ Added 30-second quick start
- ✅ Better visual hierarchy with emoji
- ✅ Improved feature descriptions
- ✅ Enhanced installation section
- ✅ Professional footer

**Remaining Enhancements:**
- ⏳ Add screenshot/GIF of CLI in action
- ⏳ Add comparison chart with competitors
- ⏳ Add troubleshooting section
- ⏳ Add "What's New" section for version updates

**Priority:** P2 (Nice to have - already production-ready)

---

### docs/USAGE.md

**Status:** ⚠️ Needs Updates
**Last Reviewed:** 2026-02-23

**Current State:**
- Comprehensive CLI reference
- Good examples for basic commands
- Configuration and env vars documented

**Missing Content:**
- ❌ New `--verbose` flag not documented
- ❌ New `--examples` flag not documented
- ❌ AI-facing commands (brief, next, status) not fully documented
- ❌ GitHub commands (issue, pr) not documented
- ❌ Multi-language examples missing
- ❌ Monorepo usage examples missing

**Required Updates:**

1. **Add New Command Sections:**

```markdown
## AI-Facing Commands

### `codebase brief`
Full project briefing - AI runs this first.

### `codebase next`
Show highest-priority task and what's in progress.

### `codebase status`
Kanban board, priorities, milestones.

### `codebase issue`
Manage GitHub issues.
```

2. **Add Multi-Language Examples:**

```markdown
### Language-Specific Examples

#### Python (poetry)
\`\`\`bash
codebase scan  # Detects pyproject.toml, poetry.lock
codebase query commands.test --raw | sh  # Runs: poetry run pytest
\`\`\`

#### Rust (Cargo)
\`\`\`bash
codebase scan  # Detects Cargo.toml, Cargo.lock
codebase query commands.test --raw | sh  # Runs: cargo test
\`\`\`

#### Go (go.mod)
\`\`\`bash
codebase scan  # Detects go.mod, go.sum
codebase query commands.dev --raw | sh  # Runs: go run
\`\`\`
```

3. **Add New Flags:**

```markdown
## Global Options

| Flag | Description |
|------|-------------|
| `--verbose` | Show detailed progress output |
| `--examples` | Show usage examples for command |
| `--quiet` | Minimal output |
```

**Priority:** P1 (High - important for new features)

**Estimated Effort:** 2-3 hours

---

### docs/ARCHITECTURE.md

**Status:** ⚠️ Needs Updates
**Last Reviewed:** 2026-02-23

**Current State:**
- Solid technical foundation
- Good detector/integrator descriptions
- Clear system overview diagram

**Missing Content:**
- ❌ GitHub GraphQL integration not documented
- ❌ Enhanced issue/PR data fields not shown
- ❌ MCP server implementation details missing
- ❌ Progress indicators not documented
- ❌ New help system not covered

**Required Updates:**

1. **Add GraphQL Section:**

```markdown
### GitHub Integration (`src/github/`)

Enhanced with GraphQL for comprehensive data fetching:

**Files:**
- `sync.ts` - Main orchestrator with REST fallback
- `graphql.ts` - GraphQL client with error handling
- `issues.ts` - Issue management (create, close, list)

**GraphQL Features:**
- Enhanced issues (comments, reactions, timeline)
- Enhanced PRs (CI status, mergeability, review decisions)
- Milestone progress with issue counts
- Releases (tags, authors, prerelease flags)
- Project boards (Projects v2)

**Fallback Strategy:**
1. Try GraphQL (gh CLI >= 2.0)
2. Fall back to REST API on failure
3. Silent failures - no crashes
```

2. **Update MCP Section:**

```markdown
### MCP Server (`src/mcp/`)

JSON-RPC 2.0 over stdio. Zero-dependency implementation.

**Tools Exposed:**
- `project_brief` - Full manifest or category
- `query_codebase` - Dot-path queries
- `get_codebase` - Alias for project_brief
- `create_issue` - Create GitHub issue
- `close_issue` - Close issue with reason
- `get_blockers` - Show current blockers
- `get_next_task` - Highest-priority task

**Protocol:**
- Stdio in/out
- Line-delimited JSON-RPC 2.0
- Request ID tracking
- Error responses with codes
```

**Priority:** P1 (High - documents new features)

**Estimated Effort:** 2-3 hours

---

### docs/CONTRIBUTING.md

**Status:** ❌ Incomplete
**Last Reviewed:** 2026-02-23

**Current State:**
- Very minimal (only detector/integrator adding instructions)

**Missing Content:**
- ❌ Development setup instructions
- ❌ Code style guidelines
- ❌ Pull request process
- ❌ Test writing guidelines
- ❌ Commit message conventions

**Required Content:**

```markdown
# Contributing to codebase

Thank you for your interest in contributing!

## Development Setup

1. Clone and install:
\`\`\`bash
git clone https://github.com/your-repo/codebase.git
cd codebase
pnpm install
\`\`\`

2. Build and test:
\`\`\`bash
pnpm run build      # Build to dist/
pnpm run dev        # Watch mode
pnpm test           # Run tests
pnpm test:watch     # Watch mode
\`\`\`

3. Run CLI locally:
\`\`\`bash
node dist/index.js <command>
\`\`\`

## Code Style

- **TypeScript:** Strict mode, ES2022 target
- **Format:** No enforced formatter, follow existing style
- **Imports:** Use `.js` extensions for ESM
- **Naming:** camelCase for variables, PascalCase for types/interfaces

## Adding Features

### Adding a Detector

1. Create `src/detectors/your-detector.ts`
2. Implement the `Detector` interface
3. Register in `src/detectors/index.ts`
4. Add tests in `tests/detectors/your-detector.test.ts`

### Adding an Integration

1. Create `src/integrations/your-tool.ts`
2. Implement the `Integration` interface
3. Register in `src/integrations/index.ts`

### Adding a Command

1. Create `src/commands/your-command.ts`
2. Export `async function runYourCommand(opts: CLIOptions): Promise<void>`
3. Register in `src/index.ts`
4. Add to `COMMANDS` set in `src/utils/args.ts`
5. Add help text in `src/utils/help.ts`

## Testing

- Write tests for all new features
- Aim for >80% coverage
- Run `pnpm test` before committing
- Use `vitest` framework

## Commit Messages

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `test:` - Tests
- `refactor:` - Code refactoring

Example: `feat: add Rust language support`

## Pull Requests

1. Fork and branch from `develop`
2. Write descriptive PR title
3. Link related issues
4. Ensure CI passes
5. Request review from maintainers

## Zero Dependencies Policy

**IMPORTANT:** No production dependencies allowed.
- Use Node.js built-ins only
- Dev dependencies OK (typescript, vitest, tsup)
- If you need a package, consider implementing it yourself
```

**Priority:** P1 (High - essential for open-source)

**Estimated Effort:** 2-3 hours

---

### docs/examples.md

**Status:** ⚠️ Needs Expansion
**Last Reviewed:** 2026-02-23

**Current State:**
- Good Next.js example
- Good Python FastAPI example
- Basic monorepo example

**Missing Examples:**
- ❌ Rust/Cargo example
- ❌ Go example
- ❌ Java/Spring Boot example
- ❌ C#/.NET example
- ❌ Ruby on Rails example
- ❌ Comprehensive monorepo (Turborepo with mixed languages)

**Required Additions:**

1. **Rust Example:**
```markdown
## 6. Rust Web Service (Actix)

### Project Structure
\`\`\`
cargo-web/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── lib.rs
│   └── handlers/
└── tests/
\`\`\`

### Detected Output
\`\`\`json
{
  "stack": {
    "languages": ["rust"],
    "frameworks": ["actix-web@4.4"],
    "package_manager": "cargo"
  },
  "commands": {
    "dev": "cargo run",
    "build": "cargo build --release",
    "test": "cargo test",
    "lint": "cargo clippy",
    "format": "cargo fmt"
  }
}
\`\`\`
```

2. **Go Example:**
```markdown
## 7. Go Web Service (Gin)

### Project Structure
\`\`\`
go-web/
├── go.mod
├── go.sum
├── main.go
└── handlers/
\`\`\`

### Detected Output
\`\`\`json
{
  "stack": {
    "languages": ["go"],
    "frameworks": ["gin@1.9"],
    "package_manager": "go_modules"
  },
  "commands": {
    "dev": "go run main.go",
    "build": "go build -o bin/app",
    "test": "go test ./...",
    "lint": "golangci-lint run",
    "format": "go fmt ./..."
  }
}
\`\`\`
```

**Priority:** P2 (Medium - nice to have for users)

**Estimated Effort:** 3-4 hours

---

### docs/INTEGRATIONS.md

**Status:** ⚠️ Needs Minor Updates
**Last Reviewed:** 2026-02-23

**Current State:**
- Good integration descriptions
- Clear examples for all 7 tools

**Missing Content:**
- ❌ MCP configuration for all tools (not just Claude Code)
- ❌ Troubleshooting section
- ❌ Verification commands

**Required Updates:**

```markdown
## MCP Configuration by Tool

### Cursor

Add to Cursor Settings → MCP:

\`\`\`json
{
  "mcpServers": {
    "codebase": {
      "command": "npx",
      "args": ["codebase", "mcp"]
    }
  }
}
\`\`\`

### Windsurf

Add to `.windsurfrules`:

\`\`\`
# MCP Integration
Use codebase MCP for project context.
\`\`\`

Then configure in Windsurf settings.

### Cline

Add to Cline Settings → MCP Servers:

\`\`\`json
{
  "codebase": {
    "command": "npx",
      "args": ["codebase", "mcp"]
    }
  }
}
\`\`\`

## Troubleshooting

### Tool Not Detecting .codebase.json

**Problem:** AI tool isn't reading the manifest.

**Solutions:**
1. Check that the integration marker exists: `<!-- codebase:start -->`
2. Verify .codebase.json is in project root
3. Restart the AI tool
4. Check tool's logs for errors

### MCP Server Not Connecting

**Problem:** "MCP connection failed"

**Solutions:**
1. Verify `npx codebase mcp` works manually
2. Check Node.js is in PATH
3. Try full path to Node.js
4. Check MCP server logs

### Git Hook Not Running

**Problem:** Manifest not updating on commit.

**Solutions:**
1. Check `.git/hooks/post-commit` exists
2. Ensure hook is executable: `chmod +x .git/hooks/post-commit`
3. Run `codebase hook install` again
4. Check git config: `git config core.hooksPath`
```

**Priority:** P1 (High - improves user experience)

**Estimated Effort:** 2-3 hours

---

### docs/WHY.md

**Status:** ✅ Good
**Last Reviewed:** 2026-02-23

No changes needed - well-written and accurate.

---

### docs/COMPARISON.md

**Status:** ✅ Good
**Last Reviewed:** 2026-02-23

No changes needed - comprehensive comparison table.

---

## New Documentation Files Needed

### 1. docs/TROUBLESHOOTING.md (New)

**Priority:** P1 (High)

**Content:**
- Common errors and solutions
- Error message decoder
- Platform-specific issues
- Getting help links

**Sections:**
```markdown
# Troubleshooting

## Common Errors

### "not a git repository"
**Cause:** Project not initialized with git
**Fix:** `git init`

### "GitHub CLI not authenticated"
**Cause:** gh CLI not logged in
**Fix:** `gh auth login`

### "Permission denied"
**Cause:** File system permissions
**Fix:** Check file/directory permissions

## Platform-Specific

### Windows
- Git Bash required for some commands
- Path separators

### macOS
- Homebrew Node.js paths
- Xcode command line tools

### Linux
- Package manager paths
- Permission issues

## Getting Help

- GitHub Issues: https://github.com/your-repo/codebase/issues
- Discussions: https://github.com/your-repo/codebase/discussions
- Documentation: https://github.com/your-repo/codebase/wiki
```

**Estimated Effort:** 2-3 hours

---

### 2. docs/MULTI_LANGUAGE.md (New)

**Priority:** P2 (Medium)

**Content:**
- All 30+ supported languages
- Framework detection for each
- Command detection for each
- Examples for each language family

**Estimated Effort:** 3-4 hours

---

## Implementation Priority Matrix

| Document | Priority | Effort | Impact | Order |
|----------|----------|--------|--------|-------|
| **USAGE.md** (new features) | P1 | 2-3h | High | 1 |
| **CONTRIBUTING.md** | P1 | 2-3h | High | 2 |
| **ARCHITECTURE.md** (updates) | P1 | 2-3h | Medium | 3 |
| **INTEGRATIONS.md** (MCP) | P1 | 2-3h | Medium | 4 |
| **TROUBLESHOOTING.md** (new) | P1 | 2-3h | High | 5 |
| **examples.md** (expand) | P2 | 3-4h | Medium | 6 |
| **README.md** (screenshots) | P2 | 2-3h | Low | 7 |
| **MULTI_LANGUAGE.md** (new) | P2 | 3-4h | Low | 8 |

**Total Estimated Effort:** 18-26 hours

---

## Quick Wins (Can be done in < 1 hour each)

1. **Update USAGE.md** with new flags (30 min)
2. **Update ARCHITECTURE.md** with GraphQL section (45 min)
3. **Create basic TROUBLESHOOTING.md** (45 min)
4. **Update INTEGRATIONS.md** with MCP configs (30 min)

**Total Quick Wins:** ~2.5 hours for significant improvements

---

## Success Criteria

Documentation will be considered production-ready when:

1. ✅ All new features documented (GraphQL, multi-language, enhanced help)
2. ✅ CONTRIBUTING.md is comprehensive
3. ✅ TROUBLESHOOTING.md exists
4. ✅ USAGE.md reflects current CLI state
5. ✅ README has visual elements (screenshots or comparison chart)
6. ✅ All examples are accurate and tested
7. ✅ All links work
8. ✅ Consistent formatting across all docs

---

## Recommendation

**Phase 1 (Immediate - This Week):**
1. Update USAGE.md with new flags and AI commands
2. Update ARCHITECTURE.md with GraphQL/MCP
3. Create comprehensive CONTRIBUTING.md
4. Create TROUBLESHOOTING.md

**Phase 2 (Next Week):**
5. Expand examples.md with 3 more languages
6. Update INTEGRATIONS.md with MCP configs
7. Add screenshots to README
8. Create MULTI_LANGUAGE.md reference

**Phase 3 (Polish):**
9. Add comparison chart to README
10. Create video walkthrough
11. Add inline comments to examples
12. Internationalization considerations

---

## Maintenance Plan

Documentation should be updated:
- **With every feature change** - Update relevant docs
- **With every new language/framework** - Update examples.md
- **Monthly** - Review for accuracy
- **Pre-release** - Full audit

**Owners:**
- Doc-specialist: Primary maintainer
- Team-lead: Review and approve
