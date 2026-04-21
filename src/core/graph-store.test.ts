import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexiaEngine } from '../cli/engine.js';
import { createLargeRepoFixture } from './fixtures/large-repo-fixture.js';
import { buildGraphRecords } from './graph-build-records.js';
import { GraphStore } from './graph-store.js';
import type { GraphStoreAdapter } from './graph-store-types.js';
import type { FileInfo } from './types.js';

describe('GraphStoreAdapter contract', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('keeps GraphStore assignable to the adapter interface', () => {
    const StoreCtor: new (repoRoot: string) => GraphStoreAdapter = GraphStore;
    expect(StoreCtor).toBe(GraphStore);
  });

  it('builds deduplicated node and relationship records from indexed files', () => {
    const files = new Map<string, FileInfo>([
      [
        'src/a.ts',
        {
          path: 'src/a.ts',
          relativePath: 'src/a.ts',
          language: 'typescript',
          size: 80,
          lines: 3,
          imports: [{ source: './b.js', specifiers: ['b'], isDefault: false, isNamespace: false, line: 1 }],
          exports: [{ name: 'a', kind: 'function', isDefault: false, line: 2 }],
          symbols: [{
            name: 'a',
            kind: 'function',
            filePath: 'src/a.ts',
            line: 2,
            endLine: 3,
            column: 1,
            exported: true,
            references: [{ filePath: 'src/a.ts', line: 2, column: 24, kind: 'call', target: 'b' }],
          }],
        },
      ],
      [
        'src/b.ts',
        {
          path: 'src/b.ts',
          relativePath: 'src/b.ts',
          language: 'typescript',
          size: 40,
          lines: 1,
          imports: [],
          exports: [{ name: 'b', kind: 'function', isDefault: false, line: 1 }],
          symbols: [{
            name: 'b',
            kind: 'function',
            filePath: 'src/b.ts',
            line: 1,
            endLine: 1,
            column: 1,
            exported: true,
            references: [],
          }],
        },
      ],
    ]);

    const records = buildGraphRecords(files, {
      getDependencies(filePath: string): string[] {
        return filePath === 'src/a.ts' ? ['src/b.ts'] : [];
      },
    }, undefined, '2026-04-21T00:00:00.000Z');

    expect(records.files).toHaveLength(2);
    expect(records.functions.map((item) => item.id)).toContain('src/a.ts:a:function:2');
    expect(records.dependsOn).toContainEqual({ from: 'src/a.ts', to: 'src/b.ts' });
    expect(records.calls).toContainEqual({ from: 'src/a.ts:a:function:2', to: 'src/b.ts:b:function:1', line_number: 2 });
  });

  it('exposes graph context and rejects write Cypher through the engine path', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-graph-store-'));
    tempDirs.push(repoRoot);
    await createLargeRepoFixture(repoRoot, {
      files: 4,
      fanout: 1,
      symbolsPerFile: 1,
      language: 'typescript',
    });

    const engine = new CodexiaEngine({ repoRoot });
    await engine.analyzeRepository({ force: true });

    const stats = await engine.getGraphStats();
    expect(stats.graph).toMatchObject({ files: 4 });
    await expect(engine.executePseudoCypher('MATCH (f:File) RETURN f.path AS path')).resolves.toMatchObject({
      rows: expect.any(Array),
    });
    await expect(engine.executePseudoCypher('MATCH (f:File) DETACH DELETE f')).rejects.toThrow(/read-only/i);
  });
});
