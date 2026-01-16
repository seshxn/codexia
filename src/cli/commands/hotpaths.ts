import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import chalk from 'chalk';

export const hotpathsCommand = new Command('hotpaths')
  .description('Detect and analyze critical code paths')
  .option('-e, --entry <files>', 'Entry points (comma-separated)')
  .option('--auto-detect', 'Auto-detect entry points', true)
  .option('--top <n>', 'Show top N hot paths', '10')
  .option('--min-score <score>', 'Minimum criticality score', '0.5')
  .option('--trace <symbol>', 'Trace paths through specific symbol')
  .option('--impact <file>', 'Show impact on hot paths for a file')
  .addHelpText('after', `
Examples:
  $ codexia hotpaths                       Auto-detect and show hot paths
  $ codexia hotpaths -e src/index.ts       Analyze from specific entry
  $ codexia hotpaths --trace handleRequest Trace paths through symbol
  $ codexia hotpaths --impact src/db.ts    Show how file affects hot paths
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      await engine.initialize();

      const entryPoints = options.entry?.split(',');
      const minScore = parseFloat(options.minScore);
      const topN = parseInt(options.top);

      const analysis = await engine.analyzeHotPaths({
        entryPoints,
        autoDetect: options.autoDetect && !entryPoints,
        trace: options.trace,
        impactFile: options.impact,
      });

      if (globalOpts.json) {
        console.log(JSON.stringify(analysis, null, 2));
        return;
      }

      console.log(chalk.bold.cyan('\n🔥 Hot Path Analysis\n'));
      console.log(chalk.dim('─'.repeat(80)));

      // Entry points
      console.log(chalk.bold('\n📍 Entry Points Detected:\n'));
      for (const entry of analysis.entryPoints) {
        console.log(`  ${chalk.green('●')} ${chalk.cyan(entry.file)}`);
        console.log(chalk.dim(`    Type: ${entry.type} | Exports: ${entry.exports?.join(', ') || 'default'}`));
      }

      // Hot paths
      console.log(chalk.bold('\n🛤️  Critical Hot Paths:\n'));
      
      const filteredPaths = analysis.hotPaths
        .filter((p: any) => p.criticalityScore >= minScore)
        .slice(0, topN);

      if (filteredPaths.length === 0) {
        console.log(chalk.dim('  No hot paths detected above threshold.\n'));
      } else {
        for (let i = 0; i < filteredPaths.length; i++) {
          const path = filteredPaths[i];
          const scoreBar = '█'.repeat(Math.round(path.criticalityScore * 10));
          const scoreColor = path.criticalityScore >= 0.8 ? chalk.red :
                            path.criticalityScore >= 0.5 ? chalk.yellow :
                            chalk.green;

          console.log(`  ${chalk.bold(`#${i + 1}`)} ${chalk.cyan(path.name)}`);
          console.log(`    Score: ${scoreColor(scoreBar)} ${(path.criticalityScore * 100).toFixed(0)}%`);
          console.log(`    Depth: ${path.depth} | Nodes: ${path.nodeCount}`);
          
          // Show path
          console.log(chalk.dim('    Path:'));
          for (let j = 0; j < Math.min(5, path.nodes.length); j++) {
            const node = path.nodes[j];
            const indent = '    ' + '  '.repeat(j);
            const arrow = j > 0 ? '↳ ' : '';
            console.log(chalk.dim(`${indent}${arrow}${node.symbol} (${node.file.split('/').pop()})`));
          }
          if (path.nodes.length > 5) {
            console.log(chalk.dim(`      ... +${path.nodes.length - 5} more nodes`));
          }

          // Risk factors
          if (path.riskFactors?.length) {
            console.log(`    ${chalk.yellow('⚠')} Risks: ${path.riskFactors.join(', ')}`);
          }
          console.log();
        }
      }

      // Trace results
      if (options.trace && analysis.traceResults) {
        console.log(chalk.bold(`\n🔍 Trace: ${options.trace}\n`));
        if (analysis.traceResults.pathsThrough?.length) {
          console.log(`  Found in ${chalk.yellow(analysis.traceResults.pathsThrough.length)} hot paths:`);
          for (const path of analysis.traceResults.pathsThrough) {
            console.log(`    ${chalk.dim('•')} ${path.name} (score: ${(path.criticalityScore * 100).toFixed(0)}%)`);
          }
        } else {
          console.log(chalk.dim('  Symbol not found in any hot paths.\n'));
        }
      }

      // Impact analysis
      if (options.impact && analysis.impactAnalysis) {
        console.log(chalk.bold(`\n💥 Impact of ${options.impact}:\n`));
        const impact = analysis.impactAnalysis;
        
        console.log(`  Hot paths affected: ${chalk.red(impact.hotPathsAffected)} of ${analysis.hotPaths.length}`);
        console.log(`  Total impact score: ${chalk.yellow((impact.totalImpactScore * 100).toFixed(0))}%`);
        
        if (impact.affectedPaths?.length) {
          console.log(chalk.dim('\n  Affected paths:'));
          for (const p of impact.affectedPaths.slice(0, 5)) {
            console.log(`    ${chalk.dim('•')} ${p.name}`);
          }
        }

        if (impact.recommendations?.length) {
          console.log(chalk.bold('\n  💡 Recommendations:'));
          for (const rec of impact.recommendations) {
            console.log(`    ${chalk.yellow('•')} ${rec}`);
          }
        }
      }

      // Summary
      console.log(chalk.dim('─'.repeat(80)));
      console.log(chalk.bold('\n📊 Summary:\n'));
      console.log(`  Total entry points:      ${chalk.yellow(analysis.entryPoints.length)}`);
      console.log(`  Total hot paths:         ${chalk.yellow(analysis.hotPaths.length)}`);
      console.log(`  Critical paths (>80%):   ${chalk.red(analysis.hotPaths.filter((p: any) => p.criticalityScore >= 0.8).length)}`);
      console.log(`  Average path depth:      ${chalk.yellow(analysis.summary.averageDepth.toFixed(1))}`);
      console.log(`  Max path depth:          ${chalk.yellow(analysis.summary.maxDepth)}`);

      console.log();
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
