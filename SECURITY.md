# Security Policy

## Supported Versions

We currently support the latest released version on the `main` branch.

## Reporting a Vulnerability

Please report security issues via GitHub Security Advisories:
- https://github.com/seshxn/codexia/security/advisories

## Scope

This policy covers:
- CLI usage and local file analysis.
- Dashboard server and client.
- MCP server integration.
- AI provider integrations.

## Security Expectations

- No secrets should be stored in the repository or in generated output.
- API keys must be provided via environment variables.
- Network services should be bound to localhost by default.
- Any new endpoint must include input validation and least-privilege access.

## Coordinated Disclosure Timeline

We aim to acknowledge reports within 72 hours and provide a remediation plan within 14 days.
