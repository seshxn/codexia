import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DocsIndex } from './docs-index.js';

describe('DocsIndex', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('resolves markdown sections by heading slug', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-docs-'));
    tempDirs.push(repoRoot);

    await fs.mkdir(path.join(repoRoot, 'docs'), { recursive: true });
    await fs.writeFile(path.join(repoRoot, 'README.md'), '# Root\n', 'utf-8');
    await fs.writeFile(
      path.join(repoRoot, 'docs', 'USAGE.md'),
      [
        '# Usage',
        '',
        '## Review Context',
        '',
        'Focused review context for changed files.',
        '',
        '## Semantic Search',
        '',
        'Hybrid lexical and semantic search.',
      ].join('\n'),
      'utf-8'
    );

    const docs = new DocsIndex(repoRoot);
    const result = await docs.getSection('review-context');

    expect(result.source).toBe('docs/USAGE.md');
    expect(result.heading).toBe('Review Context');
    expect(result.content).toContain('Focused review context');
  });
});
