---
name: codebase-releaser
description: Release skill for publishing codebase-ai to npm, creating GitHub releases, and bumping versions. Use when asked to release, publish, ship, cut a version, bump version, or run /launch. Covers pre-flight checks, semver decision, changelog, npm publish, and post-release verification. Triggers on: "release", "publish", "ship", "cut a release", "bump version", "launch", "/launch", "npm publish".
---

# codebase-releaser

Release playbook for the `codebase` npm package. Publishes from `develop` → `main`.

## Pre-flight (all must pass before any publish)

```bash
# 1. CI green on develop
gh run list --branch develop --limit 5 --json status,conclusion | \
  python3 -c "import sys,json; runs=json.load(sys.stdin); print('PASS' if all(r['conclusion']=='success' for r in runs[:3]) else 'FAIL')"

# 2. No open P1/P2 issues
gh issue list --label "P1" --state open --json number | python3 -c "import sys,json; issues=json.load(sys.stdin); print('PASS' if not issues else f'FAIL: {len(issues)} P1 issues open')"
gh issue list --label "P2" --state open --json number | python3 -c "import sys,json; issues=json.load(sys.stdin); print('PASS' if not issues else f'FAIL: {len(issues)} P2 issues open')"

# 3. Local build + tests green
npm run build && npm run test && npm run typecheck

# 4. Manifest fresh
npx codebase brief --quiet | python3 -c "import sys,json; b=json.load(sys.stdin); print('PASS')" 2>/dev/null || echo "WARNING: manifest stale"
```

If any check fails → stop, report the failure, do not proceed.

## Semver Decision

Read `git log $(git describe --tags --abbrev=0)..HEAD --oneline` to see commits since last tag.

| Commit pattern | Bump |
|----------------|------|
| `feat:` or new detector/command/MCP tool (additive) | **minor** |
| `fix:`, `chore:`, `docs:`, `perf:` | **patch** |
| `BREAKING CHANGE` in body, removed command, changed manifest schema, changed MCP tool signature | **major** |
| Changed CLI flag behavior or name | **major** |

When in doubt between minor and major, ask the user — a wrong major bump is acceptable, a wrong minor is a breaking change incident.

## Release Steps

```bash
# 1. Pull latest develop
git checkout develop && git pull origin develop

# 2. Bump version (edit package.json)
# Set version field to new version

# 3. Update CHANGELOG.md
# Prepend new section: ## [X.Y.Z] - YYYY-MM-DD
# Group commits: ### Added / Fixed / Changed / Breaking

# 4. Commit the bump
git add package.json CHANGELOG.md
git commit -m "chore: release vX.Y.Z"

# 5. Merge to main
git checkout main && git pull origin main
git merge develop --no-ff -m "release: vX.Y.Z"

# 6. Tag
git tag -a "vX.Y.Z" -m "Release vX.Y.Z"

# 7. Push
git push origin main && git push origin develop && git push origin "vX.Y.Z"

# 8. Build final artifact
npm run build

# 9. Publish
npm publish --access public

# 10. GitHub release
gh release create "vX.Y.Z" \
  --title "vX.Y.Z" \
  --notes "$(cat CHANGELOG.md | awk '/^## \[X.Y.Z\]/,/^## \[/' | head -n -1)"
```

## Post-release Verification

```bash
# Wait for npm propagation (~30s), then verify
sleep 30
npx --yes codebase@X.Y.Z --version
# Must output: X.Y.Z
```

If the version doesn't match after 2 minutes, check npm publish output for errors.

## Rollback (if post-release verification fails)

```bash
# Deprecate the bad version
npm deprecate codebase@X.Y.Z "Bad release — use X.Y.Z-1"
# Create a follow-up fix issue
```

Never `npm unpublish` a published version — it breaks existing installs.

## CHANGELOG Format

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New `your-detector` detector: detects X in project manifests
- MCP tool `get_something`: returns Y

### Fixed
- Path traversal in file walker when depth limit was 0
- MCP `close_issue` now closes before posting comment

### Changed
- Manifest field `stack.languages` now includes sub-versions

### Breaking
- Removed `codebase old-command` (use `codebase new-command` instead)
```
