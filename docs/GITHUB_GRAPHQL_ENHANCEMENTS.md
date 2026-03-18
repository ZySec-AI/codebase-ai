# GitHub GraphQL Integration Enhancements

This document describes the enhancements made to the GitHub integration as part of task #11.

## Summary

The GitHub integration has been significantly enhanced to fetch comprehensive data using GraphQL queries with proper error handling and fallbacks to the REST API.

## New Features

### 1. Enhanced Issue Data

Issues now include:
- **Comments count**: Total number of comments on the issue
- **Reactions breakdown**: Thumbs up/down, laugh, hooray, confused, heart, rocket, eyes
- **Timeline events count**: Total number of timeline events (edits, mentions, etc.)
- **URL**: Direct link to the issue

### 2. Enhanced Pull Request Data

Pull requests now include:
- **Checks status**: Pending, passing, or failing based on CI status
- **Mergeability**: Whether the PR can be merged
- **Merge conflicts**: Boolean indicating if there are conflicts
- **Additions/Deletions**: Lines of code changed
- **Comments count**: Total number of comments
- **Review decision**: Approved, changes requested, or review required
- **URL**: Direct link to the PR

### 3. Milestone Progress

Milestones now include:
- **Issue counts**: Open and closed issue counts
- **Percentage**: Progress percentage
- **Associated issues**: List of issue numbers in the milestone

### 4. Releases

New releases data includes:
- **Tag name**: Version tag
- **Release name**: Display name
- **Creation date**: When the release was created
- **URL**: Direct link to the release
- **Author**: Who created the release
- **Prerelease flag**: Whether this is a pre-release

### 5. Project Boards (Projects v2)

New project boards data includes:
- **Project number and title**: Identification
- **State**: Open or closed
- **Columns**: Board columns (To Do, In Progress, etc.)
- **Cards count**: Approximate number of items per column
- **URL**: Direct link to the project board

## Technical Implementation

### GraphQL Client

A new `src/github/graphql.ts` module provides:

1. **`graphqlQuery<T>()`**: Generic GraphQL query executor via `gh` CLI
2. **`fetchGitHubGraphQLData()`**: Main function to fetch all GitHub data
3. **`checkGraphQLSupport()`**: Validates `gh` CLI version supports GraphQL
4. **Proper parsers**: Convert GraphQL responses to our data types

### Fallback Strategy

The integration uses a graceful fallback strategy:

1. **Try GraphQL first** if `gh` CLI >= 2.0
2. **Fall back to REST API** if GraphQL fails or returns no data
3. **Silent failures** - no errors thrown, returns empty data

This ensures the tool works even when:
- User has older `gh` CLI version
- GraphQL API has issues
- Network problems occur
- Authentication fails

### Error Handling

- All GraphQL errors are caught and handled gracefully
- CLI errors (authentication, network) don't crash the process
- Invalid responses return empty data structures
- Each data type (issues, PRs, etc.) is fetched independently

## Type Updates

The following types in `src/types.ts` were enhanced:

- `IssueData`: Added comments, reactions, timeline, url
- `PullRequestData`: Added checks, mergeability, conflicts, stats, review decision
- `StatusData`: Added releases, project_boards
- New types: `ReleaseData`, `ProjectBoardData`

## Tests

Comprehensive test suite in `tests/github/graphql.test.ts`:

- ✅ 15 tests covering all functionality
- ✅ Version detection (gh >= 2.0)
- ✅ URL parsing (HTTPS and SSH)
- ✅ Error handling (GraphQL errors, CLI errors)
- ✅ Data parsing (issues, PRs, milestones, releases, projects)
- ✅ Fallback behavior

All 330 tests pass.

## Usage

No changes required to CLI usage. The enhanced data is automatically available when:

1. User runs `codebase init` or `codebase scan`
2. `gh` CLI is available and authenticated
3. Repository has a GitHub remote

The data is included in `.codebase.json` under the `status` section:

```json
{
  "status": {
    "synced_at": "2024-01-01T00:00:00Z",
    "github_available": true,
    "issues": [...],
    "pull_requests": [...],
    "releases": [...],
    "project_boards": [...]
  }
}
```

## Performance

- **Parallel queries**: All GraphQL queries run in parallel where possible
- **Timeout**: 30 second timeout per query
- **Limits**: Configurable limits (default 50 for issues/PRs)
- **Incremental**: Falls back to REST for data types that fail

## Future Enhancements

Possible future improvements:

1. **Caching**: Cache GraphQL responses to reduce API calls
2. **Webhooks**: Support for webhook-based updates
3. **Real-time**: Support for GraphQL subscriptions
4. **More fields**: Add additional fields as needed
5. **Batching**: Combine multiple queries into single request

## Migration Guide

No migration needed. The enhancement is backward compatible:

- Existing data structures are preserved
- New fields are optional
- Fallback to REST API maintains compatibility
- No breaking changes to the manifest schema
