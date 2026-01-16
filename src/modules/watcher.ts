import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { CodexiaEngine } from '../cli/engine.js';
import chalk from 'chalk';
import type { 
  ImpactResult, 
  ConventionViolation, 
  Signal,
} from '../core/types.js';

// ============================================================================
// Watch Mode Types
// ============================================================================

export interface WatchEvent {
  type: 'change' | 'add' | 'unlink';
  path: string;
  timestamp: Date;
}

export interface WatchAnalysis {
  event: WatchEvent;
  impact?: ImpactResult;
  violations?: ConventionViolation[];
  signals?: Signal[];
  duration: number;
}

export interface WatchOptions {
  debounceMs: number;
  checkImpact: boolean;
  checkConventions: boolean;
  checkSignals: boolean;
  patterns: string[];
  ignorePatterns: string[];
  verbose: boolean;
}

// ============================================================================
// File Watcher
// ============================================================================

export class CodexiaWatcher extends EventEmitter {
  private engine: CodexiaEngine;
  private repoRoot: string;
  private options: WatchOptions;
  private watchers: fs.FSWatcher[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges: Map<string, WatchEvent> = new Map();
  private running = false;

  constructor(repoRoot: string, options: Partial<WatchOptions> = {}) {
    super();
    this.repoRoot = repoRoot;
    this.engine = new CodexiaEngine({ repoRoot });
    this.options = {
      debounceMs: 500,
      checkImpact: true,
      checkConventions: true,
      checkSignals: false,
      patterns: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      verbose: false,
      ...options,
    };
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    if (this.running) return;
    
    // Initialize engine
    await this.engine.initialize();
    
    this.running = true;
    console.log(this.formatStartMessage());

    // Watch the repository
    this.watchDirectory(this.repoRoot);

    this.emit('started');
  }

  /**
   * Stop watching
   */
  stop(): void {
    this.running = false;
    
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.emit('stopped');
  }

  /**
   * Watch a directory recursively
   */
  private watchDirectory(dir: string): void {
    try {
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        
        const fullPath = path.join(dir, filename);
        
        // Check if we should ignore this file
        if (this.shouldIgnore(fullPath)) return;
        
        // Check if file matches our patterns
        if (!this.matchesPatterns(fullPath)) return;

        // Queue the change
        this.queueChange({
          type: 'change',
          path: path.relative(this.repoRoot, fullPath),
          timestamp: new Date(),
        });
      });

      this.watchers.push(watcher);
    } catch (error) {
      console.error(chalk.red(`Error watching directory: ${dir}`));
    }
  }

  /**
   * Queue a file change for analysis
   */
  private queueChange(event: WatchEvent): void {
    this.pendingChanges.set(event.path, event);

    // Debounce multiple rapid changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processChanges();
    }, this.options.debounceMs);
  }

  /**
   * Process pending file changes
   */
  private async processChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) return;

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();
    
    console.log('');
    console.log(chalk.cyan(`[${new Date().toLocaleTimeString()}]`) + 
                ` ${changes.length} file(s) changed`);

    for (const change of changes) {
      console.log(chalk.gray(`  ${change.type}: ${change.path}`));
    }

    const analysis = await this.analyzeChanges(changes);
    
    this.printAnalysis(analysis);
    
    this.emit('analysis', analysis);
  }

  /**
   * Analyze file changes
   */
  private async analyzeChanges(changes: WatchEvent[]): Promise<WatchAnalysis[]> {
    const results: WatchAnalysis[] = [];

    // Re-initialize engine to pick up changes
    await this.engine.initialize();

    for (const change of changes) {
      const changeStart = Date.now();
      const analysis: WatchAnalysis = {
        event: change,
        duration: 0,
      };

      try {
        // Impact analysis
        if (this.options.checkImpact) {
          analysis.impact = await this.engine.analyzeImpact({});
        }

        // Convention checking
        if (this.options.checkConventions) {
          analysis.violations = await this.engine.checkConventions({});
        }

        // Signal detection
        if (this.options.checkSignals) {
          analysis.signals = await this.engine.analyzeSignals({});
        }
      } catch (error) {
        if (this.options.verbose) {
          console.error(chalk.red(`Error analyzing ${change.path}:`), error);
        }
      }

      analysis.duration = Date.now() - changeStart;
      results.push(analysis);
    }

    return results;
  }

  /**
   * Print analysis results
   */
  private printAnalysis(analyses: WatchAnalysis[]): void {
    // Aggregate results
    let totalAffected = 0;
    let totalViolations = 0;
    let totalSignals = 0;
    let breakingChanges = 0;

    for (const analysis of analyses) {
      if (analysis.impact) {
        totalAffected += analysis.impact.affectedModules.length;
        breakingChanges += analysis.impact.publicApiChanges
          .filter(c => c.changeType === 'breaking').length;
      }
      if (analysis.violations) {
        totalViolations += analysis.violations.length;
      }
      if (analysis.signals) {
        totalSignals += analysis.signals.length;
      }
    }

    console.log('');
    console.log(chalk.bold('  Analysis Results'));
    console.log(chalk.gray('  ' + '─'.repeat(40)));

    // Impact summary
    if (this.options.checkImpact) {
      const impactIcon = totalAffected > 10 ? chalk.red('!') :
                        totalAffected > 5 ? chalk.yellow('⚠') : chalk.green('✓');
      console.log(`  ${impactIcon} ${totalAffected} module(s) affected`);
      
      if (breakingChanges > 0) {
        console.log(chalk.red(`    💥 ${breakingChanges} potential breaking change(s)`));
      }

      // Show first few affected modules
      for (const analysis of analyses) {
        if (analysis.impact?.affectedModules.length) {
          for (const mod of analysis.impact.affectedModules.slice(0, 3)) {
            console.log(chalk.gray(`      → ${mod.path}`));
          }
          if (analysis.impact.affectedModules.length > 3) {
            console.log(chalk.gray(`      ... and ${analysis.impact.affectedModules.length - 3} more`));
          }
          break;
        }
      }
    }

    // Convention violations
    if (this.options.checkConventions) {
      const convIcon = totalViolations > 0 ? chalk.yellow('⚠') : chalk.green('✓');
      console.log(`  ${convIcon} ${totalViolations} convention violation(s)`);
      
      for (const analysis of analyses) {
        if (analysis.violations?.length) {
          for (const v of analysis.violations.slice(0, 3)) {
            console.log(chalk.yellow(`      Line ${v.line}: ${v.message}`));
          }
          break;
        }
      }
    }

    // Signals
    if (this.options.checkSignals && totalSignals > 0) {
      console.log(`  ${chalk.blue('ℹ')} ${totalSignals} code signal(s)`);
    }

    // Duration
    const totalDuration = analyses.reduce((sum, a) => sum + a.duration, 0);
    console.log(chalk.gray(`  Completed in ${totalDuration}ms`));
    console.log('');
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnore(filePath: string): boolean {
    const relativePath = path.relative(this.repoRoot, filePath);
    
    for (const pattern of this.options.ignorePatterns) {
      if (this.matchGlob(relativePath, pattern)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if file matches watch patterns
   */
  private matchesPatterns(filePath: string): boolean {
    const relativePath = path.relative(this.repoRoot, filePath);
    
    for (const pattern of this.options.patterns) {
      if (this.matchGlob(relativePath, pattern)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Simple glob matching
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    const regex = pattern
      .replace(/\*\*/g, '{{DOUBLESTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{DOUBLESTAR}}/g, '.*')
      .replace(/\//g, '\\/');
    
    return new RegExp(`^${regex}$`).test(filePath);
  }

  /**
   * Format the start message
   */
  private formatStartMessage(): string {
    const lines: string[] = [
      '',
      chalk.bold.cyan('╔════════════════════════════════════════════════════════════╗'),
      chalk.bold.cyan('║                    CODEXIA WATCH MODE                      ║'),
      chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝'),
      '',
      chalk.gray(`  Watching: ${this.repoRoot}`),
      chalk.gray(`  Patterns: ${this.options.patterns.join(', ')}`),
      '',
      chalk.gray('  Checks enabled:'),
      `    ${this.options.checkImpact ? chalk.green('✓') : chalk.gray('○')} Impact analysis`,
      `    ${this.options.checkConventions ? chalk.green('✓') : chalk.gray('○')} Convention checking`,
      `    ${this.options.checkSignals ? chalk.green('✓') : chalk.gray('○')} Signal detection`,
      '',
      chalk.gray('  Press Ctrl+C to stop'),
      '',
    ];

    return lines.join('\n');
  }
}

/**
 * Start watch mode
 */
export async function startWatchMode(
  repoRoot: string,
  options?: Partial<WatchOptions>
): Promise<CodexiaWatcher> {
  const watcher = new CodexiaWatcher(repoRoot, options);
  await watcher.start();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\nStopping watch mode...'));
    watcher.stop();
    process.exit(0);
  });

  return watcher;
}
