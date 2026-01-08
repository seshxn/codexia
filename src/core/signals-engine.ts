import type { Signal, FileHistory, Symbol } from './types.js';

export interface SignalConfig {
  highChurnThreshold: number;
  godClassThreshold: number;
  maxComplexity: number;
}

const DEFAULT_CONFIG: SignalConfig = {
  highChurnThreshold: 10, // commits in last 30 days
  godClassThreshold: 500, // lines
  maxComplexity: 20,
};

export class SignalsEngine {
  private config: SignalConfig;

  constructor(config: Partial<SignalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze file history for high churn
   */
  detectHighChurn(history: FileHistory): Signal | null {
    if (history.changeFrequency > this.config.highChurnThreshold / 30) {
      return {
        type: 'high-churn',
        severity: 'warning',
        message: `File ${history.path} has high change frequency (${history.commits.length} commits)`,
        filePath: history.path,
        evidence: [
          {
            type: 'metric',
            description: `${history.commits.length} commits by ${history.authors.length} authors`,
            source: 'git log',
          },
          {
            type: 'commit',
            description: `Recent commits: ${history.commits.slice(0, 3).map(c => c.message).join(', ')}`,
            source: 'git log',
          },
        ],
      };
    }
    return null;
  }

  /**
   * Detect god classes (large files with many symbols)
   */
  detectGodClass(filePath: string, lineCount: number, symbolCount: number): Signal | null {
    if (lineCount > this.config.godClassThreshold) {
      return {
        type: 'god-class',
        severity: 'warning',
        message: `File ${filePath} is very large (${lineCount} lines, ${symbolCount} symbols)`,
        filePath,
        evidence: [
          {
            type: 'metric',
            description: `${lineCount} lines of code`,
            source: 'static analysis',
          },
          {
            type: 'metric',
            description: `${symbolCount} symbols defined`,
            source: 'static analysis',
          },
        ],
      };
    }
    return null;
  }

  /**
   * Detect circular dependencies
   */
  detectCircularDependency(cycle: string[]): Signal {
    return {
      type: 'circular-dependency',
      severity: 'error',
      message: `Circular dependency detected: ${cycle.join(' → ')}`,
      evidence: [
        {
          type: 'code',
          description: `Import cycle: ${cycle.join(' → ')}`,
          source: 'dependency analysis',
        },
      ],
    };
  }

  /**
   * Detect orphan code (exported but never imported)
   */
  detectOrphanCode(symbol: Symbol, importCount: number): Signal | null {
    if (symbol.exported && importCount === 0) {
      return {
        type: 'orphan-code',
        severity: 'info',
        message: `Exported symbol '${symbol.name}' is never imported`,
        filePath: symbol.filePath,
        line: symbol.line,
        evidence: [
          {
            type: 'code',
            description: `${symbol.kind} '${symbol.name}' is exported but has no importers`,
            source: 'dependency analysis',
          },
        ],
      };
    }
    return null;
  }

  /**
   * Detect missing tests
   */
  detectMissingTests(filePath: string, hasTests: boolean): Signal | null {
    if (!hasTests && !filePath.includes('.test.') && !filePath.includes('.spec.')) {
      return {
        type: 'missing-tests',
        severity: 'info',
        message: `File ${filePath} has no associated test file`,
        filePath,
        evidence: [
          {
            type: 'code',
            description: 'No test file found matching common patterns (.test.ts, .spec.ts)',
            source: 'file analysis',
          },
        ],
      };
    }
    return null;
  }

  /**
   * Analyze and return all signals for a codebase
   */
  analyzeAll(
    files: Map<string, { lines: number; symbols: Symbol[] }>,
    _history: Map<string, FileHistory>,
    cycles: string[][]
  ): Signal[] {
    const signals: Signal[] = [];

    // Check for god classes
    for (const [filePath, fileInfo] of files) {
      const godClassSignal = this.detectGodClass(
        filePath,
        fileInfo.lines,
        fileInfo.symbols.length
      );
      if (godClassSignal) {
        signals.push(godClassSignal);
      }
    }

    // Check for circular dependencies
    for (const cycle of cycles) {
      signals.push(this.detectCircularDependency(cycle));
    }

    return signals;
  }
}
