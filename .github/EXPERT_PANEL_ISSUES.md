# Expert Panel Audit — GitHub Issues to Create

Run these after GitHub rate limit resets (~1 hour). Use `gh issue create` for each.

---

## CRITICAL (3)

### Issue 1: Skills are never unzipped — non-functional on all machines
**Labels:** bug, critical
`setup.ts:219-297` copies `.skill` zip files to `~/.claude/skills/` but never extracts them. Claude Code requires unzipped directories containing `SKILL.md`. All 11 shipped skills are broken.

### Issue 2: Only 1/7 claimed AI tool integrations implemented
**Labels:** bug, critical
README claims "Auto-wires into 7 AI tools". Only Claude (CLAUDE.md) exists in `src/integrations/index.ts`. Missing: Cursor, Windsurf, Copilot, Aider, Cline, Continue.

### Issue 3: vitest lockfile mismatch — package.json ^4.1.1 vs installed 1.6.1
**Labels:** bug, critical, dependencies
Fresh `npm install` pulls v4.x (major breaking changes). Lockfile pins v1.6.1. Must sync.

---

## HIGH (7)

### Issue 4: GraphQL uses -f instead of -F for integer variables
**Labels:** bug, high
`src/github/graphql.ts:39` — integer params like `limit` passed as strings via `-f`. Should use `-F`. Queries may silently fail.

### Issue 5: init and setup have significant gaps — neither is complete alone
**Labels:** bug, high, arch
init skips: skills, Claude hooks, agent-browser, PRODUCT.md, labels. setup skips: MCP config, non-Claude integrations. Users must run both (undocumented).

### Issue 6: fix command cannot repair commit-msg hook
**Labels:** bug, high
`doctor.ts:201-217` flags missing commit-msg hook but `fix.ts` has no code to install it. `installBranchHook()` only in `setup.ts:56`.

### Issue 7: fix won't update partial/outdated skills
**Labels:** bug, high
`fix.ts:159-160` only installs skills if zero `.skill` files exist. One old skill = all new skills skipped.

### Issue 8: HOME fallback uses literal ~ instead of homedir()
**Labels:** bug, high
`setup.ts:154,237` uses `process.env["HOME"] ?? "~"` — literal tilde string. Should use `homedir()` from `node:os`.

### Issue 9: MilestoneData.issues type mismatch
**Labels:** bug, high
`types.ts` expects `IssueData[]`, `graphql.ts:469` returns `number[]`. Masked by unsafe cast.

### Issue 10: GraphQL reactionCount and ProjectsV2 fieldNodes use deprecated API
**Labels:** bug, high
`graphql.ts:86-93` — `reactionCount(for:)` syntax is wrong. `graphql.ts:176` — `fieldNodes` renamed to `fields`. Both silently fail.

---

## MEDIUM — Enhancements (4)

### Issue 11: Generate Claude Code hooks in .claude/settings.json during setup
**Labels:** enhancement, medium, arch
Add SessionStart (auto-brief), PostCompact (re-inject context), PostToolUse(Edit|Write) (auto-rescan), Stop (save session state). Makes codebase the memory that survives compaction.

### Issue 12: README lists 9 MCP tools but 16 exist — 7 undocumented
**Labels:** documentation, medium
Missing from docs: `update_issue`, `list_skills`, `get_plan`, `update_plan`, `get_issue`, `get_pr`, `refresh_status`.

### Issue 13: Three duplicate ghExec implementations
**Labels:** enhancement, medium
Independent implementations in `sync.ts`, `issues.ts`, `server.ts`. Consolidate to shared util.

### Issue 14: npm audit: moderate vulnerability in brace-expansion
**Labels:** bug, medium, dependencies
`brace-expansion` < 1.1.13 (ReDoS). Fix: `npm audit fix`.

---

## MEDIUM — Bugs (5)

### Issue 15: api-docs detector output is untyped in manifest
**Labels:** bug, medium
`api-docs.ts` uses `category: "config"` but `ConfigData` has no fields for openapi/graphql/grpc/postman.

### Issue 16: doctor misses api-docs detector — checks 10/11 categories
**Labels:** bug, medium
`doctor.ts:83-94` omits api-docs. Reports "10/10" when 11 detectors exist.

