# AI Guide

Use this when you want to configure Codexia with an AI provider and understand what leaves your machine.

## Local-First Defaults

Local analysis stays on your machine by default. Codexia works without AI, and local analysis, graphing, review context, and dashboard workflows all continue when no provider is configured.

AI, GitHub, and Jira are optional integrations. Enable AI only if you want natural-language assistance or provider-backed explanations.
For Operations analytics, dashboard engineering analytics performs remote API calls when configured.

## Provider Options

Set the provider with environment variables. Supported providers are:

- `openai`: remote, use `CODEXIA_AI_API_KEY` and optionally `CODEXIA_AI_BASE_URL`
- `anthropic`: remote, use `CODEXIA_AI_API_KEY` and optionally `CODEXIA_AI_BASE_URL`
- `gemini`: remote, use `CODEXIA_AI_API_KEY`
- `bedrock`: AWS-hosted, use `CODEXIA_AI_AWS_REGION`, `CODEXIA_AI_AWS_ACCESS_KEY_ID`, `CODEXIA_AI_AWS_SECRET_ACCESS_KEY`, and optionally `CODEXIA_AI_AWS_SESSION_TOKEN`
- `ollama`: local, use `CODEXIA_AI_BASE_URL` and `CODEXIA_AI_MODEL`

Example:

```bash
export CODEXIA_AI_PROVIDER=gemini
export CODEXIA_AI_API_KEY=...
```

OpenAI, Anthropic, and Gemini are remote providers. Bedrock is AWS-hosted. Ollama keeps the model on your machine.

## What Leaves Your Machine

When AI is enabled, Codexia may send prompts, code snippets, or repository context to the selected provider so it can answer the request. The exact payload depends on the feature you invoke.

If you do not configure a provider, Codexia does not send AI requests and falls back to its built-in analysis paths.

## Failure And Fallback Behavior

If a provider is unavailable or misconfigured, AI-backed features should fail cleanly instead of blocking Core workflows. Treat AI as an additive layer, not a dependency for scanning, indexing, or review-context generation.

If you want Operations analytics or Core command workflows without provider setup, use [Dashboard Guide](dashboard.md) and [CLI Guide](cli.md) first. The dashboard runs from a repo checkout or source build and is not available from the published npm package.
