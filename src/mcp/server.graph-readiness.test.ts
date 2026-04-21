import { describe, expect, it, vi } from 'vitest';
import { CodexiaMCPServer } from './server.js';

describe('CodexiaMCPServer graph readiness', () => {
  it('returns MCP readiness details from graph_stats', async () => {
    const server = new CodexiaMCPServer();
    const mockStats = {
      repo: { analyzed: true, stale: false },
      index: { files: 1, symbols: 1, exports: 1, avgFanOut: 0 },
      graph: { files: 1, functions: 1 },
      semantic: { documents: 1, vocabulary: 1, generatedAt: '2026-04-21T00:00:00.000Z' },
      mcp: { ready: true, reasons: [], transports: ['stdio', 'http'] },
      sessionsRecorded: 0,
    };
    const mockEngine = {
      initialize: vi.fn(async () => undefined),
      beginLearningSession: vi.fn(async () => undefined),
      getGraphStats: vi.fn(async () => mockStats),
      recordToolActivity: vi.fn(async () => undefined),
      finalizeLearningSession: vi.fn(async () => undefined),
    };

    (server as unknown as { engine: typeof mockEngine; initialized: boolean }).engine = mockEngine;
    (server as unknown as { initialized: boolean }).initialized = false;

    const result = await server.executeTool('graph_stats', {});

    expect(mockEngine.getGraphStats).toHaveBeenCalled();
    expect(result.content[0].type).toBe('json');
    expect((result.content[0] as { json: typeof mockStats }).json.mcp).toMatchObject({
      ready: true,
      transports: ['stdio', 'http'],
    });
  });

  it('builds the persisted graph when codexia/scan is called', async () => {
    const server = new CodexiaMCPServer();
    const mockEngine = {
      initialize: vi.fn(async () => undefined),
      beginLearningSession: vi.fn(async () => undefined),
      analyzeRepository: vi.fn(async () => ({
        success: true,
        duration: 12,
        stats: { files: 1, symbols: 1, exports: 1, avgFanOut: 0 },
        hasMemory: false,
      })),
      recordToolActivity: vi.fn(async () => undefined),
      finalizeLearningSession: vi.fn(async () => undefined),
    };

    (server as unknown as { engine: typeof mockEngine; initialized: boolean }).engine = mockEngine;
    (server as unknown as { initialized: boolean }).initialized = false;

    const result = await server.executeTool('codexia/scan', { force: true });

    expect(mockEngine.analyzeRepository).toHaveBeenCalledWith({ force: true });
    expect(result.content[0].type).toBe('json');
    expect((result.content[0] as { json: { status: string } }).json.status).toBe('success');
  });
});
