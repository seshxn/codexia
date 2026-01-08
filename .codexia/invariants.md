# Invariants

Rules that must never be violated.

### No Circular Dependencies

The codebase must not contain circular module dependencies. The dependency graph must be a DAG.

### CLI Must Not Import Core Internals

CLI commands should only use the public Engine API, never import directly from core modules.

### All Exports Must Be Typed

Every exported function, class, and value must have explicit TypeScript types.

### Analysis Must Be Deterministic

Given the same input, analysis must produce the same output. No randomness, no external state dependency.

### Evidence Required

Every insight or suggestion must be traceable to specific code evidence (file, line, commit).
