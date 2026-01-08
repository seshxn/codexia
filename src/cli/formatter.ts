import chalk from 'chalk';
import type {
  AnalysisResult,
  ImpactResult,
  ConventionViolation,
  TestSuggestion,
  PrReport,
  GitDiff,
} from '../core/types.js';

export class Formatter {
  private json: boolean;

  constructor(json: boolean = false) {
    this.json = json;
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
}
