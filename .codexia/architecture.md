# Architecture

## Overview

Codexia is an engineering intelligence layer that analyzes repositories to provide evidence-based insights. It combines static analysis, git history mining, and architectural enforcement to deliver actionable intelligence for engineering teams.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                          │
├─────────────────────────────────────────────────────────────────┤
│  CLI Commands    │    MCP Server    │    Library API            │
├─────────────────────────────────────────────────────────────────┤
│                        Engine Layer                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  CodexiaEngine - Orchestrates analysis workflows        │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                       Module Layer                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │ImpactAnalyzer │  │ Visualizer    │  │ ComplexityEngine  │   │
│  ├───────────────┤  ├───────────────┤  ├───────────────────┤   │
│  │ TestSuggester │  │TemporalAnalyz │  │ InvariantEngine   │   │
│  ├───────────────┤  ├───────────────┤  ├───────────────────┤   │
│  │ConventionCheck│  │ HotPathDetect │  │ChangelogGenerator │   │
│  ├───────────────┤  ├───────────────┤  ├───────────────────┤   │
│  │MonorepoAnalyz │  │SmartTestPrior │  │    Watcher        │   │
│  └───────────────┘  └───────────────┘  └───────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                        Core Layer                               │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │ GitAnalyzer   │  │ RepoIndexer   │  │ DependencyGraph   │   │
│  ├───────────────┤  ├───────────────┤  ├───────────────────┤   │
│  │  SymbolMap    │  │ SignalsEngine │  │     Types         │   │
│  └───────────────┘  └───────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Layers

- **Core**: Low-level analysis primitives (git, indexing, symbols, dependency tracking)
- **Modules**: Higher-level analysis capabilities (impact, conventions, tests, visualization, complexity)
- **Engine**: Orchestration layer that coordinates modules and manages analysis workflows
- **CLI**: User-facing commands for terminal interaction
- **MCP**: Model Context Protocol server for AI tool integration

## Entry Points

| Entry Point | Purpose |
|-------------|---------|
| `src/cli/index.ts` | CLI entry point |
| `src/index.ts` | Library entry point |
| `src/mcp/server.ts` | MCP server entry point |
| `src/cli/engine.ts` | Analysis orchestration |

## Core Components

### GitAnalyzer
Wraps git operations and provides diff analysis. Extracts file changes, commit history, and blame information.

### RepoIndexer
Scans and indexes repository files using ts-morph for TypeScript/JavaScript analysis. Builds file metadata and extracts imports/exports.

### DependencyGraph
Builds and queries module dependency relationships. Supports:
- Direct and transitive dependency resolution
- Circular dependency detection
- Dependency path finding

### SymbolMap
Tracks symbols (functions, classes, types) across the codebase. Maps symbol names to their definitions and usages.

### SignalsEngine
Detects code quality signals and patterns including:
- Large file detection
- High complexity warnings
- Missing test coverage
- Import cycle detection

## Module Components

### ImpactAnalyzer
Analyzes the impact of file changes across the dependency graph. Identifies affected modules and suggests test priorities.

### Visualizer (v0.2.0)
Generates visual representations of the codebase:
- **ASCII**: Terminal-friendly text diagrams
- **Mermaid**: GitHub/GitLab compatible flowcharts
- **DOT**: Graphviz format for advanced rendering

### ComplexityEngine (v0.2.0)
Multi-dimensional complexity analysis:
- Cyclomatic complexity
- Cognitive complexity  
- Dependency complexity
- Halstead metrics
- Maintainability index

### TemporalAnalyzer (v0.2.0)
Git history intelligence:
- Change frequency hotspots
- Code churn analysis
- Ownership patterns
- Coupling detection (files that change together)

### InvariantEngine (v0.2.0)
Architectural rule enforcement with configurable constraints:
- Dependency rules (allowed/forbidden imports)
- Naming conventions
- Size limits
- Required patterns

### HotPathDetector (v0.2.0)
Identifies critical code paths based on:
- Import graph centrality
- Transitive dependent count
- Change coupling frequency

### ChangelogGenerator (v0.2.0)
Semantic changelog generation from git commits:
- Conventional commit parsing
- Feature/fix/breaking change categorization
- Markdown output

### MonorepoAnalyzer (v0.2.0)
Multi-package repository support:
- Package boundary detection
- Cross-package dependency analysis
- Package-scoped analysis

### SmartTestPrioritizer (v0.2.0)
Intelligent test ordering based on:
- Change impact analysis
- Historical failure rates
- Execution time optimization

## MCP Server (v0.2.0)

The Model Context Protocol server exposes Codexia's capabilities to AI assistants:

### Available Tools
| Tool | Description |
|------|-------------|
| `codexia_scan` | Full repository scan |
| `codexia_impact` | Analyze file change impact |
| `codexia_context` | Get file context (imports, exports, symbols) |
| `codexia_validate` | Run convention checks |
| `codexia_signals` | Detect code signals |
| `codexia_tests` | Get test suggestions |
| `codexia_dependencies` | Query dependency graph |
| `codexia_hotpaths` | Find critical paths |
| `codexia_complexity` | Analyze file complexity |
| `codexia_memory` | Load project memory |

## Data Flow

```
┌──────────┐    ┌────────────┐    ┌────────────┐    ┌──────────┐
│  Input   │───▶│   Engine   │───▶│  Modules   │───▶│  Output  │
│ (Command)│    │(Orchestrate)│   │ (Analyze)  │    │(Formatted)│
└──────────┘    └────────────┘    └────────────┘    └──────────┘
                      │                  │
                      ▼                  ▼
               ┌────────────┐    ┌────────────┐
               │    Core    │◀──▶│   Cache    │
               │ (Primitives)│   │ (Optional) │
               └────────────┘    └────────────┘
```

1. **Input**: CLI receives command or MCP server receives tool call
2. **Engine**: CodexiaEngine orchestrates the analysis workflow
3. **Core**: Low-level components gather raw data (git, files, symbols)
4. **Modules**: Process and analyze data using specialized algorithms
5. **Output**: Formatter produces human or machine-readable results

## Configuration Files

| File | Purpose |
|------|---------|
| `.codexia/memory.md` | Project context for AI tools |
| `.codexia/conventions.md` | Coding conventions |
| `.codexia/architecture.md` | Architecture documentation |
| `codexia.invariants.yaml` | Architectural constraints |

## Performance Considerations

- **Lazy Loading**: Analysis modules are loaded on-demand
- **Caching**: File metadata and dependency graphs can be cached
- **Incremental**: Watch mode performs incremental analysis
- **Parallel**: Independent file analyses run in parallel
