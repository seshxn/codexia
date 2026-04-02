# MCP Tools

Use this for the common MCP workflows that most users need. It is intentionally narrower than a complete tool catalog. For first-run setup, see [Getting Started](getting-started.md). For broader CLI usage, see [CLI Guide](cli.md).
Local analysis stays on your machine by default. MCP is the integration layer for editor and agent workflows, while AI, GitHub, and Jira remain optional integrations. For provider setup or remote analytics, see [AI Guide](ai.md) and [Dashboard Guide](dashboard.md).
Operations dashboard engineering analytics performs remote API calls when configured.

## Quick Setup

Add Codexia to your MCP client with `codexia serve`:

```json
{
  "mcpServers": {
    "codexia": {
      "command": "npx",
      "args": ["codexia", "serve"]
    }
  }
}
```

`serve` is the preferred entry point. `mcp-server` remains available for compatibility.

For Core command workflows, use [CLI Guide](cli.md). For Operations analytics, use [Dashboard Guide](dashboard.md).

## Semantic Search

Tool names:

- `semantic_search`
- `semantic_search_nodes_tool`

Input:

```json
{ "query": "authentication middleware", "limit": 8 }
```

## Review Context

Tool names:

- `review_context`
- `get_review_context_tool`

Input:

```json
{ "staged": true, "depth": 2 }
```

## Embed Graph

Tool names:

- `embed_graph`
- `embed_graph_tool`

This refreshes the local semantic index used by semantic search.

## Docs Section

Tool names:

- `docs_section`
- `get_docs_section_tool`

Input:

```json
{ "section_name": "review-context" }
```

The section name can be a heading slug or a markdown file name.

## Graph Stats

Tool names:

- `graph_stats`
- `list_graph_stats_tool`

Use this to inspect graph freshness and semantic-index health before relying on graph-driven workflows.

## Refactor Plan

Tool names:

- `codexia/refactor-plan`

Input:

```json
{
  "type": "rename-symbol",
  "file": "src/modules/impact-analyzer.ts",
  "targetSymbol": "analyze",
  "newSymbolName": "analyzeImpact",
  "depth": 4
}
```

This is simulation-only. It returns blast radius, a compilable step-by-step migration sequence, per-step test gates, and extraction advice.

## Drift Radar

Tool name:

- `codexia/drift`

Input:

```json
{ "commits": 30 }
```

Returns composite drift score (0-100), component breakdown (boundary/naming/structural/dependency), drift trajectory + velocity, layer heatmap, and emergent convention candidates.

## Compatibility Aliases

The following aliases are exposed for older clients and helper flows:

- `semantic_search_nodes_tool`
- `get_review_context_tool`
- `embed_graph_tool`
- `get_docs_section_tool`
- `list_graph_stats_tool`

## Common Tool Map

Keep the integration surface focused on the jobs above:

- search and retrieval: `semantic_search`
- review packets: `review_context`
- graph refresh: `embed_graph`
- documentation lookup: `docs_section`
- graph health: `graph_stats`
- simulation workflows: `codexia/refactor-plan`
- architecture drift: `codexia/drift`
