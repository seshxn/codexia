# Changelog

## [v0.3.0] - 2026-01-17

### What's Changed

- chore: release v0.2.0 (0f3865c)
- chore: release v0.1.0 (2dabe28)
- fix: fix version bump step with logging for better visibility (46e0351)
- chore: release v0.1.0 (e6456e4)
- feat: enhance release workflow with separate push for version bump and tag (0a1f061)
- chore: release v0.3.0 (3075ea2)
- chore: add release workflow for automated versioning and publishing (#11) (d8846d4)
- feat: add interactive wizard for command selection and execution (#6) (37610b2)
- feat: Add 12 new analysis modules and MCP server (#4) (d02f673)
- feat: Add new commands and features to Codexia CLI (#1) (900702f)
- chore: Add GitHub Actions CI workflow for testing and building (#2) (3370888)
- Initial commit (02b3f9a)


## [v0.2.0] - 2026-01-17

### What's Changed

- chore: release v0.1.0 (2dabe28)
- fix: fix version bump step with logging for better visibility (46e0351)
- chore: release v0.1.0 (e6456e4)
- feat: enhance release workflow with separate push for version bump and tag (0a1f061)
- chore: release v0.3.0 (3075ea2)
- chore: add release workflow for automated versioning and publishing (#11) (d8846d4)
- feat: add interactive wizard for command selection and execution (#6) (37610b2)
- feat: Add 12 new analysis modules and MCP server (#4) (d02f673)
- feat: Add new commands and features to Codexia CLI (#1) (900702f)
- chore: Add GitHub Actions CI workflow for testing and building (#2) (3370888)
- Initial commit (02b3f9a)


## [v0.1.0] - 2026-01-17

### What's Changed

- fix: fix version bump step with logging for better visibility (46e0351)


## [v0.1.0] - 2026-01-17

### What's Changed




## [v0.3.0] - 2026-01-17

### What's Changed

- chore: add release workflow for automated versioning and publishing (#11) (d8846d4)
- feat: add interactive wizard for command selection and execution (#6) (37610b2)
- feat: Add 12 new analysis modules and MCP server (#4) (d02f673)
- feat: Add new commands and features to Codexia CLI (#1) (900702f)
- chore: Add GitHub Actions CI workflow for testing and building (#2) (3370888)
- Initial commit (02b3f9a)


All notable changes to Codexia will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Interactive Wizard Mode** — Run `codexia` without arguments to launch an interactive menu-driven experience
  - 5 command categories: Analyze, Reports, Quality, Testing, Setup
  - Guided prompts for paths, options, and output formats
  - Built with `@inquirer/prompts` for a modern CLI experience

### Fixed

- **Graph command** — Fixed data transformation to properly generate dependency visualizations
- **Changelog command** — Auto-detects repository root commit when no tags exist; fixed formatter to handle actual engine output structure
- **Hot paths command** — Gracefully handles missing entry points and paths data
- **History command** — Fixed undefined values in summary output with proper fallbacks

## [0.2.0] - 2026-01-13

### Added

#### New Analysis Modules
- **Dependency Visualization** (`codexia graph`) - Generate dependency graphs in ASCII, Mermaid, or DOT formats
- **Complexity Analysis** (`codexia complexity`) - Multi-dimensional code complexity metrics including cyclomatic, cognitive, maintainability, and coupling scores
- **Temporal Analysis** (`codexia history`) - Git history intelligence for churn rates, ownership analysis, temporal coupling, and regression risk detection
- **Architectural Invariants** (`codexia invariants`) - Define and enforce architectural rules with support for layer boundaries, import restrictions, naming patterns, and more
- **Hot Path Detection** (`codexia hotpaths`) - Identify critical code paths from entry points and analyze their impact
- **Changelog Generation** (`codexia changelog`) - Generate semantic changelogs from conventional commits with API change detection
- **Monorepo Support** (`codexia monorepo`) - Analyze multi-package repositories (npm, yarn, pnpm, lerna, nx, turborepo, rush)
- **Smart Test Prioritization** - Intelligent test ordering based on change impact and historical data

#### AI Integration
- **MCP Server** (`codexia mcp-server`) - Model Context Protocol server for integration with AI assistants like Claude
- 10 MCP tools for repository analysis, impact checking, context retrieval, and more

#### Enhanced Watch Mode
- Live file watching with real-time impact analysis
- Convention checking on file changes
- Signal detection during development

### Changed
- Improved CLI help text with examples for all commands
- Enhanced JSON output for all commands
- Better error messages and suggestions

### Technical
- Added 12 new modules to `src/modules/`
- Added MCP server implementation in `src/mcp/`
- Extended core types for new features
- Added 9 new CLI commands

## [0.1.0] - Initial Release

### Added
- Repository scanning and indexing
- Impact analysis for code changes
- Convention checking
- Test suggestions
- PR report generation
- Signal detection (god classes, circular dependencies, orphan code)
- Project memory system (`.codexia/` directory)
- JSON output support for all commands
