# Usage

Advanced workflows only. If you are onboarding or setting up integrations, start with [Getting Started](getting-started.md), [CLI Guide](cli.md), [MCP Tools](MCP.md), or [AI Guide](ai.md).

## Language Support

Codexia currently has two language tiers:

- Deep AST support via Tree-sitter: TypeScript/JavaScript, Python, Ruby, Java, Go, Rust, C#, Kotlin
- Provider-backed support: Swift, PHP, C/C++

Deep AST languages contribute richer graph edges such as calls, inheritance, implemented interfaces/traits, and parameter-aware symbols. Provider-backed languages still participate in indexing, dependency analysis, and complexity features.

## Review Context

Use `review_context` when you want a compact review packet instead of raw graph primitives.

- It resolves changed files from the working tree or staged diff.
- It computes blast radius groups by dependency depth.
- It returns changed symbols, impacted files, focused snippets, and review guidance.

Recommended flow:

```text
detect_changes -> review_context -> context/history for suspicious symbols
```

## Review PR

For pull-request review, update the graph first, then request review context for the changed files.

```text
analyze or update -> review_context -> impact -> semantic_search
```

Focus on:

- exported or public surface changes
- wide blast radius across packages or layers
- missing tests around changed symbols
- inheritance or interface contract changes

## Review Delta

For quick delta review during development, use staged changes:

```text
review_context { staged: true, depth: 2 }
```

This keeps the context focused on the changed hunks and their first- and second-hop dependents.

## Semantic Search

Use `semantic_search` when plain symbol lookup is too literal.

- Queries are matched against file paths, symbol names, imports, exports, and local code excerpts.
- Results are fused from lexical ranking and local vector similarity.
- `embed_graph` refreshes the local semantic index explicitly, although `analyze` and `update` also keep it current.

## Graph Stats

Use `graph_stats` to check graph health quickly.

It reports:

- repository freshness
- structural index counts
- persisted graph node counts
- semantic-index document and vocabulary counts
- recorded learning sessions

## Visualization

`codexia graph --format html` generates a self-contained interactive graph page.

The HTML view supports:

- file search
- edge-type toggles
- click-to-inspect node details

## Watch Mode

`codexia watch` now refreshes the persisted graph incrementally before rerunning analyses.

Use it when you want the graph, semantic index, and downstream tools to stay aligned with local edits while you work.
