# Architecture

## Overview

Codexia is an engineering intelligence layer that analyzes repositories to provide evidence-based insights.

## Layers

- **Core**: Low-level analysis primitives (git, indexing, symbols)
- **Modules**: Higher-level analysis capabilities (impact, conventions, tests)  
- **CLI**: User-facing commands

## Entry Points

- `src/cli/index.ts` - CLI entry point
- `src/index.ts` - Library entry point

## Key Components

### GitAnalyzer

Wraps git operations and provides diff analysis.

### RepoIndexer

Scans and indexes repository files.

### DependencyGraph

Builds and queries module dependency relationships.

### SymbolMap

Tracks symbols (functions, classes, types) across the codebase.

### SignalsEngine

Detects code quality signals and patterns.

## Data Flow

1. CLI receives command
2. Engine orchestrates analysis
3. Core components gather data
4. Modules process and analyze
5. Formatter outputs results
