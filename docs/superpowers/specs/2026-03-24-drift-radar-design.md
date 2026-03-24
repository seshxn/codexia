# Drift Radar Design

Date: 2026-03-24

## Problem
Engineering managers and tech leads need a continuous signal for architectural drift, not a one-off invariant check. The signal should show current drift, where drift is concentrated, and whether recent changes are converging or diverging.

## Scope
Build Drift Radar end-to-end across:
- Analysis module composed from existing memory/invariant/convention/temporal/dependency capabilities
- Engine API (`CodexiaEngine`) for drift analysis
- MCP tool: `codexia/drift`
- Dashboard API + panel for trajectory and drift decomposition

Out of scope:
- Historical reconstruction of full code snapshots at each commit
- Auto-fix workflows
- Persistent long-term drift time series storage (this version computes from current index + recent commits)

## Approach Options

### Option 1 (Recommended): Composite score at HEAD + commit-window proxy trajectory
- Compute full drift score from current indexed codebase and declared memory.
- Compute trajectory over last N commits using current drift hotspots intersected with each commit’s changed files.
- Pros: fast, deterministic, uses existing infrastructure, no expensive checkout/reindex loop.
- Cons: trajectory is a proxy, not exact historical replay.

### Option 2: Full historical replay for each commit
- Checkout each commit in window, re-index, recompute full drift per point.
- Pros: highest fidelity.
- Cons: very expensive, complex, risky for working tree, poor UX.

### Option 3: Persist incremental drift events per commit during watch/update
- Add event log and aggregate into trend.
- Pros: high fidelity over time once warmed.
- Cons: larger architectural change; needs persistence/migration strategy.

Recommendation: Option 1 for this iteration.

## Architecture
New module: `DriftRadar` in `src/modules/drift-radar.ts`

Inputs:
- `files: Map<string, FileInfo>`
- `architecture: ArchitectureMemory`
- `invariantCheck: InvariantCheckResult`
- `conventionViolations: ConventionViolation[]`
- `dependencyGraph: Map<string, DependencyNode>`
- `recentCommits: CommitRecord[]`

Outputs:
- Composite drift score `0-100` (higher = more drift)
- Decomposition:
  - boundary drift
  - naming drift
  - structural drift
  - dependency drift
- Drift heatmap by architectural layer
- Drift trajectory over last N commits
- Drift velocity summary (delta + slope + direction)
- Reverse convention mining candidates

## Scoring Model
Component scores normalized to `0-100`, then weighted average:
- boundary: 35%
- naming: 20%
- structural: 25%
- dependency: 20%

Signal mapping:
- Boundary drift from invariant layer-boundary/no-import violations + architecture boundary crossings.
- Naming drift from convention naming violations and naming-pattern invariant violations.
- Structural drift from file-size/export-count violations and layer containment mismatches.
- Dependency drift from cycles, high fan-in/fan-out outliers, and disallowed inter-layer edges.

## Trajectory + Velocity
For the last N commits:
- For each commit, compute a point score from changed-file overlap with current drift hotspots and violation density.
- Return ordered points with commit hash/date/message/score.

Velocity:
- `delta = latestScore - earliestScore`
- `slope = linear trend per commit`
- Direction:
  - converging (`delta < -threshold`)
  - diverging (`delta > threshold`)
  - stable (otherwise)

## Reverse Convention Mining
Detect repeated emergent patterns not present in declared conventions:
- Dominant filename style per layer (`kebab-case`, `camelCase`, `PascalCase`, etc.)
- Common import ordering/style signatures
- Repeated symbol naming regex candidates by kind

Return candidates with confidence and evidence counts; do not auto-enforce.

## Integration Points
- `src/modules/drift-radar.ts`: new analysis module
- `src/modules/index.ts` + `src/index.ts`: exports
- `src/cli/engine.ts`: `analyzeDrift()` public method + wiring
- `src/mcp/server.ts`: add `codexia/drift`
- `src/dashboard/server/index.ts`: add `/api/drift`
- `src/dashboard/client/src/types.ts`: drift types
- `src/dashboard/client/src/api.ts`: `fetchDrift`
- `src/dashboard/client/src/components/DriftRadarPanel.tsx`: new panel
- `src/dashboard/client/src/components/RepositoryDashboard.tsx`: mount panel

## Error Handling
- Missing memory: compute score from conventions/dependencies with reduced confidence.
- Missing git history: return current score + empty trajectory.
- Sparse commits (<2): velocity direction `stable` with zero slope.

## Testing Strategy
- Unit tests for score decomposition, velocity direction, heatmap aggregation, convention mining.
- Engine tests for `analyzeDrift` contract and option handling.
- MCP tests for tool registration + output shape.
- Keep dashboard surface type-safe; smoke-test via TypeScript build.

## Assumptions for This Iteration
- Drift trajectory is explicitly a commit-window proxy based on current indexed state.
- Dashboard integration is within existing visual language (no full design-system changes).
- MCP schema returns machine-usable JSON; no markdown formatting layer is added.
