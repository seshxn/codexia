import chalk from 'chalk';
import type {
  AnalysisResult,
  ImpactResult,
  ConventionViolation,
  TestSuggestion,
  PrReport,
  GitDiff,
  Signal,
} from '../core/types.js';
import type { IndexBenchmarkResult } from '../core/index-benchmark.js';

export class Formatter {
  private json: boolean;
  private markdown: boolean;

  constructor(json: boolean = false, markdown: boolean = false) {
    // Ensure output modes are mutually exclusive:
    // if both json and markdown are requested, json takes precedence.
    if (json && markdown) {
      this.json = true;
      this.markdown = false;
    } else {
      this.json = json;
      this.markdown = markdown;
    }
  }

  /**
   * Format scan results
   */
  formatScan(result: AnalysisResult): string {
    if (this.json) {
      return JSON.stringify(result, null, 2);
    }

    const lines: string[] = [
      '',
      chalk.green('✓') + ' Repository indexed successfully',
      '',
      `  Files analyzed:   ${chalk.cyan(result.stats.files)}`,
      `  Symbols found:    ${chalk.cyan(result.stats.symbols)}`,
      `  Exports tracked:  ${chalk.cyan(result.stats.exports)}`,
      `  Avg fan-out:      ${chalk.cyan(result.stats.avgFanOut)}`,
      `  Project memory:   ${result.hasMemory ? chalk.green('Found') : chalk.yellow('Not found')}`,
      '',
      `  Completed in ${result.duration}ms`,
      '',
    ];

    return lines.join('\n');
  }

  formatIndexBenchmark(result: IndexBenchmarkResult): string {
    if (this.json) {
      return JSON.stringify(result, null, 2);
    }

    const semantic = result.mcpLike.semanticSearch;
    const context = result.mcpLike.context;
    const queryGraph = result.mcpLike.queryGraph;
    const cypher = result.mcpLike.cypher;
    const graphFiles = typeof result.graph.files === 'number' ? result.graph.files : 'unknown';

    return [
      '',
      chalk.bold('Index Benchmark'),
      chalk.gray('═'.repeat(50)),
      `Repository:       ${chalk.cyan(result.repoRoot)}`,
      `Graph files:      ${chalk.cyan(graphFiles)}`,
      `Analyze:          ${chalk.cyan(`${result.analyze.durationMs}ms`)} (${result.analyze.stats.files} files)`,
      `Update:           ${chalk.cyan(`${result.update.durationMs}ms`)} (${result.update.changedFiles.length} changed)`,
      `Graph stats:      ${chalk.cyan(`${result.mcpLike.graphStats.durationMs}ms`)}`,
      `Context:          ${chalk.cyan(`${context.durationMs}ms`)} (${context.resultCount} fields)`,
      `Query graph:      ${chalk.cyan(`${queryGraph.durationMs}ms`)} (${queryGraph.resultCount} results)`,
      `Semantic search:  ${chalk.cyan(`${semantic.durationMs}ms`)} (${semantic.resultCount} results)`,
      `Cypher:           ${chalk.cyan(`${cypher.durationMs}ms`)} (${cypher.resultCount} rows)`,
      '',
    ].join('\n');
  }

