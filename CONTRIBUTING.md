# Contributing

Thanks for your interest in contributing to Codexia! This guide covers how to get started, run tests, and submit changes.

## Code of Conduct

Please follow the guidelines outlined in [SECURITY.md](SECURITY.md) and the project’s standards of behavior. By participating, you agree to treat everyone with respect and professionalism.

## Getting Started

1. Fork the repo and clone your fork.
2. Install dependencies:
   - Root: `npm install`
   - Dashboard client: `cd src/dashboard/client && npm install`
3. Create a feature branch:
   - `git checkout -b feat/your-change`

## Development Workflow

- Keep changes focused and scoped.
- Prefer small, reviewable PRs.
- Update documentation when behavior changes.

### Build & Lint

- Root (CLI/core):
  - `npm run build`
  - `npm run lint`
- Dashboard client:
  - `cd src/dashboard/client`
  - `npm run build`
  - `npm run lint`

### Tests

- Root:
  - `npm test`
- Specific tests:
  - `npm test -- <pattern>`

## Commit Messages

Use clear, descriptive commit messages. Conventional commits are welcome but not required.

## Pull Requests

1. Ensure tests pass and lint is clean.
2. Provide a concise summary and link related issues.
3. Add screenshots for UI changes.

## Reporting Issues

- Include steps to reproduce, expected vs. actual behavior, and environment details.
- For security issues, follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the project’s [LICENSE](LICENSE).
