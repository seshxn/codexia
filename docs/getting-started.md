# Getting Started

Use this when you want the shortest path to a first local success with Codexia.

Local analysis stays on your machine by default. Codexia analyzes a repository on your machine, builds a persisted graph, and then lets you inspect impact, history, quality, and integration surfaces from there. You do not need AI, GitHub, or Jira configured to get started.

## What Codexia Is

Codexia is local repository intelligence for codebases and AI coding agents. It starts with your checkout, indexes it, and keeps the core workflows evidence-based.

If you want the workflow-based Core CLI guide, jump to [CLI Guide](cli.md). If you are setting up Integrations or Operations, use [MCP Tools](MCP.md), [Dashboard Guide](dashboard.md), or [AI Guide](ai.md).

## Local-Only Quick Start

```bash
npm install -g codexia
cd /path/to/repo
codexia analyze
codexia status
```

That sequence gives you a first scan and a quick health check. Change into the target repo before running `analyze` or `status`. If the repo changes, run `codexia update` to refresh incrementally.

## Common Next Steps

- Explore the main command flows in [CLI Guide](cli.md).
- Use [MCP Tools](MCP.md) if you want Codexia in an editor or assistant.
- Open [Dashboard Guide](dashboard.md) if you want the local web UI and engineering analytics. The dashboard runs from a repo checkout or source build and is not included in the published npm package.
- Read [AI Guide](ai.md) before enabling a provider.

## Optional Integrations

AI, GitHub, and Jira are optional integrations. They extend Codexia, but they are not required for core analysis:

- MCP for editors and assistants
- Operations: dashboard for source-run analytics and remote GitHub or Jira API calls when configured
- Integrations: AI providers for natural-language assistance

Start with the local workflow, then add only the integrations you need.
