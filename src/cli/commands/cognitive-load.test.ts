import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCognitiveLoadCommand } from './cognitive-load.js';

describe('runCognitiveLoadCommand', () => {
  const logSpy = vi.fn();
  const errorSpy = vi.fn();
  const getCognitiveLoadMap = vi.fn();

  beforeEach(() => {
    getCognitiveLoadMap.mockReset();
    logSpy.mockReset();
    errorSpy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a cognitive load summary and forwards the selected scope', async () => {
    getCognitiveLoadMap.mockResolvedValue({
      generatedAt: '2026-04-03T10:00:00.000Z',
      files: [
        {
          path: 'src/payments/processor.ts',
          module: 'src',
          score: 74.3,
          contextSwitchCost: 5,
          dimensions: {
            cyclomaticLoad: 80,
            cognitiveComplexityLoad: 71,
            namingInconsistencyLoad: 12,
            abstractionDepthLoad: 32,
            implicitCouplingLoad: 49,
            documentationDebtLoad: 54,
            contextSwitchLoad: 63,
            mentalModelSwitchLoad: 21,
            churnLoad: 44,
          },
          documentationScore: 41,
          complexityScore: 77,
          modificationFrequency: 9,
          onboardingWeight: 62,
          functions: [],
        },
      ],
      functions: [],
      modules: [{ module: 'src', score: 65, fileCount: 1, avgContextSwitchCost: 5, onboardingDifficulty: 61, topRiskFiles: ['src/payments/processor.ts'] }],
      implicitCoupling: [],
      documentationGaps: [],
      onboardingDifficulty: [],
      summary: {
        filesAnalyzed: 1,
        modulesAnalyzed: 1,
        averageScore: 74.3,
        highLoadFiles: 1,
        topFiles: ['src/payments/processor.ts'],
        topModules: ['src'],
      },
    });

    await runCognitiveLoadCommand(
      { path: 'payments', limit: '5' },
      { json: false },
      { createEngine: () => ({ getCognitiveLoadMap }), output: { log: logSpy, error: errorSpy } }
    );

    expect(getCognitiveLoadMap).toHaveBeenCalledWith({ path: 'payments', limit: 5, maxTemporalFiles: undefined });
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Cognitive Load Map');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Files analyzed: 1');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Average score: 74.3');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('src/payments/processor.ts');
  });

  it('emits json when requested', async () => {
    getCognitiveLoadMap.mockResolvedValue({
      generatedAt: '2026-04-03T10:00:00.000Z',
      files: [],
      functions: [],
      modules: [],
      implicitCoupling: [],
      documentationGaps: [],
      onboardingDifficulty: [],
      summary: {
        filesAnalyzed: 0,
        modulesAnalyzed: 0,
        averageScore: 0,
        highLoadFiles: 0,
        topFiles: [],
        topModules: [],
      },
    });

    await runCognitiveLoadCommand({}, { json: true }, { createEngine: () => ({ getCognitiveLoadMap }), output: { log: logSpy, error: errorSpy } });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      summary: { averageScore: 0 },
    });
  });
});
