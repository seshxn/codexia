import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph } from './dependency-graph.js';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph('/test/repo');
  });

  describe('buildFromImports', () => {
    it('should build graph from file imports', () => {
      const files = new Map([
        ['src/a.ts', { imports: [{ source: './b.js' }] }],
        ['src/b.ts', { imports: [{ source: './c.js' }] }],
        ['src/c.ts', { imports: [] }],
      ]);

      graph.buildFromImports(files);

      expect(graph.getDependencies('src/a.ts')).toContain('src/b.ts');
      expect(graph.getDependencies('src/b.ts')).toContain('src/c.ts');
      expect(graph.getDependents('src/b.ts')).toContain('src/a.ts');
    });

    it('should ignore external imports', () => {
      const files = new Map([
        ['src/a.ts', { imports: [{ source: 'lodash' }, { source: './b.js' }] }],
        ['src/b.ts', { imports: [] }],
      ]);

      graph.buildFromImports(files);

      expect(graph.getDependencies('src/a.ts')).toHaveLength(1);
      expect(graph.getDependencies('src/a.ts')).toContain('src/b.ts');
    });
  });

  describe('getTransitiveDependents', () => {
    it('should find all transitive dependents', () => {
      const files = new Map([
        ['src/a.ts', { imports: [{ source: './b.js' }] }],
        ['src/b.ts', { imports: [{ source: './c.js' }] }],
        ['src/c.ts', { imports: [] }],
      ]);

      graph.buildFromImports(files);

      const dependents = graph.getTransitiveDependents('src/c.ts');
      expect(dependents).toContain('src/b.ts');
      expect(dependents).toContain('src/a.ts');
    });

    it('should respect max depth', () => {
      const files = new Map([
        ['src/a.ts', { imports: [{ source: './b.js' }] }],
        ['src/b.ts', { imports: [{ source: './c.js' }] }],
        ['src/c.ts', { imports: [{ source: './d.js' }] }],
        ['src/d.ts', { imports: [] }],
      ]);

      graph.buildFromImports(files);

      const dependents = graph.getTransitiveDependents('src/d.ts', 1);
      expect(dependents).toContain('src/c.ts');
      expect(dependents).not.toContain('src/a.ts');
    });
  });

  describe('detectCycles', () => {
    it('should detect circular dependencies', () => {
      const files = new Map([
        ['src/a.ts', { imports: [{ source: './b.js' }] }],
        ['src/b.ts', { imports: [{ source: './a.js' }] }],
      ]);

      graph.buildFromImports(files);

      const cycles = graph.detectCycles();
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should return empty array when no cycles', () => {
      const files = new Map([
        ['src/a.ts', { imports: [{ source: './b.js' }] }],
        ['src/b.ts', { imports: [] }],
      ]);

      graph.buildFromImports(files);

      const cycles = graph.detectCycles();
      expect(cycles).toHaveLength(0);
    });
  });

  describe('getImportCount', () => {
    it('should return number of files importing a module', () => {
      const files = new Map([
        ['src/a.ts', { imports: [{ source: './common.js' }] }],
        ['src/b.ts', { imports: [{ source: './common.js' }] }],
        ['src/common.ts', { imports: [] }],
      ]);

      graph.buildFromImports(files);

      expect(graph.getImportCount('SomeSymbol', 'src/common.ts')).toBe(2);
    });

    it('should return 0 for files with no importers', () => {
      const files = new Map([
        ['src/a.ts', { imports: [] }],
      ]);

      graph.buildFromImports(files);

      expect(graph.getImportCount('SomeSymbol', 'src/a.ts')).toBe(0);
    });
  });

  describe('toObject', () => {
    it('should serialize graph to object', () => {
      const files = new Map([
        ['src/a.ts', { imports: [{ source: './b.js' }] }],
        ['src/b.ts', { imports: [] }],
      ]);

      graph.buildFromImports(files);

      const obj = graph.toObject();
      expect(obj.nodes).toHaveLength(2);
      expect(obj.edges).toHaveLength(1);
    });
  });
});