### Issue 17: Port default mismatch: help says 3000, args defaults to 7432
**Labels:** bug, medium
`help.ts:189` says 3000, `args.ts:16` defaults to 7432.

### Issue 18: plan command has no help text
**Labels:** bug, medium
Registered in `index.ts` and `args.ts` but missing from `help.ts`.

### Issue 19: --dry-run advertised but never implemented
**Labels:** bug, medium
Advertised in help for both `init` and `setup` but neither reads `options.dryRun`.

---

## Quick Create Script

```bash
# Wait for rate limit reset, then run:
while IFS= read -r line; do
  eval "$line"
  sleep 3  # avoid secondary rate limit
done << 'SCRIPT'
gh issue create --title "Skills are never unzipped — non-functional on all machines" --label "bug,critical" --body "setup.ts:219-297 copies .skill zip files but never extracts them. All 11 skills broken."
gh issue create --title "Only 1/7 claimed AI tool integrations implemented" --label "bug,critical" --body "Only Claude integration exists. Missing: Cursor, Windsurf, Copilot, Aider, Cline, Continue."
gh issue create --title "vitest lockfile mismatch: package.json ^4.1.1 vs installed 1.6.1" --label "bug,critical,dependencies" --body "Fresh npm install gets v4.x, lockfile pins 1.6.1. Must sync."
gh issue create --title "GraphQL uses -f instead of -F for integer variables" --label "bug,high" --body "graphql.ts:39 passes limit as string. Should use -F for int. Queries may silently fail."
gh issue create --title "init and setup have significant gaps — neither complete alone" --label "bug,high,arch" --body "init skips skills/hooks/agent-browser. setup skips MCP/non-Claude integrations. Must run both."
gh issue create --title "fix command cannot repair commit-msg hook" --label "bug,high" --body "doctor flags it, fix has no code to install it. installBranchHook only in setup.ts."
gh issue create --title "fix won't update partial/outdated skills" --label "bug,high" --body "fix.ts only installs if zero .skill files exist. One old skill = all new ones skipped."
gh issue create --title "HOME fallback uses literal tilde instead of homedir()" --label "bug,high" --body "setup.ts:154,237 uses ~ literal. Should use homedir() from node:os."
gh issue create --title "MilestoneData.issues type mismatch — IssueData[] vs number[]" --label "bug,high" --body "types.ts expects IssueData[], graphql.ts returns number[]. Masked by unsafe cast."
gh issue create --title "GraphQL reactionCount and fieldNodes use deprecated API" --label "bug,high" --body "reactionCount(for:) wrong syntax. fieldNodes renamed to fields in ProjectsV2."
gh issue create --title "Generate Claude Code hooks in .claude/settings.json" --label "enhancement,medium,arch" --body "Add SessionStart, PostCompact, PostToolUse, Stop hooks. Memory that survives compaction."
gh issue create --title "README lists 9 MCP tools but 16 exist" --label "documentation,medium" --body "7 undocumented: update_issue, list_skills, get_plan, update_plan, get_issue, get_pr, refresh_status."
gh issue create --title "Three duplicate ghExec implementations" --label "enhancement,medium" --body "In sync.ts, issues.ts, server.ts. Consolidate to shared util."
gh issue create --title "npm audit: moderate vuln in brace-expansion" --label "bug,medium,dependencies" --body "brace-expansion < 1.1.13 ReDoS. Fix: npm audit fix."
gh issue create --title "api-docs detector output is untyped in manifest" --label "bug,medium" --body "api-docs.ts category config but ConfigData has no openapi/graphql fields."
gh issue create --title "doctor misses api-docs — checks 10/11 categories" --label "bug,medium" --body "doctor.ts:83-94 omits api-docs detector."
gh issue create --title "Port default mismatch: help says 3000, args defaults 7432" --label "bug,medium" --body "help.ts says 3000, args.ts defaults 7432."
gh issue create --title "plan command has no help text" --label "bug,medium" --body "Registered but help.ts says Unknown command."
gh issue create --title "--dry-run advertised but never implemented" --label "bug,medium" --body "Advertised for init and setup but neither reads options.dryRun."
SCRIPT
```
