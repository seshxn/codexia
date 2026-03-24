import { describe, expect, it } from 'vitest';
import { CodexiaEngine } from './engine.js';

describe('CodexiaEngine.analyzeDrift', () => {
  it('returns drift analysis with composite score, trajectory, and heatmap', async () => {
    const engine = new CodexiaEngine({ repoRoot: process.cwd() });

    const report = await (engine as unknown as {
      analyzeDrift: (options?: { commits?: number }) => Promise<any>;
    }).analyzeDrift({ commits: 8 });

    expect(report).toBeDefined();
    expect(report.composite.score).toBeGreaterThanOrEqual(0);
    expect(report.composite.score).toBeLessThanOrEqual(100);
    expect(report.components).toBeDefined();
    expect(report.trajectory).toBeDefined();
    expect(report.heatmap).toBeDefined();
  });
});
