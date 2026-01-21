# Changelog

All notable changes to Codexia will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.4.0] - 2026-01-21

### Added
- Code health and velocity dashboard panels for quality and team productivity insights
- Expanded language metrics and dashboard coverage for supported languages

### Changed
- Dependency updates for the dashboard build tooling (Vite, esbuild)
- TypeScript build output trimmed by disabling declaration and source maps

### Security
- Hardened dashboard and MCP server surfaces for safer defaults


## [0.3.0] - 2026-01-18

### Added

#### 📊 Web Dashboard
- **Real-time Dashboard** (`codexia dashboard`) — Beautiful, modern web interface for repository visualization
  - Repository health score with interactive breakdown
  - Complexity heatmap with clickable file details
  - Code signals list with severity filtering
  - Hot paths visualization
  - Team leaderboard with contributor statistics
  - GitHub-style commit activity heatmap
  - Code ownership and bus factor analysis
  - Branch overview with stale branch detection
  - Interactive modals with detailed information for all items
- **Modern Dark Theme** — Vercel-inspired design with smooth animations
  - Pure black background with subtle neutral accents
  - Inter + JetBrains Mono typography
  - Smooth modal open/close animations
  - Hover effects and micro-interactions

#### 🤖 AI Integration
- **Multi-Provider AI Support** — Optional AI-powered features with graceful fallback
  - OpenAI integration (GPT-4, GPT-3.5)
  - Anthropic integration (Claude)
  - Ollama integration (local models, free)
  - Automatic provider detection from environment variables
  - Graceful fallback when no API keys configured

#### 🌍 Multi-Language Support
- **Python** — Full symbol extraction, import analysis, complexity metrics
- **Ruby** — Class, method, and module detection with gem dependencies
- **Java** — Package imports, class hierarchy, and annotation support
- **Go** — Package analysis, struct/interface extraction, import detection
- **Rust** — Mod/use statements, struct/enum/trait/impl detection

### Changed
- Dashboard REST API now includes git statistics endpoints
- Improved error handling across all API endpoints
- Enhanced type definitions for multi-language support

### Technical
- Added `src/ai/` module with provider abstraction
- Added `src/languages/` with 6 language providers
- Added `src/dashboard/` with React + Vite + Tailwind client
- Native Node.js HTTP server (no Express dependency)
- Comprehensive TypeScript types for all features

## [v0.2.0] - 2026-01-17

### Added
- Interactive wizard mode with guided prompts
- 12 new analysis modules
- MCP server for AI assistant integration

### Fixed
- Graph command data transformation
- Changelog auto-detection for repos without tags
- Hot paths graceful error handling

---

## [v0.2.0] - 2026-01-13

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
