# MCP Tools

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
