# Drift Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Drift Radar end-to-end with composite drift scoring, velocity over recent commits, layer heatmap, reverse convention mining, MCP access, and dashboard visualization.

**Architecture:** Add a new `DriftRadar` module that computes drift from indexed files + memory + dependency graph + recent commits, expose it through `CodexiaEngine.analyzeDrift()`, then wire MCP and dashboard API/UI to consume a consistent JSON contract. Use a proxy commit-window trajectory for v1 to avoid expensive historical replay.

**Tech Stack:** TypeScript, Vitest, Commander CLI engine, MCP JSON-RPC server, dashboard server + React client.

---

### Task 1: DriftRadar Module (Core Logic)

**Files:**
- Create: `src/modules/drift-radar.ts`
- Modify: `src/modules/index.ts`
- Modify: `src/index.ts`
- Test: `src/modules/drift-radar.test.ts`

- [ ] **Step 1: Write failing tests for drift scoring, heatmap, velocity, and reverse convention mining**

```ts
it('computes weighted composite drift score and decomposition', () => {
  // Arrange files/violations
  // Act drift.analyze(...)
  // Assert composite and component scores
});

it('computes drift velocity direction over commit trajectory', () => {
  // Assert diverging/converging/stable mapping
});

it('produces layer heatmap by architecture layer', () => {
  // Assert per-layer score + violation counts
});

it('mines emergent conventions not explicitly declared', () => {
  // Assert candidate naming/file-style outputs with confidence
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- src/modules/drift-radar.test.ts`
Expected: FAIL due missing module/implementation

- [ ] **Step 3: Implement minimal `DriftRadar` module and types**

```ts
export class DriftRadar {
  analyze(input: DriftRadarInput): DriftRadarReport {
    // compute component scores
    // weighted composite
    // heatmap
    // trajectory + velocity
    // convention candidates
  }
}
```

- [ ] **Step 4: Re-run focused tests to verify GREEN**

Run: `npm test -- src/modules/drift-radar.test.ts`
Expected: PASS

- [ ] **Step 5: Export module from package surfaces**

Add exports in:
- `src/modules/index.ts`
- `src/index.ts`

- [ ] **Step 6: Re-run module test and typecheck surface**

Run: `npm test -- src/modules/drift-radar.test.ts`
Expected: PASS

### Task 2: Engine Integration

**Files:**
- Modify: `src/cli/engine.ts`
- Test: `src/cli/engine.drift.test.ts`

- [ ] **Step 1: Write failing engine test for `analyzeDrift()` contract**

```ts
it('returns drift report with composite, components, velocity, heatmap, and trajectory', async () => {
  const engine = new CodexiaEngine({ repoRoot: fixtureRepo });
  const report = await engine.analyzeDrift({ commits: 20 });
  expect(report.composite.score).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- src/cli/engine.drift.test.ts`
Expected: FAIL because method missing

- [ ] **Step 3: Implement `CodexiaEngine.analyzeDrift()`**

- Initialize and gather:
  - files (`indexer.getFiles()`)
  - memory (`memory.loadMemory()`)
  - invariant check (`invariantEngine`)
  - convention violations (`conventionChecker.checkAll(files)`)
  - dependency nodes (`depGraph.getNodes()`)
  - recent commits (`git.getRecentCommits(N)`)
- Delegate to `DriftRadar`.

- [ ] **Step 4: Run engine drift tests to verify GREEN**

Run: `npm test -- src/cli/engine.drift.test.ts`
Expected: PASS

### Task 3: MCP Tool Integration (`codexia/drift`)

**Files:**
- Modify: `src/mcp/server.ts`
- Test: `src/mcp/server.drift.test.ts`
- Modify: `docs/MCP.md`

- [ ] **Step 1: Write failing tests for tool list and tool execution response shape**

```ts
it('registers codexia/drift in tools/list', () => {
  expect(toolNames).toContain('codexia/drift');
});

it('returns drift report via tools/call', async () => {
  const result = await server.executeTool('codexia/drift', { commits: 30 });
  expect(result.content[0]).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- src/mcp/server.drift.test.ts`
Expected: FAIL (tool absent)

- [ ] **Step 3: Add MCP schema + handler**

- Add `codexia/drift` in `getTools()`.
- Add switch case in `executeTool`.
- Implement `handleDrift()` using `engine.analyzeDrift()`.

- [ ] **Step 4: Re-run MCP tests to verify GREEN**

Run: `npm test -- src/mcp/server.drift.test.ts`
Expected: PASS

- [ ] **Step 5: Update MCP docs**

Document `codexia/drift` request/response in `docs/MCP.md`.

### Task 4: Dashboard API + UI Panel

**Files:**
- Modify: `src/dashboard/server/index.ts`
- Modify: `src/dashboard/client/src/types.ts`
- Modify: `src/dashboard/client/src/api.ts`
- Create: `src/dashboard/client/src/components/DriftRadarPanel.tsx`
- Modify: `src/dashboard/client/src/components/RepositoryDashboard.tsx`

- [ ] **Step 1: Add server endpoint `/api/drift`**

- Route registration in `handleApiRoute`.
- `getDrift(url)` method using `engine.analyzeDrift()` with query `commits`.
- Follow existing cache pattern (`ResultCache`).

- [ ] **Step 2: Add dashboard client types + fetcher**

- Add `DriftData` interface in `types.ts`.
- Add `fetchDrift(params?)` in `api.ts`.

- [ ] **Step 3: Add `DriftRadarPanel` component**

- Show composite score + component breakdown cards.
- Show trajectory chart for recent commits.
- Show velocity badge (converging/diverging/stable).
- Show layer heatmap list and emergent convention candidates.

- [ ] **Step 4: Mount panel in repository dashboard**

- Fetch drift via `useApi`.
- Render panel in a new card section.

- [ ] **Step 5: Run dashboard type/build verification**

Run: `npm run build:cli`
Expected: PASS (server + shared TS)

Run: `cd src/dashboard/client && npm run build`
Expected: PASS (client types/components)

### Task 5: Final Verification + Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Drift Radar to README feature lists and MCP section**

- [ ] **Step 2: Run targeted and broad verification**

Run: `npm test -- src/modules/drift-radar.test.ts src/cli/engine.drift.test.ts src/mcp/server.drift.test.ts`
Expected: PASS

Run: `npm test`
Expected: PASS (or report unrelated existing failures explicitly)

Run: `npm run build:cli`
Expected: PASS

- [ ] **Step 3: Summarize outputs and any residual risks**

- Note that trajectory is commit-window proxy and not full historical replay.
- Note any edge cases deferred to follow-up.
