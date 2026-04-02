# How It Works

## The brain: `.codebase.json`

One scan captures everything about your project into a compact file:

| Category | Examples |
|----------|---------|
| **Stack** | TypeScript, Next.js, Prisma, PostgreSQL, Vitest |
| **Commands** | `npm run dev`, `npm test`, `npm run build` |
| **Structure** | Where `src/` is, entry points, build output |
| **Dependencies** | What's installed, what's outdated, what's notable |
| **Config** | Which env vars exist, feature flags, CI setup |
| **Git** | Recent commits, active branches, uncommitted changes |
| **Quality** | Test framework, linter, formatter, pre-commit hooks |
| **GitHub** | Open issues by priority, PRs, milestones, releases |
| **Patterns** | Architecture style, API patterns, state management |

Without codebase, Claude starts every session knowing nothing:
```
Session start → reads package.json → reads src/ → reads tests/...
30 seconds + ~10,000 tokens later: "ok so you're using Next.js..."
```

With codebase:
```
Session start → reads .codebase.json (~500 tokens)
"Next.js 14, Prisma, Vitest, dev on port 3000,
 3 open critical bugs, milestone v1.2 is 60% done"
```

**~95% fewer tokens. Instant context. Every session.**

---

## The memory: GitHub

The autonomous loop uses GitHub as its persistent state store — not local files. This means:

- The loop is **resumable**: restart Claude Code anytime, it picks up where it left off
- **Multiple developers** can run the loop concurrently — shared issue queue, shared labels
- Every action is auditable: commits, issue comments, and closed issues leave a full trail

Labels drive priority. Issues labeled `critical`, `high`, `bug`, `arch`, or `vibekit` feed the `/build` loop in that order.

---

## The slash commands

Commands live in `.claude/commands/`. Commit this folder — your whole team shares the same workflow.

### `/setup`
Run once per project. Creates GitHub labels, your first milestone, and `docs/PRODUCT.md`. Prompts you to describe your product so `/simulate` knows what to test.

### `/simulate`
Opens your app in a real browser (agent-browser) and acts like real customers. Tries to sign up, log in, complete purchases, hit edge cases. When something breaks:
1. Fixes the bug directly in your code
2. Commits with a proper message
3. Opens a GitHub Issue if too complex to fix inline
4. Records UX problems (confusing copy, broken flows, a11y) as issues

### `/build`
Reads open GitHub Issues, picks the highest priority, and implements the fix:
1. Reads `codebase brief` to understand your project
2. Picks the top issue (by label priority)
3. Writes the fix and runs your test suite
4. Commits if tests pass — opens a new issue if stuck
5. Closes the original issue with a summary
6. Moves to the next issue
7. Repeats until the backlog is clear or you stop it

### `/launch`
Checks four quality gates before merging to main:

| Gate | What it checks |
|------|---------------|
| **Bugs** | No open critical or high severity issues |
| **Tests** | Full test suite passes |
| **UX score** | World-class score ≥ 7.0 (from `/simulate` cycles) |
| **Branch** | No uncommitted changes |

If all pass: auto-increments version, tags release, merges `develop → main`, creates GitHub Release with auto-generated notes, rotates the milestone.

### `/review`
Deep code audit: security vulnerabilities, code quality, outdated/vulnerable dependencies, accessibility. Everything goes to GitHub Issues.

---

## Git workflow

- **All work happens on `develop`** — the AI commits here
- **`main` is protected** — direct commits blocked by a git hook
- **Releases merge `develop → main`** — only via `/launch`, with quality gates
- **One commit per verified fix** — AI never batches unrelated changes

---

## Skills

Skills extend `/review` with stack-specific analysis (e.g. dead code elimination for Python or Next.js). They're `.skill` zip archives installed to `~/.claude/skills/` by `codebase setup`.

If a skill isn't auto-installed, you can install it manually:
```bash
# Find skills shipped with the package
ls $(npm root -g)/codebase-ai/skills/

# Copy to your skills directory
cp $(npm root -g)/codebase-ai/skills/nextjs-declutter.skill ~/.claude/skills/
```

Current bundled skills: `arch-review`, `cx-review`, `dx-review`, `expert-panel`, `nextjs-declutter`, `py-declutter`, `rust-review`, `security-review`, `self-heal`, `simulate`, `vibeloop`.

---

## Diagnostics

```bash
codebase doctor    # shows exactly what's broken and why
codebase fix       # auto-repairs everything doctor flags
```

Checks: manifest freshness, AI tool injection markers, MCP config, git hooks, `.claude/commands/`, `.gitignore`.
