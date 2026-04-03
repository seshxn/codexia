# Dashboard Guide

Use this when you want the source-run dashboard and engineering analytics setup in one place.

Local analysis stays on your machine by default. The dashboard can visualize repository health, complexity, drift, and connected service metrics when you configure the relevant tokens and team mappings. Those GitHub and Jira analytics perform remote API calls when configured. It runs from a repo checkout with built dashboard assets and is not available from the published npm package.
AI, GitHub, and Jira are optional integrations.

## What The Dashboard Includes

The dashboard focuses on engineering analytics rather than raw CLI output:

- repository health and freshness
- complexity and drift views
- code signals and hot paths
- contributor and branch activity
- GitHub and Jira-backed analytics when configured

If you want AI-backed explanations alongside Operations analytics, see [AI Guide](ai.md).

## Running From Source

The dashboard is available from a repository checkout after the dashboard client assets have been built into `src/dashboard/dist`.

```bash
npm run build:dashboard
npm run dev:dashboard
```

`npm run dev:dashboard` only rebuilds the CLI and launches the dashboard. It does not build the dashboard client assets, so a clean checkout still needs `npm run build:dashboard` first.

## GitHub Analytics Setup

GitHub analytics are optional. They use a token plus a repo slug that resolves from the checked-out remote, and they make remote API calls only when configured.

For local interactive use, the simplest path is:

```bash
codexia auth github
```

The dashboard startup path now reads those stored credentials automatically. CI and headless use should continue to rely on environment variables.

Environment-variable setup remains supported:

```bash
export CODEXIA_GITHUB_TOKEN=ghp_...
```

For multi-repo grouping, add explicit team mapping:

```bash
export CODEXIA_DASHBOARD_TEAMS_JSON='{"teams":[{"name":"Platform","repos":["acme/api","acme/web"]}]}'
```

## Jira Analytics Setup

Jira metrics are optional and only apply when you want sprint and board context in the dashboard. They make remote API calls only when configured.

For local interactive use:

```bash
codexia auth jira
```

That stores Jira base URL, email, and API token in the OS keychain. Bearer-token mode remains env-only for headless or enterprise setups.

Environment-variable setup remains supported:

```bash
export CODEXIA_JIRA_BASE_URL=https://your-company.atlassian.net
export CODEXIA_JIRA_EMAIL=you@company.com
export CODEXIA_JIRA_API_TOKEN=...
```

Use Jira setup together with GitHub analytics if you want cross-signal reporting for sprint health and delivery trends.

## Freshness And Cost Expectations

The dashboard stays as fresh as the repository and remote services you connect to. Local repository views are cheap; GitHub and Jira views depend on the tokens, APIs, and refresh cadence you configure.

If you only want local analysis, leave the remote variables unset and use the dashboard as a local repo viewer.
