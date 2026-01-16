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

### 🔗 **Dependency Visualization**

Visualize your dependency graph in multiple formats.

```bash
codexia graph                    # ASCII tree view
codexia graph --format mermaid   # Mermaid diagram
codexia graph --format dot       # Graphviz DOT format
codexia graph src/core/types.ts  # Focus on specific file
```

### 🧮 **Complexity Analysis**

Analyze code complexity, maintainability, and coupling metrics.

```bash
codexia complexity                     # Analyze all files
codexia complexity src/                # Specific directory
codexia complexity --threshold 60      # Show files below threshold
codexia complexity --symbols           # Include per-symbol breakdown
```

### 📜 **Git History Intelligence**

Understand temporal patterns, ownership, and risk from git history.

```bash
codexia history                   # Full temporal analysis
codexia history --churn           # File change frequency
codexia history --ownership       # Code ownership & bus factor
codexia history --coupling        # Files that change together
codexia history --regression-risk # Regression-prone areas
```

### 🛡️ **Architectural Invariants**

Enforce architectural rules and boundaries automatically.

```bash
codexia invariants              # Check all invariants
codexia invariants --init       # Generate example config
codexia invariants --strict     # Fail on any violation
```

### 🔥 **Hot Path Detection**

Identify critical code paths and their impact.

```bash
codexia hotpaths                     # Auto-detect entry points
codexia hotpaths -e src/index.ts     # From specific entry
codexia hotpaths --trace handleReq   # Trace through symbol
codexia hotpaths --impact src/db.ts  # Impact on hot paths
```

### 📋 **Changelog Generation**

Generate semantic changelogs from git history.

```bash
codexia changelog --from v1.0.0           # Since tag
codexia changelog --from HEAD~20          # Last 20 commits
codexia changelog --include-api           # Include API changes
codexia changelog -o CHANGELOG.md         # Write to file
```

### 📦 **Monorepo Support**

Analyze multi-package repositories (npm, yarn, pnpm, lerna, nx, turborepo).

```bash
codexia monorepo --detect           # Detect packages
codexia monorepo --graph            # Package dependency graph
codexia monorepo --impact @org/core # Cross-package impact
codexia monorepo --cycles           # Circular dependencies
```

### 👀 **Watch Mode**

Live analysis as you code.

```bash
codexia watch              # Watch and scan on changes
codexia watch --signals    # Watch and detect signals
codexia watch --impact     # Watch and analyze impact
codexia watch --check      # Watch and check conventions
```

### 🤖 **MCP Server (AI Integration)**

Model Context Protocol server for AI assistant integration.

```bash
codexia mcp-server                # Start stdio server (for Claude)
codexia mcp-server --port 3000    # Start HTTP server
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

## Invariants Configuration

Define architectural rules in `codexia.invariants.yaml`:

```yaml
rules:
  - name: no-ui-in-core
    description: "Core modules should not import from UI layer"
    type: no-import
    from: "src/core/**"
    target: "src/ui/**"
    severity: error

  - name: max-dependencies
    description: "No file should have more than 15 imports"
    type: max-dependencies
    max: 15
    scope: "src/**"
    severity: warning
```

Supported rule types:
- `no-import` — Prevent imports between modules
- `require-import` — Require certain dependencies
- `layer-boundary` — Enforce architectural layers
- `naming-pattern` — Enforce naming conventions
- `max-dependencies` — Limit import count
- `annotation-required` — Require JSDoc annotations

---

## MCP Integration

Codexia exposes a Model Context Protocol server for AI assistants:

```bash
# For Claude Desktop, add to claude_desktop_config.json:
{
  "mcpServers": {
    "codexia": {
      "command": "npx",
      "args": ["codexia", "mcp-server"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `codexia_scan` | Scan and index repository |
| `codexia_impact` | Analyze change impact |
| `codexia_context` | Get intelligent file context |
| `codexia_validate` | Check conventions |
| `codexia_signals` | Detect code signals |
| `codexia_tests` | Suggest affected tests |
| `codexia_dependencies` | Get dependency info |
| `codexia_hotpaths` | Analyze critical paths |
| `codexia_complexity` | Get complexity metrics |
| `codexia_memory` | Access project memory |

---

## Output Formats

All commands support JSON output for integration with other tools:

```bash
codexia scan --json
codexia impact --staged --json
codexia check --json
codexia complexity --json
codexia history --json
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

## CLI Reference

```
Usage: codexia [options] [command]

Commands:
  init                Initialize .codexia directory
  scan                Scan and index repository
  impact              Analyze change impact
  check               Check conventions
  tests               Suggest affected tests
  signals             Detect code signals
  pr-report           Generate PR analysis report
  watch               Watch mode with live analysis
  graph               Visualize dependency graph
  complexity          Analyze code complexity
  history             Analyze git history patterns
  invariants          Check architectural invariants
  hotpaths            Detect critical code paths
  changelog           Generate semantic changelog
  monorepo            Analyze monorepo structure
  mcp-server          Start MCP server for AI tools

Options:
  --json              Output as JSON
  --format <format>   Output format (text, json, markdown)
  -v, --verbose       Verbose output
  -h, --help          Display help
```

---

## When to Use Codexia

✅ **Use Codexia when:**

- You want to understand impact before merging
- You need to enforce architectural boundaries
- You want evidence-based PR reviews
- You're onboarding to a new codebase
- You need complexity and maintainability metrics
- You want to understand code ownership and bus factor
- You need to generate changelogs automatically
- You're working with monorepos

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
- **Claude Desktop** — Use MCP server for deep integration

```bash
# Feed Codexia output to your AI tool
codexia impact --staged --json | your-ai-tool --context

# Or use the MCP server directly
codexia mcp-server
```

---

## License

AGPL-3.0
