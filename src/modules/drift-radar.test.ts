import { describe, expect, it } from 'vitest';
import type { ArchitectureMemory, FileInfo, DependencyNode, CommitRecord } from '../core/types.js';
import { DriftRadar, type DriftSignal } from './drift-radar.js';

const buildFile = (relativePath: string, lines = 120): FileInfo => ({
  path: relativePath,
  relativePath,
  language: 'typescript',
  size: lines * 20,
  lines,
  symbols: [],
  imports: [],
  exports: [],
});

describe('DriftRadar', () => {
  it('computes a composite score with component decomposition', () => {
    const files = new Map<string, FileInfo>([
      ['src/core/engine.ts', buildFile('src/core/engine.ts', 620)],
      ['src/cli/cmd.ts', buildFile('src/cli/cmd.ts', 140)],
      ['src/modules/worker.ts', buildFile('src/modules/worker.ts', 140)],
    ]);

    const architecture: ArchitectureMemory = {
      layers: [
        { name: 'Core', description: 'core layer', paths: ['src/core/**'], allowedDependencies: [] },
        { name: 'Modules', description: 'module layer', paths: ['src/modules/**'], allowedDependencies: ['Core'] },
        { name: 'CLI', description: 'cli layer', paths: ['src/cli/**'], allowedDependencies: ['Modules'] },
      ],
      boundaries: [
        { from: 'CLI', to: 'Core', allowed: false, reason: 'CLI should not access Core directly' },
      ],
      entryPoints: [],
      criticalPaths: [],
    };

    const dependencyNodes = new Map<string, DependencyNode>([
      ['src/core/engine.ts', { path: 'src/core/engine.ts', imports: [], importedBy: ['src/modules/worker.ts', 'src/cli/cmd.ts'], depth: 0 }],
      ['src/modules/worker.ts', { path: 'src/modules/worker.ts', imports: ['src/core/engine.ts'], importedBy: ['src/cli/cmd.ts'], depth: 1 }],
      ['src/cli/cmd.ts', { path: 'src/cli/cmd.ts', imports: ['src/core/engine.ts', 'src/modules/worker.ts'], importedBy: [], depth: 2 }],
    ]);

    const signals: DriftSignal[] = [
      {
        category: 'boundary',
        severity: 'high',
        filePath: 'src/cli/cmd.ts',
        source: 'invariant',
        message: 'CLI imports Core directly',
      },
      {
        category: 'naming',
        severity: 'medium',
        filePath: 'src/modules/worker.ts',
        source: 'convention',
        message: 'Function naming mismatch',
      },
      {
        category: 'structural',
        severity: 'high',
        filePath: 'src/core/engine.ts',
        source: 'convention',
        message: 'File exceeds max lines',
      },
      {
        category: 'dependency',
        severity: 'medium',
        filePath: 'src/cli/cmd.ts',
        source: 'dependency',
        message: 'High fan-out dependency edge',
      },
    ];

    const drift = new DriftRadar();
    const report = drift.analyze({
      files,
      architecture,
      dependencyNodes,
      signals,
      recentCommits: [],
      commitsWindow: 10,
    });

    expect(report.composite.score).toBeGreaterThan(0);
    expect(report.components.boundary.score).toBeGreaterThan(0);
    expect(report.components.naming.score).toBeGreaterThan(0);
    expect(report.components.structural.score).toBeGreaterThan(0);
    expect(report.components.dependency.score).toBeGreaterThan(0);
    expect(report.composite.score).toBeLessThanOrEqual(100);
  });

  it('derives diverging velocity when recent commits touch riskier files', () => {
    const files = new Map<string, FileInfo>([
      ['src/core/safe.ts', buildFile('src/core/safe.ts')],
      ['src/core/risky.ts', buildFile('src/core/risky.ts')],
    ]);

    const dependencyNodes = new Map<string, DependencyNode>([
      ['src/core/safe.ts', { path: 'src/core/safe.ts', imports: [], importedBy: [], depth: 0 }],
      ['src/core/risky.ts', { path: 'src/core/risky.ts', imports: [], importedBy: [], depth: 0 }],
    ]);

    const architecture: ArchitectureMemory = {
      layers: [{ name: 'Core', description: 'core', paths: ['src/core/**'], allowedDependencies: [] }],
      boundaries: [],
      entryPoints: [],
      criticalPaths: [],
    };

    const signals: DriftSignal[] = [
      {
        category: 'structural',
        severity: 'critical',
        filePath: 'src/core/risky.ts',
        source: 'convention',
        message: 'Critical structural drift',
      },
    ];

    const recentCommits: CommitRecord[] = [
      {
        hash: 'a1',
        message: 'older commit',
        author: 'alice',
        date: new Date('2026-02-01T10:00:00Z'),
        files: ['src/core/safe.ts'],
        isMerge: false,
        isRevert: false,
        changes: [
          {
            path: 'src/core/safe.ts',
            additions: 2,
            deletions: 1,
            hunks: [],
          },
        ],
      },
      {
        hash: 'b2',
        message: 'newer commit',
        author: 'bob',
        date: new Date('2026-02-02T10:00:00Z'),
        files: ['src/core/risky.ts'],
        isMerge: false,
        isRevert: false,
        changes: [
          {
            path: 'src/core/risky.ts',
            additions: 10,
            deletions: 1,
            hunks: [],
          },
        ],
      },
    ];

    const drift = new DriftRadar();
    const report = drift.analyze({
      files,
      architecture,
      dependencyNodes,
      signals,
      recentCommits,
      commitsWindow: 10,
    });

    expect(report.trajectory.points).toHaveLength(2);
    expect(report.trajectory.velocity.direction).toBe('diverging');
    expect(report.trajectory.velocity.delta).toBeGreaterThan(0);
  });

  it('builds a layer heatmap and surfaces emergent naming conventions', () => {
    const files = new Map<string, FileInfo>([
      ['src/modules/payment-handler.ts', buildFile('src/modules/payment-handler.ts')],
      ['src/modules/refund-handler.ts', buildFile('src/modules/refund-handler.ts')],
      ['src/modules/invoice-handler.ts', buildFile('src/modules/invoice-handler.ts')],
      ['src/cli/index.ts', buildFile('src/cli/index.ts')],
    ]);

    const dependencyNodes = new Map<string, DependencyNode>([
      ['src/modules/payment-handler.ts', { path: 'src/modules/payment-handler.ts', imports: [], importedBy: [], depth: 0 }],
      ['src/modules/refund-handler.ts', { path: 'src/modules/refund-handler.ts', imports: [], importedBy: [], depth: 0 }],
      ['src/modules/invoice-handler.ts', { path: 'src/modules/invoice-handler.ts', imports: [], importedBy: [], depth: 0 }],
      ['src/cli/index.ts', { path: 'src/cli/index.ts', imports: [], importedBy: [], depth: 0 }],
    ]);

    const architecture: ArchitectureMemory = {
      layers: [
        { name: 'Modules', description: 'modules', paths: ['src/modules/**'], allowedDependencies: [] },
        { name: 'CLI', description: 'cli', paths: ['src/cli/**'], allowedDependencies: ['Modules'] },
      ],
      boundaries: [],
      entryPoints: [],
      criticalPaths: [],
    };

    const drift = new DriftRadar();
    const report = drift.analyze({
      files,
      architecture,
      dependencyNodes,
      signals: [],
      recentCommits: [],
      commitsWindow: 10,
      declaredNamingConventions: [],
    });

    expect(report.heatmap.layers.some((layer) => layer.layer === 'Modules')).toBe(true);
    expect(report.emergentConventions.some((candidate) => candidate.target === 'Files')).toBe(true);
    expect(report.emergentConventions.some((candidate) => candidate.pattern.includes('kebab'))).toBe(true);
  });
});
