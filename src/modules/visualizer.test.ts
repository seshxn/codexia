import { describe, expect, it } from 'vitest';
import { Visualizer } from './visualizer.js';

describe('Visualizer', () => {
  it('generates self-contained HTML graph output', () => {
    const visualizer = new Visualizer();
    const html = visualizer.visualize({
      nodes: [
        { path: 'src/a.ts', imports: ['src/b.ts'], importedBy: [], depth: 0 },
        { path: 'src/b.ts', imports: [], importedBy: ['src/a.ts'], depth: 1 },
      ],
      edges: [
        { from: 'src/a.ts', to: 'src/b.ts', kind: 'static' },
      ],
      rootNodes: ['src/a.ts'],
      leafNodes: ['src/b.ts'],
    }, {
      format: 'html',
    });

    expect(html).toContain('<svg');
    expect(html).toContain('Interactive dependency graph');
    expect(html).toContain('src/a.ts');
  });
});
