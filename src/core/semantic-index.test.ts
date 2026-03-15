import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SemanticIndex } from './semantic-index.js';
import type { FileInfo } from './types.js';

describe('SemanticIndex', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('builds a local semantic index and returns hybrid search results', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-semantic-'));
    tempDirs.push(repoRoot);

    await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, 'src', 'auth.ts'),
      [
        'export function authenticateUser(token: string) {',
        '  return token.startsWith("tok_");',
        '}',
      ].join('\n'),
      'utf-8'
    );

    const files = new Map<string, FileInfo>([
      [
        'src/auth.ts',
        {
          path: 'src/auth.ts',
          relativePath: 'src/auth.ts',
          language: 'typescript',
          size: 120,
          lines: 3,
          imports: [],
          exports: [{ name: 'authenticateUser', kind: 'function', isDefault: false, line: 1 }],
          symbols: [{
            name: 'authenticateUser',
            kind: 'function',
            filePath: 'src/auth.ts',
            line: 1,
            endLine: 3,
            column: 1,
            exported: true,
            references: [],
          }],
        },
      ],
    ]);

    const index = new SemanticIndex(repoRoot);
    const stats = await index.build(files);
    const results = await index.search('validate auth token', 5);

    expect(stats.documents).toBeGreaterThan(0);
    expect(stats.vocabulary).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.path).toBe('src/auth.ts');
  });
});
