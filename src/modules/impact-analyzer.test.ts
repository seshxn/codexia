import { describe, it, expect, beforeEach } from 'vitest';
import { ImpactAnalyzer } from './impact-analyzer.js';
import { DependencyGraph } from '../core/dependency-graph.js';
import type { GitDiff, FileInfo, ArchitectureMemory } from '../core/types.js';

describe('ImpactAnalyzer', () => {
  let depGraph: DependencyGraph;
  let analyzer: ImpactAnalyzer;

  beforeEach(() => {
    depGraph = new DependencyGraph(process.cwd());
    analyzer = new ImpactAnalyzer(depGraph);
  });

  it('should create an analyzer instance', () => {
    expect(analyzer).toBeDefined();
  });

  describe('boundary violation checking', () => {
    it('should detect violations when architecture memory is configured', () => {
      // Set up architecture memory
      const architecture: ArchitectureMemory = {
        layers: [
          {
            name: 'CLI',
            description: 'Command-line interface',
            paths: ['src/cli/**'],
            allowedDependencies: ['Core'],
          },
          {
            name: 'Core',
            description: 'Core domain logic',
            paths: ['src/core/**'],
            allowedDependencies: [],
          },
          {
            name: 'Modules',
            description: 'Feature modules',
            paths: ['src/modules/**'],
            allowedDependencies: ['Core'],
          },
        ],
        boundaries: [
          {
            from: 'Modules',
            to: 'CLI',
            allowed: false,
            reason: 'Modules should not depend on CLI',
          },
        ],
        entryPoints: [],
        criticalPaths: [],
      };

      analyzer.setArchitecture(architecture);

      // Create test diff and files
      // Use simpler paths that will match the pattern
      const diff: GitDiff = {
        base: 'HEAD',
        head: 'working tree',
        files: [
          {
            path: 'src/modules/test-module.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            hunks: [
              {
                oldStart: 1,
                oldLines: 5,
                newStart: 1,
                newLines: 10,
                content: 'test content',
              },
            ],
          },
        ],
        stats: {
          files: 1,
          additions: 10,
          deletions: 5,
        },
      };

      const files = new Map<string, FileInfo>([
        [
          'src/modules/test-module.ts',
          {
            path: 'src/modules/test-module.ts',
            relativePath: 'src/modules/test-module.ts',
            language: 'typescript',
            size: 100,
            lines: 10,
            symbols: [],
            imports: [
              {
                source: 'src/cli/formatter.ts',
                specifiers: ['Formatter'],
                isDefault: false,
                isNamespace: false,
                line: 1,
              },
            ],
            exports: [],
          },
        ],
      ]);

      const result = analyzer.analyze(diff, files, new Map());

      // Should detect boundary violation since Modules imports from CLI
      // which is not in allowedDependencies
      expect(result.boundaryViolations.length).toBeGreaterThan(0);
      expect(result.boundaryViolations[0].from).toBe('src/modules/test-module.ts');
      expect(result.boundaryViolations[0].to).toBe('src/cli/formatter.ts');
      expect(result.boundaryViolations[0].severity).toBe('error');
    });

    it('should not detect violations when imports are allowed', () => {
      const architecture: ArchitectureMemory = {
        layers: [
          {
            name: 'Modules',
            description: 'Feature modules',
            paths: ['src/modules/**'],
            allowedDependencies: ['Core'],
          },
          {
            name: 'Core',
            description: 'Core domain logic',
            paths: ['src/core/**'],
            allowedDependencies: [],
          },
        ],
        boundaries: [],
        entryPoints: [],
        criticalPaths: [],
      };

      analyzer.setArchitecture(architecture);

      const diff: GitDiff = {
        base: 'HEAD',
        head: 'working tree',
        files: [
          {
            path: 'src/modules/test.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            hunks: [],
          },
        ],
        stats: {
          files: 1,
          additions: 10,
          deletions: 5,
        },
      };

      const files = new Map<string, FileInfo>([
        [
          'src/modules/test.ts',
          {
            path: 'src/modules/test.ts',
            relativePath: 'src/modules/test.ts',
            language: 'typescript',
            size: 100,
            lines: 10,
            symbols: [],
            imports: [
              {
                source: 'src/core/types.ts',
                specifiers: ['Symbol'],
                isDefault: false,
                isNamespace: false,
                line: 1,
              },
            ],
            exports: [],
          },
        ],
        [
          'src/core/types.ts',
          {
            path: 'src/core/types.ts',
            relativePath: 'src/core/types.ts',
            language: 'typescript',
            size: 200,
            lines: 20,
            symbols: [],
            imports: [],
            exports: [],
          },
        ],
      ]);

      const result = analyzer.analyze(diff, files, new Map());

      // Should not detect violations for allowed dependencies
      expect(result.boundaryViolations.length).toBe(0);
    });

    it('should use fallback heuristic when no architecture memory', () => {
      // Don't set architecture memory
      const diff: GitDiff = {
        base: 'HEAD',
        head: 'working tree',
        files: [
          {
            path: 'src/cli/modules/test.ts', // Path that triggers heuristic
            status: 'modified',
            additions: 10,
            deletions: 5,
            hunks: [],
          },
        ],
        stats: {
          files: 1,
          additions: 10,
          deletions: 5,
        },
      };

      const files = new Map<string, FileInfo>();

      const result = analyzer.analyze(diff, files, new Map());

      // Should use fallback heuristic
      expect(result.boundaryViolations.length).toBeGreaterThan(0);
      expect(result.boundaryViolations[0].severity).toBe('warning');
    });

    it('should not use fallback when architecture memory exists', () => {
      const architecture: ArchitectureMemory = {
        layers: [],
        boundaries: [],
        entryPoints: [],
        criticalPaths: [],
      };

      analyzer.setArchitecture(architecture);

      const diff: GitDiff = {
        base: 'HEAD',
        head: 'working tree',
        files: [
          {
            path: 'src/cli/modules/test.ts', // Path that would trigger heuristic
            status: 'modified',
            additions: 10,
            deletions: 5,
            hunks: [],
          },
        ],
        stats: {
          files: 1,
          additions: 10,
          deletions: 5,
        },
      };

      const files = new Map<string, FileInfo>();

      const result = analyzer.analyze(diff, files, new Map());

      // Should not use fallback heuristic when architecture is set
      expect(result.boundaryViolations.length).toBe(0);
    });
  });

  describe('impact analysis', () => {
    it('should analyze direct changes', () => {
      const diff: GitDiff = {
        base: 'HEAD',
        head: 'working tree',
        files: [
          {
            path: 'src/test.ts',
            status: 'modified',
            additions: 5,
            deletions: 2,
            hunks: [
              {
                oldStart: 1,
                oldLines: 2,
                newStart: 1,
                newLines: 5,
                content: 'test',
              },
            ],
          },
        ],
        stats: {
          files: 1,
          additions: 5,
          deletions: 2,
        },
      };

      const files = new Map<string, FileInfo>([
        [
          'src/test.ts',
          {
            path: 'src/test.ts',
            relativePath: 'src/test.ts',
            language: 'typescript',
            size: 100,
            lines: 10,
            symbols: [
              {
                name: 'testFunction',
                kind: 'function',
                filePath: 'src/test.ts',
                line: 3,
                column: 1,
                exported: true,
                references: [],
              },
            ],
            imports: [],
            exports: [],
          },
        ],
      ]);

      const result = analyzer.analyze(diff, files, new Map());

      expect(result.directlyChanged).toBeDefined();
      expect(result.affectedModules).toBeDefined();
      expect(result.riskScore).toBeDefined();
      expect(result.publicApiChanges).toBeDefined();
      expect(result.boundaryViolations).toBeDefined();
    });
  });
});
