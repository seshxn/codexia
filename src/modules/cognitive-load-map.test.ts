import { describe, expect, it } from 'vitest';
import type { FileInfo } from '../core/types.js';
import type { FileComplexity } from './complexity-engine.js';
import type { TemporalInsights, FileCoChange } from './temporal-analyzer.js';
import { CognitiveLoadAnalyzer } from './cognitive-load-map.js';

const buildFile = (relativePath: string, overrides: Partial<FileInfo> = {}): FileInfo => ({
  path: `/repo/${relativePath}`,
  relativePath,
  language: 'typescript',
  size: 200,
  lines: 40,
  symbols: [
    {
      name: 'runProcessor',
      kind: 'function',
      filePath: relativePath,
      line: 3,
      column: 1,
      exported: true,
      documentation: '',
      references: [],
    },
  ],
  imports: [],
  exports: [{ name: 'runProcessor', kind: 'function', isDefault: false, line: 3 }],
  ...overrides,
});

const buildComplexity = (path: string, overrides: Partial<FileComplexity> = {}): FileComplexity => ({
  path,
  score: {
    overall: 42,
    cyclomatic: 18,
    cognitive: 22,
    coupling: 45,
    cohesion: 0.42,
    abstractness: 0.12,
    instability: 0.52,
    maintainabilityIndex: 41,
  },
  symbols: [
    {
      name: 'runProcessor',
      kind: 'function',
      cyclomatic: 19,
      cognitive: 23,
      linesOfCode: 55,
      parameters: 5,
      dependencies: 6,
    },
  ],
  metrics: {
    linesOfCode: 80,
    logicalLines: 64,
    commentLines: 2,
    blankLines: 14,
    commentRatio: 0.03,
    avgFunctionLength: 35,
    maxFunctionLength: 55,
    maxNestingDepth: 6,
    parameterCount: 8,
    returnStatements: 6,
  },
  ...overrides,
});

const buildTemporal = (path: string, churnRate: number, ownershipRisk: number): TemporalInsights => ({
  path,
  stabilityScore: 42,
  churnRate,
  regressionProne: false,
  ownershipRisk,
  couplingTrend: 'increasing',
  hotspotScore: 70,
  ageInDays: 240,
  lastModified: new Date('2026-02-10T12:00:00Z'),
  contributors: [],
  changePatterns: [],
});

