import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDriftCommand } from './drift.js';

describe('runDriftCommand', () => {
  const logSpy = vi.fn();
  const errorSpy = vi.fn();
  const analyzeDrift = vi.fn();

  beforeEach(() => {
    analyzeDrift.mockReset();
    logSpy.mockReset();
    errorSpy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a drift summary and forwards the commit window', async () => {
    analyzeDrift.mockResolvedValue({
      generatedAt: '2026-04-03T10:00:00.000Z',
      composite: { score: 73 },
      components: {
        boundary: { score: 44, weightedPoints: 14, violationCount: 4 },
        naming: { score: 21, weightedPoints: 8, violationCount: 3 },
        structural: { score: 52, weightedPoints: 12, violationCount: 5 },
        dependency: { score: 38, weightedPoints: 10, violationCount: 2 },
      },
      heatmap: { layers: [{ layer: 'CLI', score: 55, files: 3, violations: 2 }] },
      trajectory: {
        points: [{ commit: 'abc123', date: '2026-04-03', message: 'Refactor', score: 68 }],
        velocity: { delta: 9, slopePerCommit: 3, direction: 'diverging' },
      },
      emergentConventions: [{ target: 'Files', pattern: 'src/*-handler.ts', confidence: 0.81, evidenceCount: 4 }],
    });

    await runDriftCommand(
      { commits: '12' },
      { json: false },
      { createEngine: () => ({ analyzeDrift }), output: { log: logSpy, error: errorSpy } }
    );

    expect(analyzeDrift).toHaveBeenCalledWith({ commits: 12 });
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Drift Radar');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Composite score: 73');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Trajectory direction: diverging');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('CLI');
  });

  it('emits json when requested', async () => {
    analyzeDrift.mockResolvedValue({
      generatedAt: '2026-04-03T10:00:00.000Z',
      composite: { score: 21 },
      components: {
        boundary: { score: 1, weightedPoints: 1, violationCount: 1 },
        naming: { score: 2, weightedPoints: 2, violationCount: 1 },
        structural: { score: 3, weightedPoints: 3, violationCount: 1 },
        dependency: { score: 4, weightedPoints: 4, violationCount: 1 },
      },
      heatmap: { layers: [] },
      trajectory: { points: [], velocity: { delta: 0, slopePerCommit: 0, direction: 'stable' } },
      emergentConventions: [],
    });

    await runDriftCommand({}, { json: true }, { createEngine: () => ({ analyzeDrift }), output: { log: logSpy, error: errorSpy } });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      composite: { score: 21 },
      trajectory: { velocity: { direction: 'stable' } },
    });
  });
});
