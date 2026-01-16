import * as path from 'node:path';
import type { 
  GitDiff, 
  FileInfo, 
  ImpactResult,
} from '../core/types.js';
import type { TemporalInsights } from './temporal-analyzer.js';
import type { FileComplexity } from './complexity-engine.js';

// ============================================================================
// Test Prioritization Types
// ============================================================================

export interface PrioritizedTest {
  testFile: string;
  targetFile: string;
  priority: number;           // 0-100, higher = run first
  reason: string;
  category: TestCategory;
  estimatedDuration?: number; // ms
  lastRunResult?: 'pass' | 'fail' | 'skip' | 'unknown';
  flakiness?: number;         // 0-1, probability of flaky failure
}

export type TestCategory = 
  | 'direct-change'           // Test file for directly changed code
  | 'affected-module'         // Test for indirectly affected module
  | 'integration'             // Integration tests touching changed code
  | 'regression-prone'        // Tests for historically buggy code
  | 'hot-path'               // Tests for critical code paths
  | 'high-coverage'          // Tests with high code coverage
  | 'smoke'                  // Basic sanity tests
  | 'other';

export interface TestPrioritizationResult {
  tests: PrioritizedTest[];
  totalTests: number;
  estimatedTotalDuration: number;
  suggestedSubset: PrioritizedTest[];  // Minimal test set for quick feedback
  coverage: TestCoverageEstimate;
}

export interface TestCoverageEstimate {
  directChangeCoverage: number;     // % of changed code covered
  affectedModuleCoverage: number;   // % of affected modules covered
  overallCoverage: number;          // Estimated overall coverage
}

export interface TestHistoryEntry {
  testFile: string;
  lastRun: Date;
  duration: number;
  result: 'pass' | 'fail' | 'skip';
  failureCount: number;       // Recent failures
  totalRuns: number;
}

// ============================================================================
// Smart Test Prioritizer
// ============================================================================

export class SmartTestPrioritizer {
  private testPatterns = ['.test.ts', '.spec.ts', '.test.tsx', '.spec.tsx', '.test.js', '.spec.js'];
  private testHistory: Map<string, TestHistoryEntry> = new Map();

  /**
   * Prioritize tests based on code changes and analysis
   */
  prioritize(
    diff: GitDiff,
    files: Map<string, FileInfo>,
    impact?: ImpactResult,
    temporal?: Map<string, TemporalInsights>,
    complexity?: Map<string, FileComplexity>
  ): TestPrioritizationResult {
    const allTests = this.findAllTests(files);
    const prioritizedTests: PrioritizedTest[] = [];

    // 1. Tests for directly changed files (highest priority)
    for (const changedFile of diff.files) {
      const testFile = this.findTestFile(changedFile.path, allTests);
      if (testFile) {
        prioritizedTests.push({
          testFile,
          targetFile: changedFile.path,
          priority: 100,
          reason: `Direct test for changed file`,
          category: 'direct-change',
          estimatedDuration: this.getEstimatedDuration(testFile),
          lastRunResult: this.getLastRunResult(testFile),
          flakiness: this.getFlakiness(testFile),
        });
      }
    }

    // 2. Tests for affected modules
    if (impact) {
      for (const affected of impact.affectedModules) {
        const testFile = this.findTestFile(affected.path, allTests);
        if (testFile && !prioritizedTests.some(t => t.testFile === testFile)) {
          const distance = affected.distance || 1;
          prioritizedTests.push({
            testFile,
            targetFile: affected.path,
            priority: Math.max(50, 90 - distance * 10),
            reason: `Tests module affected by changes (distance: ${distance})`,
            category: 'affected-module',
            estimatedDuration: this.getEstimatedDuration(testFile),
            lastRunResult: this.getLastRunResult(testFile),
            flakiness: this.getFlakiness(testFile),
          });
        }
      }
    }

    // 3. Tests for regression-prone files (from temporal analysis)
    if (temporal) {
      for (const [filePath, insights] of temporal) {
        if (insights.regressionProne) {
          const testFile = this.findTestFile(filePath, allTests);
          if (testFile && !prioritizedTests.some(t => t.testFile === testFile)) {
            prioritizedTests.push({
              testFile,
              targetFile: filePath,
              priority: 75,
              reason: `File is historically regression-prone`,
              category: 'regression-prone',
              estimatedDuration: this.getEstimatedDuration(testFile),
              lastRunResult: this.getLastRunResult(testFile),
              flakiness: this.getFlakiness(testFile),
            });
          }
        }
      }
    }

    // 4. Tests for complex files
    if (complexity) {
      for (const [filePath, fileComplexity] of complexity) {
        if (fileComplexity.score.overall < 50) {  // Low maintainability = high complexity
          const testFile = this.findTestFile(filePath, allTests);
          if (testFile && !prioritizedTests.some(t => t.testFile === testFile)) {
            prioritizedTests.push({
              testFile,
              targetFile: filePath,
              priority: 60,
              reason: `File has high complexity (maintainability: ${fileComplexity.score.maintainabilityIndex})`,
              category: 'other',
              estimatedDuration: this.getEstimatedDuration(testFile),
              lastRunResult: this.getLastRunResult(testFile),
              flakiness: this.getFlakiness(testFile),
            });
          }
        }
      }
    }

    // 5. Integration tests
    for (const testFile of allTests) {
      if (this.isIntegrationTest(testFile) && 
          !prioritizedTests.some(t => t.testFile === testFile)) {
        // Check if any changed file might be covered
        const mightBeRelevant = diff.files.some(f => 
          this.mightTestCover(testFile, f.path, files)
        );
        
        if (mightBeRelevant) {
          prioritizedTests.push({
            testFile,
            targetFile: 'multiple',
            priority: 45,
            reason: 'Integration test that may cover changed code',
            category: 'integration',
            estimatedDuration: this.getEstimatedDuration(testFile),
            lastRunResult: this.getLastRunResult(testFile),
            flakiness: this.getFlakiness(testFile),
          });
        }
      }
    }

    // Sort by priority
    prioritizedTests.sort((a, b) => b.priority - a.priority);

    // Calculate suggested subset (quick feedback)
    const suggestedSubset = this.calculateMinimalSubset(prioritizedTests);

    // Estimate coverage
    const coverage = this.estimateCoverage(prioritizedTests, diff, impact);

    return {
      tests: prioritizedTests,
      totalTests: allTests.length,
      estimatedTotalDuration: prioritizedTests.reduce(
        (sum, t) => sum + (t.estimatedDuration || 1000), 0
      ),
      suggestedSubset,
      coverage,
    };
  }

