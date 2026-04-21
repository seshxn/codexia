import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLargeRepoFixture } from './fixtures/large-repo-fixture.js';
import { runIndexBenchmark } from './index-benchmark.js';

describe('index benchmark support', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('creates deterministic import chains and exported symbols', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-large-fixture-'));
    tempDirs.push(repoRoot);

    const fixture = await createLargeRepoFixture(repoRoot, {
      files: 120,
      fanout: 3,
      symbolsPerFile: 4,
      language: 'typescript',
    });

    expect(fixture.files).toBe(120);
    expect(fixture.expectedSymbols).toBe(480);
    expect(fixture.expectedImports).toBeGreaterThan(0);
    expect(await fs.readFile(path.join(repoRoot, 'src/module-0000.ts'), 'utf-8')).toContain('export function fn0000_00');
  });

  it('measures analyze, update, graph stats, context, and semantic search', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-benchmark-'));
    tempDirs.push(repoRoot);

    await createLargeRepoFixture(repoRoot, {
      files: 8,
      fanout: 2,
      symbolsPerFile: 2,
      language: 'typescript',
    });

    const result = await runIndexBenchmark(repoRoot, {
      query: 'module function',
      contextFile: 'src/module-0001.ts',
      changedFiles: ['src/module-0002.ts'],
    });

    expect(result.analyze.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.update.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.graph.files).toBeGreaterThan(0);
    expect(result.mcpLike.context.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.mcpLike.semanticSearch.durationMs).toBeGreaterThanOrEqual(0);
  });
});
