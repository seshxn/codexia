import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import chalk from 'chalk';

export const complexityCommand = new Command('complexity')
  .description('Analyze code complexity')
  .argument('[path]', 'File or directory to analyze')
  .option('-t, --threshold <score>', 'Minimum complexity score to report', '20')
  .option('--sort <field>', 'Sort by: maintainability, cyclomatic, cognitive, coupling', 'maintainability')
  .option('--top <n>', 'Show top N most complex items', '10')
  .option('--include-symbols', 'Show symbol-level complexity')
  .option('--markdown', 'Output as markdown table')
  .addHelpText('after', `
Examples:
  $ codexia complexity                    Analyze entire codebase
  $ codexia complexity src/core           Analyze specific directory
  $ codexia complexity --top 20           Show 20 most complex files
  $ codexia complexity --include-symbols  Include function/class complexity
  $ codexia complexity --markdown         Output as markdown
`)
  .action(async (path, options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      await engine.initialize();

      const results = await engine.analyzeComplexity(path, {
        threshold: parseFloat(options.threshold),
        includeSymbols: options.includeSymbols,
      });

      if (globalOpts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      // Sort results
      const sortField = options.sort;
      results.files.sort((a: any, b: any) => {
        const aVal = a.metrics[sortField] ?? 0;
        const bVal = b.metrics[sortField] ?? 0;
        return sortField === 'maintainability' ? aVal - bVal : bVal - aVal;
      });

      // Limit to top N
      const topN = parseInt(options.top);
      const displayFiles = results.files.slice(0, topN);

      if (options.markdown) {
        console.log('# Complexity Analysis Report\n');
        console.log('| File | Maintainability | Cyclomatic | Cognitive | Coupling |');
        console.log('|------|-----------------|------------|-----------|----------|');
        for (const file of displayFiles) {
          console.log(`| ${file.file} | ${file.metrics.maintainability?.toFixed(1) ?? 'N/A'} | ${file.metrics.cyclomatic ?? 'N/A'} | ${file.metrics.cognitive ?? 'N/A'} | ${file.metrics.coupling ?? 'N/A'} |`);
        }
        return;
      }

      console.log(chalk.bold.cyan('\n📊 Complexity Analysis Report\n'));
      console.log(chalk.dim('─'.repeat(80)));

      // Summary
      console.log(chalk.bold('\nSummary:'));
      console.log(`  Total files analyzed: ${chalk.yellow(results.summary.totalFiles)}`);
      console.log(`  Average maintainability: ${getHealthColor(results.summary.averageMaintainability)}${results.summary.averageMaintainability.toFixed(1)}${chalk.reset()}`);
      console.log(`  Files needing attention: ${chalk.red(results.summary.filesNeedingAttention)}`);
      console.log(`  Critical complexity: ${chalk.red(results.summary.criticalFiles)}`);

      console.log(chalk.dim('\n─'.repeat(80)));
      console.log(chalk.bold(`\nTop ${topN} Most Complex Files:`));

      for (const file of displayFiles) {
        const m = file.metrics;
        const maintColor = getHealthColor(m.maintainability ?? 100);
        
        console.log(`\n  ${chalk.bold(file.file)}`);
        console.log(`    Maintainability: ${maintColor}${m.maintainability?.toFixed(1) ?? 'N/A'}${chalk.reset()}`);
        console.log(`    Cyclomatic:      ${chalk.yellow(m.cyclomatic ?? 'N/A')}`);
        console.log(`    Cognitive:       ${chalk.yellow(m.cognitive ?? 'N/A')}`);
        console.log(`    Coupling:        ${chalk.yellow(m.coupling ?? 'N/A')} (${m.afferent ?? 0} afferent, ${m.efferent ?? 0} efferent)`);

        if (options.includeSymbols && file.symbols?.length) {
          console.log(chalk.dim('    Top complex symbols:'));
          for (const sym of file.symbols.slice(0, 5)) {
            console.log(chalk.dim(`      - ${sym.name} (cyclomatic: ${sym.cyclomatic}, cognitive: ${sym.cognitive})`));
          }
        }
      }

      // Recommendations
      if (results.recommendations?.length) {
        console.log(chalk.dim('\n─'.repeat(80)));
        console.log(chalk.bold('\n💡 Recommendations:\n'));
        for (const rec of results.recommendations) {
          console.log(`  ${chalk.yellow('•')} ${rec}`);
        }
      }

      console.log();
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });

function getHealthColor(score: number): string {
  if (score >= 80) return chalk.green('');
  if (score >= 60) return chalk.yellow('');
  if (score >= 40) return chalk.hex('#FFA500')('');
  return chalk.red('');
}
