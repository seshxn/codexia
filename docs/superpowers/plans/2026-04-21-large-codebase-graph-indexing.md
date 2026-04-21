# Large Codebase Graph Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codexia's repository graph fast and reliable for large codebases, then expose the persisted graph through the existing MCP server for Claude Code, Codex, and other MCP clients.

**Architecture:** Keep Kuzu as the default graph store until measured evidence says otherwise, because Codexia already uses embedded Kuzu and Kuzu's documented bulk import, FTS, vector, and graph traversal capabilities match this workload. Split the work into instrumentation, benchmark fixtures, optimized indexing, storage abstraction, MCP readiness, and a storage decision record so a future backend swap is based on latency, memory, and correctness data rather than guesswork.

**Tech Stack:** TypeScript, Vitest, Commander CLI, MCP JSON-RPC server, Kuzu Node.js API, Tree-sitter, local JSON/CSV/Parquet-compatible staging files.

---

## Current Findings

The existing implementation already has the right broad shape:

- `src/core/repo-indexer.ts` discovers files, parses them with Tree-sitter/language providers, and persists `.codexia/index-cache.json`.
- `src/core/dependency-graph.ts` builds an in-memory file dependency graph.
- `src/core/graph-store.ts` persists graph data to `.codexia/codegraph/graph.kuzu`.
- `src/core/semantic-index.ts` builds `.codexia/codegraph/semantic-index.json`.
- `src/cli/engine.ts` wires `analyzeRepository()`, `updateRepository()`, `queryGraph()`, `getCodeContext()`, `getBlastRadius()`, `executePseudoCypher()`, `getGraphStats()`, and semantic search.
- `src/mcp/server.ts` already exposes graph-facing MCP tools including `context`, `cypher`, `semantic_search`, `review_context`, `embed_graph`, and `graph_stats`.
- `src/cli/commands/setup.ts` writes an MCP config snippet that launches `npx codexia serve`.

The main large-codebase risks are implementation-level, not necessarily storage-choice-level:

- `GraphStore.indexFiles()` writes one Cypher statement per node/edge and performs repeated `MATCH` lookups.
- `syncTemporalData()` deletes and rebuilds all temporal data on every update.
- `deleteFileSubgraphs()` issues many statements per affected file.
- `RepoIndexer.performIndex()` reads/parses files serially.
- `SemanticIndex.search()` scans every document vector in memory and persists the whole index as JSON.
- `queryText()` uses `CONTAINS` scans instead of a native text index.
- `GraphStore.runCypher()` claims read-only MCP access but does not enforce read-only queries.
- MCP server initialization loads the in-memory index but does not guarantee the persisted graph and semantic index are fresh.

Useful official references for the implementation:

- Kuzu docs recommend `COPY FROM` for large graphs rather than per-row `CREATE`/`MERGE`: https://docs.kuzudb.com/import
- Kuzu Node.js docs show loading tables with `COPY` and running multiple Cypher statements through the Node API: https://docs.kuzudb.com/client-apis/nodejs/
- Kuzu FTS supports BM25 over node table `STRING` properties: https://docs.kuzudb.com/extensions/full-text-search/
- Kuzu vector extension provides disk-based HNSW vector indexes over node vector properties: https://docs.kuzudb.com/extensions/vector/
- Kuzu prepared statement docs recommend parameterized Cypher instead of string concatenation: https://docs.kuzudb.com/get-started/prepared-statements
- DuckDB FTS exists but index refresh is manual; this is useful as a search-side comparison, not an obvious graph-store replacement: https://duckdb.org/docs/current/core_extensions/full_text_search.html

## Performance Targets

Use these as initial acceptance gates. Tune after the benchmark harness captures a baseline on real repositories.

- Full analyze on 10k files: under 60 seconds on a modern laptop, peak RSS under 2 GB.
- Full analyze on 50k files: under 6 minutes, peak RSS under 4 GB.
- Incremental update for 10 changed files in a 50k-file repo: under 10 seconds, no full graph rebuild.
- `graph_stats`: under 500 ms after server startup.
- `context` for file/symbol: p95 under 300 ms on 50k files.
- `cypher` read-only query with bounded result: p95 under 1 second for common traversals.
- `semantic_search`: p95 under 800 ms on 100k indexed documents.

## Storage Decision Rule

Do not switch storage in the first pass. Optimize the current Kuzu path and benchmark it first.