describe('CognitiveLoadAnalyzer', () => {
  it('computes cognitive load with 8+ dimensions and per-file/function/module scores', () => {
    const files = new Map<string, FileInfo>([
      [
        'src/payments/processor.ts',
        buildFile('src/payments/processor.ts', {
          imports: [
            { source: '../shared/logger', specifiers: ['logger'], isDefault: false, isNamespace: false, line: 1 },
            { source: '../infra/queue', specifiers: ['send'], isDefault: false, isNamespace: false, line: 2 },
            { source: 'stripe', specifiers: ['Stripe'], isDefault: false, isNamespace: false, line: 3 },
          ],
          symbols: [
            {
              name: 'runProcessor',
              kind: 'function',
              filePath: 'src/payments/processor.ts',
              line: 4,
              column: 1,
              exported: true,
              documentation: '',
              references: [],
            },
          ],
        }),
      ],
      [
        'src/infra/queue.ts',
        buildFile('src/infra/queue.ts', {
          imports: [{ source: 'bullmq', specifiers: ['Queue'], isDefault: false, isNamespace: false, line: 1 }],
          symbols: [
            {
              name: 'send',
              kind: 'function',
              filePath: 'src/infra/queue.ts',
              line: 2,
              column: 1,
              exported: true,
              documentation: 'Sends messages to queue',
              references: [],
            },
          ],
          exports: [{ name: 'send', kind: 'function', isDefault: false, line: 2 }],
        }),
      ],
    ]);

    const complexity = new Map<string, FileComplexity>([
      ['src/payments/processor.ts', buildComplexity('src/payments/processor.ts')],
      ['src/infra/queue.ts', buildComplexity('src/infra/queue.ts', {
        score: {
          overall: 78,
          cyclomatic: 7,
          cognitive: 8,
          coupling: 20,
          cohesion: 0.71,
          abstractness: 0.3,
          instability: 0.22,
          maintainabilityIndex: 76,
        },
        metrics: {
          linesOfCode: 32,
          logicalLines: 24,
          commentLines: 8,
          blankLines: 5,
          commentRatio: 0.25,
          avgFunctionLength: 12,
          maxFunctionLength: 16,
          maxNestingDepth: 2,
          parameterCount: 2,
          returnStatements: 2,
        },
      })],
    ]);

    const temporal = new Map<string, TemporalInsights>([
      ['src/payments/processor.ts', buildTemporal('src/payments/processor.ts', 0.65, 78)],
      ['src/infra/queue.ts', buildTemporal('src/infra/queue.ts', 0.09, 25)],
    ]);

    const coChangeClusters: FileCoChange[][] = [
      [
        { path: 'src/payments/processor.ts', coChangeCount: 0, coChangeRatio: 1 },
        { path: 'src/infra/queue.ts', coChangeCount: 45, coChangeRatio: 0.45 },
      ],
    ];

    const analyzer = new CognitiveLoadAnalyzer();
    const result = analyzer.analyze({
      files,
      complexity,
      temporal,
      namingViolationsByFile: new Map([
        ['src/payments/processor.ts', 2],
        ['src/infra/queue.ts', 0],
      ]),
      coChangeClusters,
      semanticDispersionByFile: new Map([
        ['src/payments/processor.ts', 0.66],
        ['src/infra/queue.ts', 0.15],
      ]),
      directDependencies: new Map([
        ['src/payments/processor.ts', new Set(['src/shared/logger.ts'])],
        ['src/infra/queue.ts', new Set()],
      ]),
    });

    expect(result.files).toHaveLength(2);
    expect(result.functions.length).toBeGreaterThan(0);
    expect(result.modules.length).toBeGreaterThan(0);

    const processor = result.files.find((item) => item.path === 'src/payments/processor.ts');
    expect(processor).toBeDefined();
    expect(Object.keys(processor!.dimensions)).toHaveLength(9);
    expect(processor!.contextSwitchCost).toBeGreaterThan(2);

    expect(result.documentationGaps.some((gap) => gap.path === 'src/payments/processor.ts')).toBe(true);

    const queueOnboarding = result.onboardingDifficulty.find((item) => item.path === 'src/infra/queue.ts');
    const processorOnboarding = result.onboardingDifficulty.find((item) => item.path === 'src/payments/processor.ts');
    expect(processorOnboarding!.difficultyScore).toBeGreaterThan(queueOnboarding!.difficultyScore);
  });

  it('reports implicit coupling only when files co-change without direct dependencies', () => {
    const files = new Map<string, FileInfo>([
      ['src/a.ts', buildFile('src/a.ts')],
      ['src/b.ts', buildFile('src/b.ts')],
      ['src/c.ts', buildFile('src/c.ts')],
    ]);

    const complexity = new Map<string, FileComplexity>([
      ['src/a.ts', buildComplexity('src/a.ts')],
      ['src/b.ts', buildComplexity('src/b.ts')],
      ['src/c.ts', buildComplexity('src/c.ts')],
    ]);

    const temporal = new Map<string, TemporalInsights>([
      ['src/a.ts', buildTemporal('src/a.ts', 0.1, 10)],
      ['src/b.ts', buildTemporal('src/b.ts', 0.1, 10)],
      ['src/c.ts', buildTemporal('src/c.ts', 0.1, 10)],
    ]);

    const analyzer = new CognitiveLoadAnalyzer();
    const result = analyzer.analyze({
      files,
      complexity,
      temporal,
      namingViolationsByFile: new Map(),
      semanticDispersionByFile: new Map(),
      coChangeClusters: [
        [
          { path: 'src/a.ts', coChangeCount: 0, coChangeRatio: 1 },
          { path: 'src/b.ts', coChangeCount: 51, coChangeRatio: 0.51 },
          { path: 'src/c.ts', coChangeCount: 61, coChangeRatio: 0.61 },
        ],
      ],
      directDependencies: new Map([
        ['src/a.ts', new Set(['src/b.ts'])],
        ['src/b.ts', new Set()],
        ['src/c.ts', new Set()],
      ]),
    });

    expect(result.implicitCoupling.some((pair) => pair.from === 'src/a.ts' && pair.to === 'src/b.ts')).toBe(false);
    expect(result.implicitCoupling.some((pair) => pair.from === 'src/a.ts' && pair.to === 'src/c.ts')).toBe(true);
  });
});
