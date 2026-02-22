# Why This Exists

## The Token Tax

Every AI coding session pays a hidden tax:

```
Session start
  → AI scans directory tree            ~2,000 tokens
  → AI reads package.json              ~500 tokens
  → AI reads config files              ~1,500 tokens
  → AI reads recent git history        ~800 tokens
  → AI guesses at architecture         ~1,000 tokens
  → AI gets it wrong, re-scans         ~3,000 tokens
                                       ─────────────
  Total wasted per session:            ~8,800 tokens
```

Multiply by 20 sessions/day across a team of 10. That's **1.76M tokens/day** answering the same questions about a codebase that barely changed.

With `codebase`: **~500 tokens** to read the manifest. Once. Done.

## The Inconsistency Problem

Without a manifest, each session builds a different mental model:

- Session A thinks `src/lib/` is utilities
- Session B thinks `src/lib/` is the core domain
- Session C doesn't find `src/lib/` at all

A `.codebase.json` gives every session the same ground truth, instantly.

## Why Not Just Use CLAUDE.md / .cursorrules?

Those are **hand-written prose** that:
- Go stale the moment someone adds a package
- Are vendor-specific (CLAUDE.md only helps Claude Code)
- Require discipline to maintain
- Mix instructions with facts

`codebase` generates **machine-readable facts** that:
- Auto-update via git hooks and CI
- Work with every AI tool
- Never go stale
- Separate facts from instructions

The two are complementary. CLAUDE.md says *"read .codebase.json first"* and handles project-specific instructions. The manifest handles the facts.

## Who Is This For

| User | Pain |
|------|------|
| **Solo dev** | AI re-discovers the same project every session |
| **Teams** | Inconsistent AI behavior across developers |
| **Tool builders** | No standard way to bootstrap codebase understanding |
| **OSS maintainers** | Contributors' AI tools don't understand the project |
