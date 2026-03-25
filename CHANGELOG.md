# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open source preparation: LICENSE, SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md
- GitHub issue templates (bug report, feature request)
- PR template
- Dependabot configuration for automated dependency updates
- CodeQL security analysis workflow
- OpenSSF Scorecard workflow

### Security
- Removed IDE config files (`.mcp.json`, `.cursorrules`, `.windsurfrules`) from git tracking
- Replaced hardcoded example password placeholder in `setup.ts` template

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

[Unreleased]: https://github.com/ZySec-AI/codebase/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/ZySec-AI/codebase/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ZySec-AI/codebase/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ZySec-AI/codebase/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ZySec-AI/codebase/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ZySec-AI/codebase/releases/tag/v0.1.0