  /**
   * Load test history for better prioritization
   */
  loadHistory(history: TestHistoryEntry[]): void {
    for (const entry of history) {
      this.testHistory.set(entry.testFile, entry);
    }
  }

  /**
   * Record test run result
   */
  recordResult(testFile: string, result: 'pass' | 'fail' | 'skip', duration: number): void {
    const existing = this.testHistory.get(testFile) || {
      testFile,
      lastRun: new Date(),
      duration: 0,
      result: 'pass',
      failureCount: 0,
      totalRuns: 0,
    };

    existing.lastRun = new Date();
    existing.duration = (existing.duration * existing.totalRuns + duration) / (existing.totalRuns + 1);
    existing.result = result;
    existing.totalRuns++;
    if (result === 'fail') existing.failureCount++;

    this.testHistory.set(testFile, existing);
  }

  /**
   * Find all test files
   */
  private findAllTests(files: Map<string, FileInfo>): string[] {
    return Array.from(files.keys()).filter(f => this.isTestFile(f));
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(filePath: string): boolean {
    return this.testPatterns.some(pattern => filePath.includes(pattern));
  }

  /**
   * Check if file is an integration test
   */
  private isIntegrationTest(filePath: string): boolean {
    return filePath.includes('integration') || 
           filePath.includes('e2e') ||
           filePath.includes('__integration__');
  }

  /**
   * Find test file for a source file
   */
  private findTestFile(sourcePath: string, allTests: string[]): string | undefined {
    const ext = path.extname(sourcePath);
    const base = sourcePath.slice(0, -ext.length);

    // Try common patterns
    const patterns = [
      `${base}.test${ext}`,
      `${base}.spec${ext}`,
      `${base.replace('/src/', '/test/')}.test${ext}`,
      `${base.replace('/src/', '/__tests__/')}.test${ext}`,
    ];

    for (const pattern of patterns) {
      if (allTests.includes(pattern)) {
        return pattern;
      }
    }

    // Fuzzy match by filename
    const baseName = path.basename(base);
    return allTests.find(t => t.includes(baseName) && this.isTestFile(t));
  }

  /**
   * Check if a test might cover a source file
   */
  private mightTestCover(testFile: string, sourceFile: string, files: Map<string, FileInfo>): boolean {
    const testInfo = files.get(testFile);
    if (!testInfo) return false;

    // Check imports
    return testInfo.imports.some(imp => {
      const importPath = imp.source.replace(/^\.\//, '').replace(/^\.\.\//, '');
      return sourceFile.includes(importPath) || importPath.includes(path.basename(sourceFile, path.extname(sourceFile)));
    });
  }

  /**
   * Get estimated duration for a test
   */
  private getEstimatedDuration(testFile: string): number {
    const history = this.testHistory.get(testFile);
    if (history) return history.duration;

    // Heuristics based on test type
    if (this.isIntegrationTest(testFile)) return 10000;
    if (testFile.includes('e2e')) return 30000;
    return 2000;  // Default unit test
  }

  /**
   * Get last run result
   */
  private getLastRunResult(testFile: string): 'pass' | 'fail' | 'skip' | 'unknown' {
    return this.testHistory.get(testFile)?.result || 'unknown';
  }

  /**
   * Get flakiness score
   */
  private getFlakiness(testFile: string): number {
    const history = this.testHistory.get(testFile);
    if (!history || history.totalRuns < 5) return 0;
    
    // Simple flakiness = failure rate over recent runs
    return history.failureCount / history.totalRuns;
  }

  /**
   * Calculate minimal test subset for quick feedback
   */
  private calculateMinimalSubset(tests: PrioritizedTest[]): PrioritizedTest[] {
    const subset: PrioritizedTest[] = [];
    const coveredTargets = new Set<string>();
    const maxDuration = 60000;  // 1 minute
    let totalDuration = 0;

    for (const test of tests) {
      // Skip flaky tests in quick subset
      if ((test.flakiness || 0) > 0.3) continue;
      
      // Skip if target already covered
      if (coveredTargets.has(test.targetFile)) continue;

      // Add to subset if within time budget
      const duration = test.estimatedDuration || 2000;
      if (totalDuration + duration <= maxDuration) {
        subset.push(test);
        coveredTargets.add(test.targetFile);
        totalDuration += duration;
      }

      // Stop after direct changes are covered
      if (test.category !== 'direct-change' && subset.length >= 5) break;
    }

    return subset;
  }

  /**
   * Estimate test coverage
   */
  private estimateCoverage(
    tests: PrioritizedTest[],
    diff: GitDiff,
    impact?: ImpactResult
  ): TestCoverageEstimate {
    const changedFiles = new Set(diff.files.map(f => f.path));
    const affectedFiles = new Set(impact?.affectedModules.map(m => m.path) || []);
    
    const testedChangedFiles = new Set(
      tests.filter(t => changedFiles.has(t.targetFile)).map(t => t.targetFile)
    );
    const testedAffectedFiles = new Set(
      tests.filter(t => affectedFiles.has(t.targetFile)).map(t => t.targetFile)
    );

    return {
      directChangeCoverage: changedFiles.size > 0
        ? (testedChangedFiles.size / changedFiles.size) * 100
        : 100,
      affectedModuleCoverage: affectedFiles.size > 0
        ? (testedAffectedFiles.size / affectedFiles.size) * 100
        : 100,
      overallCoverage: Math.min(
        100,
        ((testedChangedFiles.size + testedAffectedFiles.size) / 
         Math.max(1, changedFiles.size + affectedFiles.size)) * 100
      ),
    };
  }

  /**
   * Format prioritized tests for display
   */
  formatResults(result: TestPrioritizationResult, format: 'ascii' | 'json' = 'ascii'): string {
    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }

    const lines: string[] = [];
    
    lines.push('');
    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║               SMART TEST PRIORITIZATION                    ║');
    lines.push('╚════════════════════════════════════════════════════════════╝');
    lines.push('');

    // Quick subset
    lines.push('⚡ Quick Test Subset (run these first):');
    lines.push('─'.repeat(50));
    for (const test of result.suggestedSubset) {
      const icon = test.category === 'direct-change' ? '🎯' :
                   test.category === 'affected-module' ? '📡' : '🔧';
      lines.push(`  ${icon} ${test.testFile}`);
      lines.push(`     Priority: ${test.priority} | ${test.reason}`);
    }
    lines.push('');

    // Coverage estimate
    lines.push('📊 Coverage Estimate:');
    lines.push(`  Direct changes: ${result.coverage.directChangeCoverage.toFixed(0)}%`);
    lines.push(`  Affected modules: ${result.coverage.affectedModuleCoverage.toFixed(0)}%`);
    lines.push('');

    // Full list
    lines.push(`📋 All Prioritized Tests (${result.tests.length}/${result.totalTests}):`);
    lines.push('─'.repeat(50));
    
    for (const test of result.tests.slice(0, 15)) {
      const status = test.lastRunResult === 'pass' ? '✓' :
                     test.lastRunResult === 'fail' ? '✗' : '?';
      lines.push(`  [${test.priority.toString().padStart(3)}] ${status} ${test.testFile}`);
    }
    
    if (result.tests.length > 15) {
      lines.push(`  ... and ${result.tests.length - 15} more tests`);
    }

    lines.push('');
    lines.push(`⏱️  Estimated total duration: ${Math.round(result.estimatedTotalDuration / 1000)}s`);
    lines.push('');

    return lines.join('\n');
  }
}
