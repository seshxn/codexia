# CLI Guide

Use this for command workflows, automation, and reference-level CLI behavior.

If you are just trying to get your first scan running, start with [Getting Started](getting-started.md). If you need advanced review search or graph-context helpers, see [USAGE](USAGE.md).
Local analysis stays on your machine by default, while AI, GitHub, and Jira remain optional integrations. This guide covers the primary workflows and a few common commands. The full CLI surface also includes specialized commands such as `init`, `scan`, `monorepo`, `changelog`, and others exposed by `codexia --help`.
Operations-related dashboard engineering analytics performs remote API calls when configured.

## Core Workflows

Codexia commands are easiest to think about as workflows:

- `Core`: `analyze`, `update`, `status`
- `Inspect`: `impact`, `graph`, `history`, `complexity`, `signals`, `hotpaths`, `pr-report`
- `Enforce`: `check`, `invariants`, `tests`
- `Integrations`: `setup`, `serve`, `list`, `mcp-server`
- `Operations`: `dashboard`

Run `codexia` with no arguments if you want the interactive wizard instead of a direct command.

## Command Groups

### Index

Use these commands to build and refresh the local graph.

- `codexia analyze` builds or updates the persisted graph.
- `codexia update` refreshes changed files incrementally.
- `codexia status` reports graph health and freshness.

### Inspect

Use these commands to understand what changed and what it affects.

- `codexia impact` traces dependency blast radius.
- `codexia graph` visualizes structure, including HTML output.
- `codexia history` surfaces temporal and ownership patterns.
- `codexia complexity` highlights maintainability and coupling hot spots.
- `codexia signals` and `codexia hotpaths` focus attention on critical areas.
- `codexia pr-report` packages review evidence for pull requests.

### Enforce

Use these commands to check rules and quality gates.

- `codexia check` validates conventions.
- `codexia invariants` checks architectural rules.
- `codexia tests` recommends tests affected by a change.

### Integrations

Use these commands when Codexia is wired into other tools. Core analysis still stays local.

- `codexia setup` writes an MCP config snippet.
- `codexia serve` starts the MCP server.
- `codexia list` shows registered graph repos.
- `codexia mcp-server` remains available as a legacy alias.

### Operations

Use these commands for the source-run dashboard and engineering analytics.

- `codexia dashboard` starts the web dashboard from a repo checkout or source build; it is not included in the published npm package.

## JSON And Automation

Most commands support machine-readable output.

```bash
codexia analyze --json
codexia impact --staged --json
codexia check --json
codexia history --json
```

Prefer `--json` when another tool needs to consume the result. Use `--format` when you want a non-default human-readable rendering.

## Reference

The wizard exposes a curated subset of the CLI, while direct commands and help text cover the full surface. Use the smallest command that answers the job you have, then move to a focused doc if you need setup or integration detail:

- [MCP Tools](MCP.md) for assistant integration
- [Dashboard Guide](dashboard.md) for the web UI
- [AI Guide](ai.md) for provider setup
- [USAGE](USAGE.md) for advanced review and search flows
