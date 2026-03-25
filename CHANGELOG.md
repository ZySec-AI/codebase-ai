# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-03-25

### Added
- `LICENSE` file (MIT) — was declared in `package.json` but missing from the repo
- `CONTRIBUTING.md` — dev setup, PR process, commit conventions, architecture rules
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1
- `SECURITY.md` — vulnerability disclosure policy, response SLA, safe harbor
- `CHANGELOG.md` — full version history in Keep a Changelog format
- `.github/ISSUE_TEMPLATE/bug_report.yml` — structured bug report form
- `.github/ISSUE_TEMPLATE/feature_request.yml` — structured feature request form
- `.github/ISSUE_TEMPLATE/config.yml` — disable blank issues, route security to private advisory
- `.github/PULL_REQUEST_TEMPLATE.md` — checklist-driven PR template
- `.github/CODEOWNERS` — auto-assign reviewers to all PRs
- `.github/dependabot.yml` — weekly automated updates for npm deps and GitHub Actions
- `.github/workflows/codeql.yml` — CodeQL security analysis on push/PR/weekly schedule
- `.github/workflows/scorecard.yml` — OpenSSF Scorecard weekly scan
- CI status badge and OpenSSF Scorecard badge in README
- Contributing, Changelog, Code of Conduct sections in README

### Security
- Removed `.mcp.json`, `.windsurf/mcp.json`, `.cursorrules`, `.windsurfrules` from
  git tracking — files contained local machine paths and were already in `.gitignore`
- Replaced hardcoded example password `dev123456` in `setup.ts` template with
  `<your-seed-password>` placeholder
- Documented `codebase server` CORS wildcard as intentional local-only design

## [0.3.2] - 2025-03-01

### Added
- `/vibeloop` command — full autonomous simulate → build → launch loop with zero intervention
- `vibeloop.skill` bundled with npm package

### Fixed
- `setup` command no longer reinstalls skills/commands if already up to date

## [0.3.1] - 2025-02-15

### Added
- Expanded skill bundle: `expert-panel`, `self-heal`, `cx-review`, `dx-review`, `rust-review`
- Setup structure scaffolding for new projects

### Changed
- Improved DX: command output formatting, help text, and onboarding flow

## [0.3.0] - 2025-01-20

### Added
- `codebase server` — local HTTP API exposing the manifest at `localhost`
- `codebase release` — quality-gated version tagging and `develop → main` merge
- `src/server/` with GET/POST routes for manifest read and re-scan

## [0.2.0] - 2024-12-01

### Added
- MCP server (`codebase mcp`) with 16 tools including `project_brief`, `get_next_task`,
  `create_issue`, `close_issue`, `refresh_status`
- GitHub GraphQL integration for issues, PRs, milestones
- `codebase doctor` and `codebase fix` for self-healing setup
- `api-docs` detector
- `quality` and `patterns` detectors

### Changed
- Manifest schema v2 — includes GitHub issues, milestones, and PR data

## [0.1.0] - 2024-10-01

### Added
- Initial release
- `codebase init` — scan + wire AI tools + git hooks
- 11 parallel detectors: project, repo, structure, stack, commands, dependencies,
  config, git, quality, patterns, api-docs
- 7 AI tool integrations: Claude, Cursor, Windsurf, Copilot, Aider, Cline, Continue
- `codebase brief`, `next`, `status`, `query` commands
- GitHub Actions CI and release workflows

[Unreleased]: https://github.com/ZySec-AI/codebase/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/ZySec-AI/codebase/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/ZySec-AI/codebase/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ZySec-AI/codebase/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ZySec-AI/codebase/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ZySec-AI/codebase/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ZySec-AI/codebase/releases/tag/v0.1.0
