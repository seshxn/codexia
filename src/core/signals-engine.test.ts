import { describe, it, expect } from 'vitest';
import { SignalsEngine } from './signals-engine.js';
import type { Symbol, FileHistory } from './types.js';

describe('SignalsEngine', () => {
  const engine = new SignalsEngine();

  describe('detectHighChurn', () => {
    it('should detect high churn files', () => {
      const history: FileHistory = {
        path: 'src/index.ts',
        commits: Array(15).fill(null).map((_, i) => ({
          hash: `hash${i}`,
          message: `commit ${i}`,
          author: 'test',
          date: new Date(),
          files: ['src/index.ts'],
        })),
        authors: [{ name: 'test', email: 'test@test.com', commits: 15, additions: 100, deletions: 50 }],
        changeFrequency: 0.5, // High frequency
        lastModified: new Date(),
      };

      const signal = engine.detectHighChurn(history);
      expect(signal).not.toBeNull();
      expect(signal?.type).toBe('high-churn');
    });

    it('should not flag low churn files', () => {
      const history: FileHistory = {
        path: 'src/index.ts',
        commits: [{ hash: 'abc', message: 'init', author: 'test', date: new Date(), files: ['src/index.ts'] }],
        authors: [{ name: 'test', email: 'test@test.com', commits: 1, additions: 10, deletions: 0 }],
        changeFrequency: 0.01,
        lastModified: new Date(),
      };

      const signal = engine.detectHighChurn(history);
      expect(signal).toBeNull();
    });
  });

  describe('detectGodClass', () => {
    it('should detect large files', () => {
      const signal = engine.detectGodClass('src/big.ts', 600, 50);
      expect(signal).not.toBeNull();
      expect(signal?.type).toBe('god-class');
      expect(signal?.severity).toBe('warning');
    });

    it('should not flag small files', () => {
      const signal = engine.detectGodClass('src/small.ts', 100, 5);
      expect(signal).toBeNull();
    });
  });

  describe('detectCircularDependency', () => {
    it('should create signal for circular dependency', () => {
      const cycle = ['src/a.ts', 'src/b.ts', 'src/a.ts'];
      const signal = engine.detectCircularDependency(cycle);

      expect(signal.type).toBe('circular-dependency');
      expect(signal.severity).toBe('error');
      expect(signal.message).toContain('src/a.ts');
      expect(signal.message).toContain('src/b.ts');
    });
  });

  describe('detectOrphanCode', () => {
    it('should detect unused exports', () => {
      const symbol: Symbol = {
        name: 'unusedFunction',
        kind: 'function',
        filePath: 'src/utils.ts',
        line: 10,
        column: 1,
        exported: true,
        references: [],
      };

      const signal = engine.detectOrphanCode(symbol, 0);
      expect(signal).not.toBeNull();
      expect(signal?.type).toBe('orphan-code');
    });

    it('should not flag used exports', () => {
      const symbol: Symbol = {
        name: 'usedFunction',
        kind: 'function',
        filePath: 'src/utils.ts',
        line: 10,
        column: 1,
        exported: true,
        references: [],
      };

      const signal = engine.detectOrphanCode(symbol, 5);
      expect(signal).toBeNull();
    });

    it('should not flag non-exported symbols', () => {
      const symbol: Symbol = {
        name: 'privateFunction',
        kind: 'function',
        filePath: 'src/utils.ts',
        line: 10,
        column: 1,
        exported: false,
        references: [],
      };

      const signal = engine.detectOrphanCode(symbol, 0);
      expect(signal).toBeNull();
    });
  });

  describe('detectMissingTests', () => {
    it('should flag files without tests', () => {
      const signal = engine.detectMissingTests('src/utils.ts', false);
      expect(signal).not.toBeNull();
      expect(signal?.type).toBe('missing-tests');
    });

    it('should not flag test files', () => {
      const signal = engine.detectMissingTests('src/utils.test.ts', false);
      expect(signal).toBeNull();
    });

    it('should not flag files with tests', () => {
      const signal = engine.detectMissingTests('src/utils.ts', true);
      expect(signal).toBeNull();
    });
  });

  describe('analyzeAll', () => {
    it('should return all detected signals', () => {
      const files = new Map([
        ['src/big.ts', { lines: 600, symbols: Array(10).fill({ exported: false }) }],
        ['src/small.ts', { lines: 100, symbols: [] }],
      ]);
      
      const cycles = [['src/a.ts', 'src/b.ts', 'src/a.ts']];
      
      const signals = engine.analyzeAll(files, new Map(), cycles);
      
      // Should have god class signal and cycle signal
      expect(signals.some(s => s.type === 'god-class')).toBe(true);
      expect(signals.some(s => s.type === 'circular-dependency')).toBe(true);
    });
  });
});
