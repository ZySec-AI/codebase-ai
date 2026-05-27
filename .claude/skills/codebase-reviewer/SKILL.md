---
name: codebase-reviewer
description: Code review skill for the codebase-ai project. Runs security, quality, dependency, and graph-based analysis. Creates prioritized GitHub Issues for every finding. Use when asked to review, audit, check security, find bugs, analyze quality, check dependencies, or scan for dead code in this repo. Triggers on: "review", "audit", "check security", "find issues", "code quality", "dead code", "dependency check", "blast radius", "/review".
---

# codebase-reviewer

Review playbook specific to the `codebase-ai` project. Uses codebase's own MCP tools to enrich findings.

## Review Dimensions

Run all four unless scoped by flags:

| Dimension | Focus |
|-----------|-------|
| **Security** | OWASP top 10, secrets scanning (uses `src/utils/secrets.ts` patterns), auth/authz, path traversal in file walking, command injection in shell-calling code |
| **Quality** | Zero-deps constraint adherence, manifest size discipline, detector isolation violations, `as any` usage, missing COMMANDS set registration |
| **Dependencies** | `package.json` devDeps only (no prod deps should exist), outdated packages, CVEs via `npm audit` |
| **Graph** | Dead code via `codebase graph dead`, import cycles via `codebase graph cycles`, orphaned files |

## Project-Specific Security Concerns

This project is a **CLI tool + MCP server** installed globally. Specific risks to check:

- **Path traversal**: file walking in detectors accepts user-controlled paths — verify depth limits and ignore lists are applied
- **Secret leakage**: `src/prompts/store.ts` writes prompts to disk — verify redaction patterns cover all credential types
- **Command injection**: any `exec`/`spawn` call with user input must use array form, never string interpolation
- **MCP stdio trust**: MCP server reads from stdin — verify JSON parsing is safe against malformed input
- **Git hook injection**: `setup.ts` writes shell scripts — verify content is static, not user-controlled

## Workflow

### 1. Load context
```bash
npx codebase brief 2>/dev/null > /tmp/cb-brief.json
npx codebase graph build 2>/dev/null || true
```

### 2. Run automated checks
```bash
npm audit --json 2>/dev/null > /tmp/npm-audit.json
npm run typecheck 2>/dev/null > /tmp/typecheck.txt 2>&1 || true
npx codebase graph dead 2>/dev/null > /tmp/dead-code.txt || true
npx codebase graph cycles 2>/dev/null > /tmp/cycles.txt || true
```

### 3. Manual review passes
Read source files in this order (highest risk first):
1. `src/prompts/store.ts` — secret redaction, file permissions
2. `src/commands/setup.ts` — hook installation, file writes
3. `src/mcp/server.ts` — JSON parsing, tool input validation
4. `src/detectors/` — path traversal, depth limits
5. `src/github/` — API token handling, rate limit handling

### 4. Create issues
For each finding, use MCP `create_issue`. Issue body template:

```
## Finding

**Severity:** P1/P2/P3/P4
**Dimension:** security/quality/deps/graph

### What
[description]

### Where
`src/path/to/file.ts` line N

### Why it matters
[concrete impact]

### Blast radius
[output from get_impact_radius if available]

### Fix
[specific, actionable suggestion]
```

### 5. Label correctly
Labels to apply: `review`, `security`/`quality`/`deps`/`graph`, `P1`/`P2`/`P3`/`P4`

Ensure labels exist first:
```bash
for label in review security quality deps graph P1 P2 P3 P4; do
  gh label create "$label" 2>/dev/null || true
done
```

## Severity Guide

| Level | Criteria |
|-------|---------|
| P1 | Active exploit risk, data loss, secret exposure in published package |
| P2 | Security weakness needing fix before next release, significant quality regression |
| P3 | Quality/maintainability issue, outdated dep without known CVE |
| P4 | Nit, style inconsistency, low-priority improvement |

## References

- Secret scanning patterns: `src/utils/secrets.ts`
- Manifest schema: `src/types.ts`
- Traceability rules: `CLAUDE.md` → Traceability Contract section
