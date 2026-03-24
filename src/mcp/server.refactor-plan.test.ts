import { describe, it, expect, vi } from 'vitest';
import { CodexiaMCPServer } from './server.js';

describe('CodexiaMCPServer refactor-plan tool', () => {
  it('registers codexia/refactor-plan in tool list', () => {
    const server = new CodexiaMCPServer();
    const names = server.getTools().map((tool) => tool.name);
    expect(names).toContain('codexia/refactor-plan');
  });

  it('dispatches codexia/refactor-plan to engine.planRefactor', async () => {
    const server = new CodexiaMCPServer();
    const mockPlan = {
      mode: 'simulate',
      whatIf: { operation: 'rename-symbol' },
      steps: [],
    };

    const mockEngine = {
      initialize: vi.fn(async () => undefined),
      beginLearningSession: vi.fn(async () => undefined),
      planRefactor: vi.fn(async () => mockPlan),
      recordToolActivity: vi.fn(async () => undefined),
      finalizeLearningSession: vi.fn(async () => undefined),
    };

    (server as unknown as { engine: typeof mockEngine; initialized: boolean }).engine = mockEngine;
    (server as unknown as { initialized: boolean }).initialized = false;

    const result = await server.executeTool('codexia/refactor-plan', {
      type: 'rename-symbol',
      targetSymbol: 'oldFn',
      newSymbolName: 'newFn',
      file: 'src/a.ts',
      depth: 4,
      staged: true,
    });

    expect(mockEngine.planRefactor).toHaveBeenCalledWith({
      type: 'rename-symbol',
      targetSymbol: 'oldFn',
      newSymbolName: 'newFn',
      file: 'src/a.ts',
      depth: 4,
      staged: true,
    });
    expect(result.content[0].type).toBe('json');
    expect((result.content[0] as { json: { mode: string } }).json.mode).toBe('simulate');
  });
});
