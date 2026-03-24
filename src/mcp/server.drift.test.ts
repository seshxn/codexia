import { describe, expect, it } from 'vitest';
import { CodexiaMCPServer } from './server.js';

describe('CodexiaMCPServer drift tool', () => {
  it('registers and executes codexia/drift', async () => {
    const server = new CodexiaMCPServer(process.cwd());
    const fakeDrift = {
      generatedAt: new Date().toISOString(),
      composite: { score: 42 },
      components: {
        boundary: { score: 40, weightedPoints: 4, violationCount: 2 },
        naming: { score: 10, weightedPoints: 1, violationCount: 1 },
        structural: { score: 55, weightedPoints: 8, violationCount: 3 },
        dependency: { score: 30, weightedPoints: 2, violationCount: 1 },
      },
      heatmap: { layers: [] },
      trajectory: {
        points: [],
        velocity: { delta: 0, slopePerCommit: 0, direction: 'stable' as const },
      },
      emergentConventions: [],
    };
    (server as any).engine = {
      initialize: async () => undefined,
      beginLearningSession: async () => undefined,
      recordToolActivity: async () => undefined,
      analyzeDrift: async () => fakeDrift,
    };
    (server as any).initialized = true;
    (server as any).sessionStarted = true;
    const tools = server.getTools();

    expect(tools.some((tool) => tool.name === 'codexia/drift')).toBe(true);

    const result = await server.executeTool('codexia/drift', { commits: 5 });
    const first = result.content[0];

    expect(first.type).toBe('json');
    expect((first.json as any).composite.score).toBe(42);
  });
});
