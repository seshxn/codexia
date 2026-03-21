import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileInfo } from '../../core/types.js';
import { buildKnowledgeGraphData } from './knowledge-graph.js';

describe('buildKnowledgeGraphData', () => {
  it('builds richer hierarchy, dependency, community, and process edges', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-graph-'));

    try {
      await fs.mkdir(path.join(repoRoot, 'src/lib'), { recursive: true });

      await fs.writeFile(
        path.join(repoRoot, 'src/lib/math.ts'),
        ['export function sum(a: number, b: number) {', '  return a + b;', '}', ''].join('\n'),
        'utf-8'
      );
      await fs.writeFile(
        path.join(repoRoot, 'src/lib/util.ts'),
        ['export function logResult(value: number) {', '  return value;', '}', ''].join('\n'),
        'utf-8'
      );
      await fs.writeFile(
        path.join(repoRoot, 'src/app.ts'),
        [
          "import { sum } from './lib/math';",
          "import { logResult } from './lib/util';",
          'export function run() {',
          '  return logResult(sum(1, 2));',
          '}',
          '',
        ].join('\n'),
        'utf-8'
      );

      const files = new Map<string, FileInfo>([
        [
          'src/lib/math.ts',
          {
            path: path.join(repoRoot, 'src/lib/math.ts'),
            relativePath: 'src/lib/math.ts',
            language: 'typescript',
            size: 120,
            lines: 4,
            symbols: [
              {
                name: 'sum',
                kind: 'function',
                filePath: 'src/lib/math.ts',
                line: 1,
                column: 0,
                exported: true,
                references: [],
              },
            ],
            imports: [],
            exports: [
              {
                name: 'sum',
                kind: 'function',
                isDefault: false,
                line: 1,
              },
            ],
          },
        ],
        [
          'src/lib/util.ts',
          {
            path: path.join(repoRoot, 'src/lib/util.ts'),
            relativePath: 'src/lib/util.ts',
            language: 'typescript',
            size: 120,
            lines: 4,
            symbols: [
              {
                name: 'logResult',
                kind: 'function',
                filePath: 'src/lib/util.ts',
                line: 1,
                column: 0,
                exported: true,
                references: [],
              },
            ],
            imports: [],
            exports: [
              {
                name: 'logResult',
                kind: 'function',
                isDefault: false,
                line: 1,
              },
            ],
          },
        ],
        [
          'src/app.ts',
          {
            path: path.join(repoRoot, 'src/app.ts'),
            relativePath: 'src/app.ts',
            language: 'typescript',
            size: 180,
            lines: 6,
            symbols: [
              {
                name: 'run',
                kind: 'function',
                filePath: 'src/app.ts',
                line: 3,
                column: 0,
                exported: true,
                references: [],
              },
            ],
            imports: [
              {
                source: './lib/math',
                specifiers: ['sum'],
                isDefault: false,
                isNamespace: false,
                line: 1,
              },
              {
                source: './lib/util',
                specifiers: ['logResult'],
                isDefault: false,
                isNamespace: false,
                line: 2,
              },
            ],
            exports: [
              {
                name: 'run',
                kind: 'function',
                isDefault: false,
                line: 3,
              },
            ],
          },
        ],
      ]);

      const graph = await buildKnowledgeGraphData(repoRoot, files, [
        {
          from: 'src/app.ts',
          to: 'src/lib/math.ts',
          kind: 'static',
        },
        {
          from: 'src/app.ts',
          to: 'src/lib/util.ts',
          kind: 'static',
        },
      ]);

      expect(graph.nodes.some((node) => node.kind === 'repo')).toBe(true);
      expect(graph.nodes.some((node) => node.kind === 'directory' && node.path === 'src/lib')).toBe(true);
      expect(graph.nodes.some((node) => node.kind === 'file' && node.path === 'src/app.ts')).toBe(true);
      expect(graph.nodes.some((node) => node.kind === 'function' && node.label === 'sum')).toBe(true);
      expect(graph.nodes.some((node) => node.kind === 'community')).toBe(true);
      expect(graph.nodes.some((node) => node.kind === 'process')).toBe(true);

      expect(
        graph.edges.some((edge) => edge.kind === 'defines' && edge.source === 'file:src/app.ts' && edge.target.includes(':run:3:0'))
      ).toBe(true);

      expect(
        graph.edges.some((edge) => edge.kind === 'imports' && edge.source === 'file:src/app.ts' && edge.target === 'file:src/lib/math.ts')
      ).toBe(true);

      expect(
        graph.edges.some((edge) => edge.kind === 'uses' && edge.source === 'file:src/app.ts' && edge.target.includes(':sum:1:0'))
      ).toBe(true);

      expect(
        graph.edges.some((edge) => edge.kind === 'calls' && edge.source.includes(':run:3:0') && edge.target.includes(':sum:1:0'))
      ).toBe(true);

      expect(graph.edges.some((edge) => edge.kind === 'member_of')).toBe(true);
      expect(graph.edges.some((edge) => edge.kind === 'step_in_process')).toBe(true);
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });
});