Switch or add a second backend only if at least one of these remains true after the bulk-import and indexing work:

- Full graph build remains more than 2x slower than the same data loaded into a candidate backend.
- Incremental updates cannot be made bounded by changed-file scope.
- MCP query latency targets cannot be met with native Kuzu indexes and bounded query guards.
- Kuzu Node.js packaging or install behavior blocks realistic use in Claude Code/Codex workflows.

Candidate backends to compare only after the optimized Kuzu baseline:

- **Kuzu optimized:** default target; best fit for property graph traversal and embedded MCP usage.
- **DuckDB sidecar:** useful for tabular metadata, FTS, benchmark analytics, and possibly semantic document search, but not a natural replacement for graph traversal.
- **SQLite/FTS5 sidecar:** simple and portable for lexical search/cache metadata, but not enough for graph traversal alone.
- **External graph DBs such as Neo4j/Memgraph:** likely not right for a local agent tool because they add service setup friction, but can be documented as out-of-process adapters later.
- **Vector stores:** only for semantic search if Kuzu vector indexing does not meet targets; they should not replace the structural graph.

---

### Task 1: Add Indexing and MCP Benchmark Harness

**Files:**
- Create: `src/core/fixtures/large-repo-fixture.ts`
- Create: `src/core/index-benchmark.ts`
- Create: `src/core/index-benchmark.test.ts`
- Modify: `src/core/index.ts`
- Modify: `src/cli/commands/analyze.ts`
- Modify: `src/cli/formatter.ts`
- Test: `src/core/index-benchmark.test.ts`

- [ ] **Step 1: Write failing fixture tests**

Add tests that generate deterministic repositories without committing large fixture files.

```ts
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLargeRepoFixture } from './fixtures/large-repo-fixture.js';

describe('createLargeRepoFixture', () => {
  it('creates deterministic import chains and exported symbols', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-large-fixture-'));
    const fixture = await createLargeRepoFixture(repoRoot, {
      files: 120,
      fanout: 3,
      symbolsPerFile: 4,
      language: 'typescript',
    });

    expect(fixture.files).toBe(120);
    expect(fixture.expectedSymbols).toBe(480);
    expect(await fs.readFile(path.join(repoRoot, 'src/module-0000.ts'), 'utf-8')).toContain('export function fn0000_00');

    await fs.rm(repoRoot, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run fixture test to verify RED**

Run: `npm test -- src/core/index-benchmark.test.ts`
Expected: FAIL because fixture helper does not exist.

- [ ] **Step 3: Implement deterministic fixture generator**

Create `createLargeRepoFixture(repoRoot, options)` that writes import chains and symbol references.

```ts
export interface LargeRepoFixtureOptions {
  files: number;
  fanout: number;
  symbolsPerFile: number;
  language: 'typescript';
}

