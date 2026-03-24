import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph } from '../core/dependency-graph.js';
import { SymbolMap } from '../core/symbol-map.js';
import { ImpactAnalyzer } from './impact-analyzer.js';
import { SmartTestPrioritizer } from './smart-test-prioritizer.js';
import { RefactorCartographer } from './refactor-cartographer.js';
import type { FileInfo } from '../core/types.js';
import type { FileCoChange } from './temporal-analyzer.js';
import type { FileComplexity } from './complexity-engine.js';

const createFile = (relativePath: string, overrides: Partial<FileInfo> = {}): FileInfo => ({
  path: relativePath,
  relativePath,
  language: 'typescript',
  size: 100,
  lines: 20,
  symbols: [],
  imports: [],
  exports: [],
  ...overrides,
});

describe('RefactorCartographer', () => {
  let depGraph: DependencyGraph;
  let symbolMap: SymbolMap;
  let impactAnalyzer: ImpactAnalyzer;
  let testPrioritizer: SmartTestPrioritizer;
  let files: Map<string, FileInfo>;
  let planner: RefactorCartographer;

  beforeEach(() => {
    depGraph = new DependencyGraph(process.cwd());
    symbolMap = new SymbolMap(process.cwd());
    impactAnalyzer = new ImpactAnalyzer(depGraph);
    testPrioritizer = new SmartTestPrioritizer();

    files = new Map<string, FileInfo>([
      [
        'src/a.ts',
        createFile('src/a.ts', {
          symbols: [
            {
              name: 'oldFn',
              kind: 'function',
              filePath: 'src/a.ts',
              line: 1,
              column: 1,
              exported: true,
              references: [],
            },
          ],
          exports: [
            {
              name: 'oldFn',
              kind: 'function',
              isDefault: false,
              line: 1,
            },
          ],
        }),
      ],
      [
        'src/index.ts',
        createFile('src/index.ts', {
          imports: [
            {
              source: './a.js',
              specifiers: ['oldFn'],
              isDefault: false,
              isNamespace: false,
              line: 1,
            },
          ],
          exports: [
            {
              name: 'oldFn',
              kind: 'variable',
              isDefault: false,
              line: 1,
            },
          ],
        }),
      ],
      [
        'src/consumer.ts',
        createFile('src/consumer.ts', {
          imports: [
            {
              source: './index.js',
              specifiers: ['oldFn'],
              isDefault: false,
              isNamespace: false,
              line: 1,
            },
          ],
        }),
      ],
      ['src/a.test.ts', createFile('src/a.test.ts')],
      ['src/consumer.test.ts', createFile('src/consumer.test.ts')],
      ['src/feature.ts', createFile('src/feature.ts')],
      ['src/feature-utils.ts', createFile('src/feature-utils.ts')],
    ]);

    depGraph.buildFromImports(files);
    symbolMap.buildFromFiles(files);

    planner = new RefactorCartographer(depGraph, symbolMap, impactAnalyzer, testPrioritizer);
  });

  it('builds rename propagation and sequenced test-gated steps in simulation mode', () => {
    const result = planner.plan(
      {
        type: 'rename-symbol',
        targetSymbol: 'oldFn',
        newSymbolName: 'newFn',
        file: 'src/a.ts',
      },
      {
        files,
        fileContents: new Map([
          ['src/index.ts', "export { oldFn } from './a.js';\n"],
          ['src/consumer.ts', "import { oldFn } from './index.js';\n"],
        ]),
      }
    );

    expect(result.mode).toBe('simulate');
    expect(result.blastRadius.rootFiles).toEqual(['src/a.ts']);
    expect(result.blastRadius.downstreamFiles).toContain('src/index.ts');
    expect(result.blastRadius.downstreamFiles).toContain('src/consumer.ts');
    expect(result.renamePropagation).not.toBeNull();
    expect(result.renamePropagation?.reexports.map((entry) => entry.file)).toContain('src/index.ts');
    expect(result.steps.length).toBeGreaterThan(1);
    expect(result.steps[0].testGate.tests.length).toBeGreaterThan(0);
  });

  it('recommends extraction when cohesion is low and co-change clustering exists', () => {
    const complexity = new Map<string, FileComplexity>([
      [
        'src/feature.ts',
        {
          path: 'src/feature.ts',
          score: {
            overall: 34,
            cyclomatic: 20,
            cognitive: 25,
            coupling: 40,
            cohesion: 0.24,
            abstractness: 0.1,
            instability: 0.8,
            maintainabilityIndex: 32,
          },
          symbols: [],
          metrics: {
            linesOfCode: 220,
            logicalLines: 170,
            commentLines: 12,
            blankLines: 18,
            commentRatio: 0.05,
            avgFunctionLength: 40,
            maxFunctionLength: 90,
            maxNestingDepth: 7,
            parameterCount: 21,
            returnStatements: 10,
          },
        },
      ],
    ]);

    const coChangeClusters: FileCoChange[][] = [[
      { path: 'src/feature.ts', coChangeCount: 0, coChangeRatio: 1 },
      { path: 'src/feature-utils.ts', coChangeCount: 38, coChangeRatio: 0.71 },
    ]];

    const result = planner.plan(
      {
        type: 'extract-module',
        file: 'src/feature.ts',
      },
      {
        files,
        complexity,
        coChangeClusters,
      }
    );

    expect(result.moduleExtractionAdvice.targetFile).toBe('src/feature.ts');
    expect(result.moduleExtractionAdvice.recommendation).toBe('extract-recommended');
    expect(result.moduleExtractionAdvice.coChangePartners).toContain('src/feature-utils.ts');
    expect(result.moduleExtractionAdvice.proposedModules.length).toBeGreaterThan(0);
  });
});
