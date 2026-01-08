# Codexia

![Codexia header banner showing brand colors and tagline](assets/codexia-header.png)

**Engineering intelligence layer for repositories.**

Codexia understands your codebase, its history, its architecture, and its rules—and produces evidence-based insight, not guesses.


---

## What Codexia Does

### 🔍 **Repository Scanning**

Indexes your codebase to understand structure, symbols, exports, and dependencies.

```bash
codexia scan
```

### 📊 **Impact Analysis**

Shows exactly what your changes affect—which modules, which consumers, which tests.

```bash
codexia impact --staged
codexia impact --branch feature/new-api
```

### ✅ **Convention Checking**

Validates changes against your project's documented conventions and architectural rules.

```bash
codexia check
```

### 🧪 **Test Suggestions**

Recommends specific tests based on what code actually changed.

```bash
codexia tests
```

### 📝 **PR Reports**

Generates comprehensive pull request analysis with risk scores and evidence.

```bash
codexia pr-report --base main --head feature/new-api
```

---

## Installation

```bash
npm install -g codexia
```

Or use directly with npx:

```bash
npx codexia scan
```

---

## Project Memory

Codexia uses a `.codexia/` directory in your repository to store architectural knowledge:

```text
.codexia/
├── architecture.md    # System design and module boundaries
├── conventions.md     # Coding standards and patterns
├── invariants.md      # Rules that must never be broken
└── adrs/              # Architecture Decision Records
    ├── ADR-0001.md
    └── ADR-0002.md
```

This "memory" is:

- **Human-readable** — Plain Markdown files
- **Version-controlled** — Part of your repo
- **AI-consumable** — Structured for tooling

---

## Output Formats

All commands support JSON output for integration with other tools:

```bash
codexia scan --json
codexia impact --staged --json
codexia check --json
```

---

## Philosophy

| Principle | Description |
| -------- | ------------- |
| **Evidence-based** | Every insight has a traceable source |
| **Deterministic** | Same input, same output—no randomness |
| **Transparent** | You can see exactly how conclusions are reached |
| **Composable** | Works with your existing tools, not against them |

---

## When to Use Codexia

✅ **Use Codexia when:**

- You want to understand impact before merging
- You need to enforce architectural boundaries
- You want evidence-based PR reviews
- You're onboarding to a new codebase

❌ **Don't use Codexia when:**

- You need code generation (use Copilot, Cursor, etc.)
- You want autocomplete suggestions
- You need natural language explanations (pair with an LLM)

---

## Integration with AI Tools

Codexia is designed to complement AI coding assistants:

- **GitHub Copilot** — You write code, Codexia analyzes impact
- **Cursor** — AI suggests changes, Codexia validates them
- **Claude/ChatGPT** — LLM explains, Codexia provides evidence

```bash
# Feed Codexia output to your AI tool
codexia impact --staged --json | your-ai-tool --context
```

---

## License

AGPL-3.0