  /**
   * Format impact analysis results
   */
  formatImpact(impact: ImpactResult, diff: GitDiff): string {
    if (this.json) {
      return JSON.stringify({
        success: true,
        diff: {
          files: diff.stats.files,
          additions: diff.stats.additions,
          deletions: diff.stats.deletions,
        },
        impact: {
          directlyChanged: impact.directlyChanged.length,
          indirectlyAffected: impact.affectedModules.length,
          publicApiChanges: impact.publicApiChanges.length,
          breakingChanges: impact.publicApiChanges.filter(c => c.changeType === 'breaking').length,
          boundaryViolations: impact.boundaryViolations.length,
        },
        details: {
          directlyChanged: impact.directlyChanged.map(c => ({
            symbol: c.symbol.name,
            file: c.symbol.filePath,
            type: c.changeType,
          })),
          affectedModules: impact.affectedModules.map(m => ({
            path: m.path,
            reason: m.reason,
          })),
          apiChanges: impact.publicApiChanges,
          boundaryViolations: impact.boundaryViolations,
        },
      }, null, 2);
    }

    const lines: string[] = [
      '',
      chalk.bold('Impact Analysis'),
      chalk.gray('═'.repeat(50)),
      `Comparing: ${chalk.cyan(diff.base)} → ${chalk.cyan(diff.head)}`,
      `Files: ${diff.stats.files} | ${chalk.green(`+${diff.stats.additions}`)} ${chalk.red(`-${diff.stats.deletions}`)}`,
      '',
    ];

    // Direct changes
    lines.push(chalk.bold('Direct Changes'));
    lines.push(chalk.gray('─'.repeat(40)));
    if (impact.directlyChanged.length === 0) {
      lines.push(chalk.gray('  No symbol changes detected'));
    } else {
      for (const change of impact.directlyChanged.slice(0, 10)) {
        const icon = change.changeType === 'added' ? chalk.green('+') :
                    change.changeType === 'deleted' ? chalk.red('-') : chalk.yellow('~');
        lines.push(`  ${icon} ${change.symbol.kind} ${chalk.cyan(change.symbol.name)}`);
      }
      if (impact.directlyChanged.length > 10) {
        lines.push(chalk.gray(`  ... and ${impact.directlyChanged.length - 10} more`));
      }
    }
    lines.push(`  ${impact.directlyChanged.length} symbol(s) in ${new Set(impact.directlyChanged.map(c => c.symbol.filePath)).size} file(s)`);
    lines.push('');

    // Indirect impact
    lines.push(chalk.bold('Indirect Impact'));
    lines.push(chalk.gray('─'.repeat(40)));
    if (impact.affectedModules.length === 0) {
      lines.push(chalk.gray('  No modules indirectly affected'));
    } else {
      for (const module of impact.affectedModules.slice(0, 5)) {
        lines.push(`  ${chalk.yellow('→')} ${module.path}`);
        lines.push(chalk.gray(`    ${module.reason}`));
      }
      if (impact.affectedModules.length > 5) {
        lines.push(chalk.gray(`  ... and ${impact.affectedModules.length - 5} more`));
      }
    }
    lines.push(`  ${impact.affectedModules.length} module(s) affected`);
    lines.push('');

    // Risk score
    if (impact.riskScore.overall > 0) {
      const riskColor = impact.riskScore.overall >= 60 ? chalk.red :
                       impact.riskScore.overall >= 30 ? chalk.yellow : chalk.green;
      lines.push(chalk.bold('Risk Score'));
      lines.push(chalk.gray('─'.repeat(40)));
      lines.push(`  ${riskColor(impact.riskScore.overall + '/100')}`);
      for (const factor of impact.riskScore.factors) {
        if (factor.score > 0) {
          lines.push(`  ${chalk.gray('•')} ${factor.name}: ${factor.reason}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format convention check results
   */
  formatConventions(violations: ConventionViolation[]): string {
    if (this.json) {
      return JSON.stringify({
        success: violations.length === 0,
        violations: violations.map(v => ({
          file: v.filePath,
          line: v.line,
          rule: v.convention.id,
          message: v.message,
          severity: v.convention.severity,
          suggestion: v.suggestion,
        })),
      }, null, 2);
    }

    if (violations.length === 0) {
      return '\n' + chalk.green('✓') + ' All conventions passed\n';
    }

    const lines: string[] = [
      '',
      chalk.bold('Convention Violations'),
      chalk.gray('═'.repeat(50)),
      '',
    ];

    const byFile = new Map<string, ConventionViolation[]>();
    for (const v of violations) {
      const existing = byFile.get(v.filePath) || [];
      existing.push(v);
      byFile.set(v.filePath, existing);
    }

    for (const [file, fileViolations] of byFile) {
      lines.push(chalk.cyan(file));
      for (const v of fileViolations) {
        const icon = v.convention.severity === 'error' ? chalk.red('✗') :
                    v.convention.severity === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
        lines.push(`  ${icon} Line ${v.line}: ${v.message}`);
        if (v.suggestion) {
          lines.push(chalk.gray(`    → ${v.suggestion}`));
        }
      }
      lines.push('');
    }

    const errors = violations.filter(v => v.convention.severity === 'error').length;
    const warnings = violations.filter(v => v.convention.severity === 'warning').length;
    
    lines.push(chalk.gray('─'.repeat(40)));
    lines.push(`${chalk.red(errors + ' error(s)')}, ${chalk.yellow(warnings + ' warning(s)')}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format test suggestions
   */
  formatTests(suggestions: TestSuggestion[]): string {
    if (this.json) {
      return JSON.stringify({
        success: true,
        suggestions: suggestions.map(s => ({
          targetFile: s.targetFile,
          targetSymbol: s.targetSymbol,
          testFile: s.testFile,
          testType: s.testType,
          priority: s.priority,
          reason: s.reason,
        })),
      }, null, 2);
    }

    if (suggestions.length === 0) {
      return '\n' + chalk.green('✓') + ' No test suggestions - code appears well tested\n';
    }

    const lines: string[] = [
      '',
      chalk.bold('Test Suggestions'),
      chalk.gray('═'.repeat(50)),
      '',
    ];

    const byPriority = {
      high: suggestions.filter(s => s.priority === 'high'),
      medium: suggestions.filter(s => s.priority === 'medium'),
      low: suggestions.filter(s => s.priority === 'low'),
    };

    if (byPriority.high.length > 0) {
      lines.push(chalk.red.bold('High Priority'));
      for (const s of byPriority.high) {
        lines.push(`  ${chalk.red('!')} ${s.targetSymbol === '*' ? s.targetFile : s.targetSymbol}`);
        lines.push(chalk.gray(`    ${s.reason}`));
        lines.push(chalk.gray(`    Test file: ${s.testFile}`));
      }
      lines.push('');
    }

    if (byPriority.medium.length > 0) {
      lines.push(chalk.yellow.bold('Medium Priority'));
      for (const s of byPriority.medium.slice(0, 5)) {
        lines.push(`  ${chalk.yellow('•')} ${s.targetSymbol === '*' ? s.targetFile : s.targetSymbol}`);
        lines.push(chalk.gray(`    ${s.reason}`));
      }
      if (byPriority.medium.length > 5) {
        lines.push(chalk.gray(`  ... and ${byPriority.medium.length - 5} more`));
      }
      lines.push('');
    }

    if (byPriority.low.length > 0) {
      lines.push(chalk.blue.bold('Low Priority'));
      lines.push(chalk.gray(`  ${byPriority.low.length} suggestions`));
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format PR report
   */
  formatPrReport(report: PrReport): string {
    if (this.json) {
      return JSON.stringify(report, null, 2);
    }

    if (this.markdown) {
      return this.formatPrReportMarkdown(report);
    }

    const lines: string[] = [
      '',
      chalk.bold.blue('═'.repeat(60)),
      chalk.bold.blue('  CODEXIA PR ANALYSIS'),
      chalk.bold.blue('═'.repeat(60)),
      '',
    ];

    // Summary
    lines.push(chalk.bold('Summary'));
    lines.push(chalk.gray('─'.repeat(40)));
    lines.push(`  Files changed: ${report.summary.filesChanged}`);
    lines.push(`  Changes: ${chalk.green(`+${report.summary.additions}`)} ${chalk.red(`-${report.summary.deletions}`)}`);
    lines.push('');

    // Risk assessment
    const riskColor = report.risks.level === 'critical' ? chalk.bgRed.white :
                     report.risks.level === 'high' ? chalk.red :
                     report.risks.level === 'medium' ? chalk.yellow : chalk.green;
    lines.push(chalk.bold('Risk Assessment'));
    lines.push(chalk.gray('─'.repeat(40)));
    lines.push(`  Level: ${riskColor(report.risks.level.toUpperCase())} (${report.risks.score}/100)`);
    lines.push('');

    // Recommendations
    if (report.risks.recommendations.length > 0) {
      lines.push(chalk.bold('Recommendations'));
      lines.push(chalk.gray('─'.repeat(40)));
      for (const rec of report.risks.recommendations) {
        lines.push(`  ${chalk.yellow('→')} ${rec}`);
      }
      lines.push('');
    }

    // Quick stats
    lines.push(chalk.bold('Details'));
    lines.push(chalk.gray('─'.repeat(40)));
    lines.push(`  Symbols changed: ${report.impact.directlyChanged.length}`);
    lines.push(`  Modules affected: ${report.impact.affectedModules.length}`);
    lines.push(`  Convention violations: ${report.conventions.length}`);
    lines.push(`  Tests suggested: ${report.tests.length}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format error message
   */
  formatError(error: Error): string {
    if (this.json) {
      return JSON.stringify({ success: false, error: error.message }, null, 2);
    }

    return chalk.red('✗') + ` ${error.message}`;
  }

  /**
   * Format PR report as markdown (for GitHub comments, etc.)
   */
  private formatPrReportMarkdown(report: PrReport): string {
    const lines: string[] = [
      '# 📊 Codexia PR Analysis',
      '',
      '## Summary',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Files Changed | ${report.summary.filesChanged} |`,
      `| Additions | +${report.summary.additions} |`,
      `| Deletions | -${report.summary.deletions} |`,
      '',
    ];

    // Risk assessment
    const riskEmoji = report.risks.level === 'critical' ? '🔴' :
                     report.risks.level === 'high' ? '🟠' :
                     report.risks.level === 'medium' ? '🟡' : '🟢';
    
    lines.push('## Risk Assessment', '');
    lines.push(`**Level:** ${riskEmoji} ${report.risks.level.toUpperCase()} (${report.risks.score}/100)`);
    lines.push('');

    if (report.risks.factors.length > 0) {
      lines.push('### Risk Factors', '');
      for (const factor of report.risks.factors) {
        if (factor.score > 0) {
          lines.push(`- **${factor.name}**: ${factor.reason}`);
        }
      }
      lines.push('');
    }

    // Recommendations
    if (report.risks.recommendations.length > 0) {
      lines.push('## ⚡ Recommendations', '');
      for (const rec of report.risks.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    // Impact details
    lines.push('## Impact Details', '');
    lines.push(`| Category | Count |`);
    lines.push(`|----------|-------|`);
    lines.push(`| Symbols Changed | ${report.impact.directlyChanged.length} |`);
    lines.push(`| Modules Affected | ${report.impact.affectedModules.length} |`);
    lines.push(`| Convention Violations | ${report.conventions.length} |`);
    lines.push(`| Tests Suggested | ${report.tests.length} |`);
    lines.push('');

    // Breaking changes
    const breakingChanges = report.impact.publicApiChanges.filter(c => c.changeType === 'breaking');
    if (breakingChanges.length > 0) {
      lines.push('## ⚠️ Breaking Changes', '');
      for (const change of breakingChanges) {
        lines.push(`- \`${change.symbol}\` in \`${change.filePath}\`: ${change.description}`);
      }
      lines.push('');
    }

    // Boundary violations
    if (report.impact.boundaryViolations.length > 0) {
      lines.push('## 🚧 Boundary Violations', '');
      for (const violation of report.impact.boundaryViolations) {
        lines.push(`- **${violation.from}** → **${violation.to}**: ${violation.rule}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('*Generated by [Codexia](https://github.com/codexia)*');

    return lines.join('\n');
  }

  /**
   * Format signals analysis results
   */
  formatSignals(signals: Signal[]): string {
    if (this.json) {
      return JSON.stringify({
        success: true,
        total: signals.length,
        signals: signals.map(s => ({
          type: s.type,
          severity: s.severity,
          message: s.message,
          filePath: s.filePath,
          line: s.line,
          evidence: s.evidence,
        })),
      }, null, 2);
    }

    if (signals.length === 0) {
      return '\n' + chalk.green('✓') + ' No code quality signals detected\n';
    }

    const lines: string[] = [
      '',
      chalk.bold('Code Quality Signals'),
      chalk.gray('═'.repeat(50)),
      '',
    ];

    // Group by type
    const byType = new Map<string, Signal[]>();
    for (const signal of signals) {
      const existing = byType.get(signal.type) || [];
      existing.push(signal);
      byType.set(signal.type, existing);
    }

    const typeLabels: Record<string, string> = {
      'orphan-code': '🔌 Orphan Code (unused exports)',
      'god-class': '📦 Large Files',
      'circular-dependency': '🔄 Circular Dependencies',
      'high-churn': '📈 High Churn Files',
      'missing-tests': '🧪 Missing Tests',
    };

    for (const [type, typeSignals] of byType) {
      const label = typeLabels[type] || type;
      lines.push(chalk.bold(label));
      lines.push(chalk.gray('─'.repeat(40)));

      for (const signal of typeSignals.slice(0, 10)) {
        const icon = signal.severity === 'error' ? chalk.red('✗') :
                    signal.severity === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
        lines.push(`  ${icon} ${signal.message}`);
        if (signal.filePath) {
          lines.push(chalk.gray(`    at ${signal.filePath}${signal.line ? `:${signal.line}` : ''}`));
        }
      }

      if (typeSignals.length > 10) {
        lines.push(chalk.gray(`  ... and ${typeSignals.length - 10} more`));
      }
      lines.push('');
    }

    // Summary
    const errors = signals.filter(s => s.severity === 'error').length;
    const warnings = signals.filter(s => s.severity === 'warning').length;
    const infos = signals.filter(s => s.severity === 'info').length;
    
    lines.push(chalk.gray('─'.repeat(40)));
    lines.push(`Total: ${signals.length} signal(s)`);
    if (errors > 0) lines.push(`  ${chalk.red(errors + ' error(s)')}`);
    if (warnings > 0) lines.push(`  ${chalk.yellow(warnings + ' warning(s)')}`);
    if (infos > 0) lines.push(`  ${chalk.blue(infos + ' info')}`);
    lines.push('');

    return lines.join('\n');
  }
}