export interface LargeRepoFixtureResult {
  repoRoot: string;
  files: number;
  expectedSymbols: number;
  expectedImports: number;
}
```

- [ ] **Step 4: Add benchmark runner tests around engine operations**

Add tests with small fixtures that verify metric shape without enforcing laptop-dependent timings.

```ts
it('measures analyze, update, graph stats, context, and semantic search', async () => {
  const result = await runIndexBenchmark(repoRoot, {
    query: 'auth service',
    contextFile: 'src/module-0001.ts',
    changedFiles: ['src/module-0002.ts'],
  });

  expect(result.analyze.durationMs).toBeGreaterThan(0);
  expect(result.update.durationMs).toBeGreaterThan(0);
  expect(result.graph.files).toBeGreaterThan(0);
  expect(result.mcpLike.context.durationMs).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Implement `runIndexBenchmark()`**

The runner should:

- Instantiate `CodexiaEngine`.
- Run `analyzeRepository({ force: true })`.
- Modify a chosen file.
- Run `updateRepository()`.
- Measure `getGraphStats()`, `getCodeContext()`, `queryGraph()`, `semanticSearch()`, and `executePseudoCypher()`.
- Capture `process.memoryUsage().rss`.
- Return machine-readable JSON.

- [ ] **Step 6: Add an opt-in CLI benchmark flag**

Extend `codexia analyze` with:

- `--benchmark`
- `--fixture-files <count>`
- `--fixture-fanout <count>`
- `--fixture-symbols <count>`
- `--benchmark-output <path>`

Keep it opt-in so normal users are not affected.

- [ ] **Step 7: Verify benchmark path**

Run: `npm test -- src/core/index-benchmark.test.ts`
Expected: PASS

Run: `npm run build:cli`
Expected: PASS

### Task 2: Introduce a Graph Storage Contract

**Files:**
- Create: `src/core/graph-store-types.ts`
- Modify: `src/core/graph-store.ts`
- Modify: `src/core/index.ts`
- Modify: `src/cli/engine.ts`
- Test: `src/core/graph-store.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add a test that exercises the graph store through an interface, not the concrete class.

```ts
import { describe, expect, it } from 'vitest';
import { GraphStore } from './graph-store.js';
import type { GraphStoreAdapter } from './graph-store-types.js';

describe('GraphStoreAdapter contract', () => {
  it('exposes file context, symbol context, stats, and read-only query operations', async () => {
    const store: GraphStoreAdapter = new GraphStore(repoRoot);
    await store.initialize();
    await store.rebuild(files, depGraph);
    expect(await store.getStats()).toMatchObject({ files: 2 });
    expect(await store.getFileContext('src/a.ts')).toEqual(expect.any(Array));
  });
});
```

- [ ] **Step 2: Run contract test to verify RED**

Run: `npm test -- src/core/graph-store.test.ts`
Expected: FAIL because `graph-store-types.ts` does not exist.

- [ ] **Step 3: Define the adapter and metric types**

```ts
export interface GraphStoreBuildMetrics {
  files: number;
  functions: number;
  classes: number;
  types: number;
  modules: number;
  relationships: number;
  durationMs: number;
}

export interface GraphStoreAdapter {
  initialize(): Promise<void>;
  rebuild(files: Map<string, FileInfo>, dependencyGraph: DependencyGraphReader): Promise<GraphStoreBuildMetrics>;
  updateFiles(files: Map<string, FileInfo>, dependencyGraph: DependencyGraphUpdateReader, changedFiles: string[], deletedFiles: string[]): Promise<GraphStoreBuildMetrics>;
  syncTemporalData(files: Map<string, FileInfo>, commits: CommitRecord[]): Promise<GraphStoreBuildMetrics>;
  queryText(search: string, limit?: number): Promise<QueryRow[]>;
  getFileContext(filePath: string): Promise<QueryRow[]>;
  getSymbolContext(symbolName: string): Promise<QueryRow[]>;
  getHistoryForTarget(target: string): Promise<QueryRow[]>;
  getDependents(filePath: string): Promise<QueryRow[]>;
  getDependencies(filePath: string): Promise<QueryRow[]>;
  getBlastRadius(files: string[], depth: number): Promise<Array<{ depth: number; files: string[] }>>;
  getTestsForSymbol(symbolName: string): Promise<QueryRow[]>;
  getStats(): Promise<QueryRow>;
  runReadOnlyCypher(query: string, options?: { limit?: number }): Promise<QueryRow[]>;
  close(): Promise<void>;
}
```

- [ ] **Step 4: Rename unsafe query surface**

Replace `runCypher()` with `runReadOnlyCypher()` in `GraphStore` and `CodexiaEngine.executePseudoCypher()`.

Add a read-only guard:

- Reject `CREATE`, `MERGE`, `SET`, `DELETE`, `DETACH`, `DROP`, `ALTER`, `COPY`, `LOAD`, `INSTALL`, `CALL CREATE_`, `CALL DROP_`, `IMPORT`.
- Allow `MATCH`, `WITH`, `RETURN`, `WHERE`, `ORDER BY`, `LIMIT`, `UNWIND` only for v1.
- Append or enforce a default `LIMIT 100` when no limit is present.

- [ ] **Step 5: Re-run contract tests**

Run: `npm test -- src/core/graph-store.test.ts`
Expected: PASS

### Task 3: Bulk Load Kuzu Instead of Per-Statement Writes

**Files:**
- Create: `src/core/graph-build-records.ts`
- Create: `src/core/graph-kuzu-bulk-loader.ts`
- Modify: `src/core/graph-store.ts`
- Test: `src/core/graph-store.test.ts`

- [ ] **Step 1: Write failing record-builder tests**

Test that graph records are created in memory before writing to Kuzu.

```ts
it('builds deduplicated node and relationship records from indexed files', () => {
  const records = buildGraphRecords(files, depGraph);

  expect(records.files).toHaveLength(2);
  expect(records.functions.map((item) => item.id)).toContain('src/a.ts:a:function:1');
  expect(records.dependsOn).toContainEqual({ from: 'src/a.ts', to: 'src/b.ts' });
});
```

- [ ] **Step 2: Run record-builder test to verify RED**

Run: `npm test -- src/core/graph-store.test.ts`
Expected: FAIL because record builder does not exist.

- [ ] **Step 3: Implement `buildGraphRecords()`**

Move graph record construction out of `GraphStore.indexFiles()` into pure functions:

- File nodes
- Function nodes
- Class nodes
- Type nodes
- Module nodes
- Contains relationships
- Class/method relationships
- Imports relationships
- File dependency relationships
- Inheritance/implementation relationships
- Function call relationships

Keep the existing `symbolId()` format for compatibility unless a migration task explicitly changes it.

- [ ] **Step 4: Implement Kuzu bulk staging writer**

Create temp CSV files under `.codexia/codegraph/tmp/<build-id>/` and load them with Kuzu `COPY`.

Use one file per table:

- `File.csv`
- `Function.csv`
- `Class.csv`
- `Type.csv`
- `Module.csv`
- `CONTAINS_FUNCTION.csv`
- `CONTAINS_CLASS.csv`
- `CONTAINS_TYPE.csv`
- `CLASS_CONTAINS.csv`
- `CALLS.csv`
- `INHERITS.csv`
- `IMPLEMENTS.csv`
- `IMPORTS_FROM.csv`
- `DEPENDS_ON.csv`

Implementation constraints:

- Write CSV with a small escaping helper and test it with quotes, commas, backslashes, and newlines.
- Copy nodes before relationships.
- Clean the temp directory after successful load.
- Leave temp files on failure only when `CODEXIA_KEEP_GRAPH_TMP=1`.

- [ ] **Step 5: Replace `indexFiles()` full-rebuild path with bulk load**

For `rebuild()`:

- `reset()`
- `initialize()`
- `buildGraphRecords(files, dependencyGraph, all files)`
- `bulkLoad(records)`

For small `updateFiles()` scopes, keep a row-wise fallback initially if the CSV load overhead is too high. The benchmark in Task 1 decides the threshold.

- [ ] **Step 6: Capture build metrics**

Return `GraphStoreBuildMetrics` from `rebuild()` and `updateFiles()`, and include relationship counts.

- [ ] **Step 7: Verify correctness and speed**

Run: `npm test -- src/core/graph-store.test.ts`
Expected: PASS

Run: `npm test`
Expected: PASS or only unrelated existing failures.

Run: `npm run build:cli`
Expected: PASS

### Task 4: Make Incremental Updates Truly Bounded

**Files:**
- Modify: `src/core/repo-indexer.ts`
- Modify: `src/core/dependency-graph.ts`
- Modify: `src/core/graph-store.ts`
- Modify: `src/cli/engine.ts`
- Test: `src/core/repo-indexer.test.ts`
- Test: `src/core/dependency-graph.test.ts`
- Test: `src/core/graph-store.test.ts`

- [ ] **Step 1: Write failing dependency invalidation tests**

Test that changed files, deleted files, direct dependents, and changed import targets are identified without deleting unrelated subgraphs.

```ts
it('limits graph updates to changed files and direct dependency repair scope', async () => {
  const result = await indexer.incrementalUpdate();
  const affected = dependencyGraph.getAffectedByFileChanges(result.changedFiles, result.deletedFiles);
  expect(affected).toEqual(expect.arrayContaining(['src/changed.ts', 'src/dependent.ts']));
  expect(affected).not.toContain('src/unrelated.ts');
});
```

- [ ] **Step 2: Add explicit dependency diff metadata**

Extend `IncrementalIndexResult` with:

- `changedImports: string[]`
- `changedSymbols: string[]`
- `dependencyRepairFiles: string[]`

Compute dependency repair scope by comparing previous and current imports for changed files.

- [ ] **Step 3: Replace broad temporal rebuild on update**

In `CodexiaEngine.updateRepository()`:

- Avoid calling `syncTemporalData()` for all files on every update.
- Add a new `syncTemporalDataForCommits(files, commits, changedFiles)` method or pass an options object.
- Only delete/rewrite commit edges affected by recent commits touching changed files.

- [ ] **Step 4: Optimize `deleteFileSubgraphs()`**

Replace many per-file statements with batched statements using `IN` lists or staged temp tables:

- Delete outgoing/incoming dependency relationships for affected files.
- Delete function call relationships for affected function ids.
- Delete contained symbol nodes for affected files.
- Delete file nodes.

Guard query size by chunking paths, for example 500 files per chunk.

- [ ] **Step 5: Re-run incremental tests**

Run: `npm test -- src/core/repo-indexer.test.ts src/core/dependency-graph.test.ts src/core/graph-store.test.ts`
Expected: PASS

### Task 5: Native Search Indexing for Lexical and Semantic Lookup

**Files:**
- Create: `src/core/search-index.ts`
- Modify: `src/core/semantic-index.ts`
- Modify: `src/core/graph-store.ts`
- Modify: `src/cli/engine.ts`
- Test: `src/core/semantic-index.test.ts`
- Test: `src/core/graph-store.test.ts`

- [ ] **Step 1: Write search contract tests**

```ts
it('returns lexical and semantic matches without scanning every document in TypeScript', async () => {
  const index = new SearchIndex(repoRoot);
  await index.build(files);
  const results = await index.search('authentication token', 5);
  expect(results[0]?.path).toBe('src/auth.ts');
});
```

- [ ] **Step 2: Decide v1 search storage based on Kuzu feature availability**

Preferred path:

- Add searchable `text` properties to `File`, `Function`, `Class`, and `Type` nodes.
- Use Kuzu FTS indexes for lexical BM25 search.
- Move the current hashed-vector documents into Kuzu node properties only if Kuzu vector support is stable in the installed `kuzu` package and does not create packaging problems.

Fallback path:

- Keep `SemanticIndex` JSON for semantic scoring for one release.
- Add an inverted lexical index file under `.codexia/codegraph/search-index.json` so lexical search is not a full document scan.

- [ ] **Step 3: Implement `SearchIndex` facade**

Expose:

```ts
export interface SearchIndexAdapter {
  build(files: Map<string, FileInfo>): Promise<SemanticIndexStats>;
  load(): Promise<void>;
  search(query: string, limit?: number): Promise<SemanticSearchResult[]>;
  exists(): Promise<boolean>;
  getStats(): SemanticIndexStats;
}
```

Wire `CodexiaEngine` to `SearchIndexAdapter` rather than directly to `SemanticIndex`.

- [ ] **Step 4: Add graph text fields**

Update graph node records with normalized searchable fields:

- File: `path`, `language`, imports, exports, symbol names
- Function: name, path, params, return type, docs, excerpt if available
- Class: name, path, base/implemented types
- Type: name, path, kind

- [ ] **Step 5: Verify semantic search behavior**

Run: `npm test -- src/core/semantic-index.test.ts src/core/graph-store.test.ts`
Expected: PASS

### Task 6: MCP Server Readiness for Claude Code and Codex

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `src/cli/commands/setup.ts`
- Modify: `docs/MCP.md`
- Create: `src/mcp/server.graph-readiness.test.ts`
- Test: `src/mcp/server.graph-readiness.test.ts`

- [ ] **Step 1: Write failing MCP readiness tests**

```ts
it('reports graph readiness and stale index guidance through graph_stats', async () => {
  const result = await server.executeTool('graph_stats', {});
  expect(result.content[0].type).toBe('json');
  expect(result.content[0].json).toMatchObject({
    repo: expect.any(Object),
    graph: expect.any(Object),
    semantic: expect.any(Object),
    mcp: expect.objectContaining({ ready: expect.any(Boolean) }),
  });
});

it('rejects write Cypher from MCP', async () => {
  const result = await server.executeTool('cypher', { query: 'MATCH (f:File) DETACH DELETE f' });
  expect(result.content[0].type).toBe('text');
  expect(result.content[0].text).toContain('read-only');
});
```

- [ ] **Step 2: Add graph readiness model**

Extend `getGraphStats()` response with:

```ts
mcp: {
  ready: boolean;
  reasons: string[];
  suggestedCommand?: 'codexia analyze' | 'codexia update' | 'codexia embed_graph';
  transports: ['stdio', 'http'];
}
```

Ready means:

- Local index exists.
- Persisted graph has file count greater than zero.
- Semantic index exists or is explicitly optional for structural tools.
- State is not stale, or the response says exactly why it is stale.

- [ ] **Step 3: Make `codexia/scan` build the persisted graph**

Currently `handleScan()` calls `engine.scan()`, which only indexes in memory and initializes the graph store. Change it to call:

- `analyzeRepository({ force })` when no persisted graph exists or `force` is true.
- `updateRepository()` when graph exists and index is stale.
- Keep a fast in-memory scan only if a new explicit `metadataOnly` parameter is supplied.

- [ ] **Step 4: Improve setup output for Claude Code and Codex**

Update `codexia setup` to write `.codexia/codegraph/mcp-config.json` with:

- `codexia` stdio config using `npx codexia serve`
- `codexia-http` example using `codexia serve --http --port 3000`
- A note field with `codexia analyze` as the first-run command

Document where to paste the snippet for Claude Code and Codex without assuming one global path.

- [ ] **Step 5: Re-run MCP tests**

Run: `npm test -- src/mcp/server.graph-readiness.test.ts src/mcp/server.refactor-plan.test.ts src/mcp/server.drift.test.ts`
Expected: PASS

### Task 7: Storage Backend Benchmark and Decision Record

**Files:**
- Create: `src/core/storage-candidates/kuzu-optimized.ts`
- Create: `src/core/storage-candidates/duckdb-sidecar.md`
- Create: `docs/architecture/graph-storage-decision.md`
- Modify: `docs/USAGE.md`
- Test: `src/core/index-benchmark.test.ts`

- [ ] **Step 1: Capture optimized Kuzu benchmark output**

Run representative local benchmarks:

```bash
npm run build:cli
node dist/cli/index.js analyze --benchmark --fixture-files 10000 --fixture-fanout 4 --fixture-symbols 5 --benchmark-output .codexia/codegraph/bench-10k.json
node dist/cli/index.js analyze --benchmark --fixture-files 50000 --fixture-fanout 4 --fixture-symbols 5 --benchmark-output .codexia/codegraph/bench-50k.json
```

Expected: JSON files include durations, memory, graph counts, semantic counts, and MCP-like query timings.

- [ ] **Step 2: Prototype candidate sidecars only if Kuzu misses targets**

If needed, prototype one candidate at a time behind `GraphStoreAdapter` or `SearchIndexAdapter`.

Do not add production dependencies until the candidate beats optimized Kuzu by a meaningful margin and preserves MCP behavior.

- [ ] **Step 3: Write the decision record**

Document:

- Current bottlenecks.
- Benchmark data before and after optimization.
- Whether Kuzu stays as default.
- Whether a sidecar search index is adopted.
- Deferred backend candidates and why.
- Operational impact for MCP clients.

- [ ] **Step 4: Update usage docs**

Add a short large-repo section to `docs/USAGE.md`:

- Run `codexia analyze` once.
- Run `codexia update` after edits.
- Use `codexia status` and MCP `graph_stats` to verify freshness.
- Use `codexia setup` then `codexia serve` for Claude Code/Codex.

### Task 8: Final Verification

**Files:**
- No new source files unless previous tasks require fixes.

- [ ] **Step 1: Run focused graph/index/MCP tests**

Run:

```bash
npm test -- src/core/graph-store.test.ts src/core/repo-indexer.test.ts src/core/dependency-graph.test.ts src/core/semantic-index.test.ts src/mcp/server.graph-readiness.test.ts
```

Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS or explicitly document unrelated existing failures.

- [ ] **Step 3: Run type/build verification**

Run: `npm run build:cli`
Expected: PASS

- [ ] **Step 4: Run a real-repo smoke test**

Run:

```bash
node dist/cli/index.js analyze --force
node dist/cli/index.js status
node dist/cli/index.js serve --http --port 3000
```

In another shell, call `graph_stats`, `context`, `semantic_search`, and a read-only `cypher` query against `/mcp`.

Expected:

- Graph file count matches status.
- MCP `graph_stats` reports ready.
- Read-only `cypher` returns rows.
- Write `cypher` is rejected.
- Context and semantic search work without triggering full reindex.

## Rollout Notes

- Keep `.codexia/codegraph/graph.kuzu` as the canonical persisted graph for this release unless Task 7 proves otherwise.
- Treat `.codexia/index-cache.json` as a parser cache, not the graph source of truth.
- Prefer additive migrations; delete and rebuild the Kuzu graph on schema-version changes.
- Add a graph schema version to `.codexia/codegraph/state.json` before changing node/relationship properties.
- Avoid remote services in the default path. MCP users should be able to run everything locally through `codexia serve`.
