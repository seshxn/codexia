import { describe, expect, it, vi } from 'vitest';
import { CodexiaMCPServer } from './server.js';

describe('CodexiaMCPServer graph_lookup tool', () => {
  it('registers graph_lookup as a token-saving graph DB tool', () => {
    const server = new CodexiaMCPServer();
    const tool = server.getTools().find((item) => item.name === 'graph_lookup');

    expect(tool).toBeDefined();
    expect(tool?.description).toMatch(/graph DB/i);
    expect(tool?.description).toMatch(/avoid rediscovering/i);
  });

  it('dispatches graph_lookup to engine.graphLookup', async () => {
    const server = new CodexiaMCPServer();
    const mockLookup = {
      tokenStrategy: 'Use compact graph summary first.',
      matches: [],
    };
    const mockEngine = {
      initialize: vi.fn(async () => undefined),
      beginLearningSession: vi.fn(async () => undefined),
      graphLookup: vi.fn(async () => mockLookup),
      recordToolActivity: vi.fn(async () => undefined),
      finalizeLearningSession: vi.fn(async () => undefined),
    };

    (server as unknown as { engine: typeof mockEngine; initialized: boolean }).engine = mockEngine;
    (server as unknown as { initialized: boolean }).initialized = false;

    const result = await server.executeTool('graph_lookup', {
      query: 'auth middleware',
      file: 'src/auth.ts',
      depth: 2,
      limit: 5,
      includeHistory: true,
    });

    expect(mockEngine.graphLookup).toHaveBeenCalledWith({
      query: 'auth middleware',
      file: 'src/auth.ts',
      symbol: undefined,
      depth: 2,
      limit: 5,
      includeHistory: true,
    });
    expect(result.content[0].type).toBe('json');
    expect((result.content[0] as { json: typeof mockLookup }).json).toBe(mockLookup);
  });
});
