# Graph Storage Decision

Date: 2026-04-21

## Decision

Codexia keeps Kuzu as the canonical local graph store for the 0.7.0 release.

The bottleneck was not the choice of graph database itself. The previous implementation wrote one Cypher statement per node or edge during full rebuilds, rebuilt all temporal edges during every update, used a content cache hash incorrectly, scanned semantic documents for lexical lookup, and exposed MCP Cypher as "read-only" without enforcing it.

## Why Kuzu Stays

Kuzu is still the best fit for Codexia's default local-agent workflow:

- It is embedded and does not require users to run a separate graph service.
- It stores the structural graph in `.codexia/codegraph/graph.kuzu`.
- It supports bulk `COPY FROM` loading, which is now used for full rebuilds.
- It supports graph traversal directly through Cypher for MCP tools.

External graph databases remain out of scope for the default package because they add setup and lifecycle cost for Claude Code, Codex, and editor MCP users.

## Implemented Changes

- Full graph rebuilds now build graph records in memory and bulk-load Kuzu CSV files with `COPY FROM`.
- `GraphStoreAdapter` defines the storage boundary for future backend comparisons.
- `codexia analyze --benchmark` can generate deterministic large repositories and measure analyze/update/MCP-like query paths.
- Incremental updates now compare file-content hashes correctly and expose changed import/symbol/dependency repair scopes.
- Update repair uses previous and current dependency graphs so deleted files still repair their former dependents.
- Temporal sync now has a changed-file path to avoid full temporal relationship rebuilds on every update.
- Semantic search persists an inverted token index for lexical candidate selection.
- MCP `cypher` now rejects write queries and applies a default limit.
- MCP `graph_stats` reports readiness, warnings, suggested commands, and supported transports.

## Deferred

- Native Kuzu FTS and vector indexes are not enabled by default yet. The current semantic index remains dependency-free and local JSON-backed, with an added inverted token index.
- Relationship counts in build metrics are computed from records for full rebuilds. Incremental relationship metrics remain conservative.
- A DuckDB or SQLite sidecar may still be useful for tabular benchmark analytics or advanced text search, but it is not needed as a graph replacement in this release.

## Revisit Criteria

Revisit storage if optimized Kuzu misses any of these after real-repo benchmarks:

- Full analyze on 50k files cannot complete within the release target on a modern laptop.
- Incremental updates cannot stay bounded by changed files and affected dependents.
- MCP context and read-only Cypher p95 latency exceed target on large repositories.
- Kuzu Node packaging becomes a practical blocker for published npm usage.
