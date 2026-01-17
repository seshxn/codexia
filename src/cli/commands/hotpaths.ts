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

      // Entry points - handle missing entryPoints gracefully
      const detectedEntryPoints = analysis.entryPoints || [];
      if (detectedEntryPoints.length > 0) {
        console.log(chalk.bold('\\n📍 Entry Points Detected:\\n'));
        for (const entry of detectedEntryPoints) {
          console.log(`  ${chalk.green('●')} ${chalk.cyan(entry.file || entry)}`);
          if (entry.type) {
            console.log(chalk.dim(`    Type: ${entry.type} | Exports: ${entry.exports?.join(', ') || 'default'}`));
          }
        }
      } else {
        console.log(chalk.bold('\n📍 Entry Points:\n'));
        console.log(chalk.dim('  No explicit entry points detected. Using dependency roots.\n'));
      }

      // Hot paths - engine returns 'paths' field
      const hotPaths = analysis.paths || [];

      // Hot paths
      console.log(chalk.bold('\n🛤️  Critical Hot Paths:\n'));
      
      const filteredPaths = hotPaths
        .filter((p: any) => (p.criticalityScore || 0.5) >= minScore)
        .slice(0, topN);

      if (filteredPaths.length === 0) {
        console.log(chalk.dim('  No hot paths detected above threshold.\n'));
      } else {
        for (let i = 0; i < filteredPaths.length; i++) {
          const path = filteredPaths[i];
          const score = path.criticalityScore ?? 0.5;
          const scoreBar = '█'.repeat(Math.round(score * 10));
          const scoreColor = score >= 0.8 ? chalk.red :
                            score >= 0.5 ? chalk.yellow :
                            chalk.green;

          console.log(`  ${chalk.bold(`#${i + 1}`)} ${chalk.cyan(path.name || path.id || 'Unnamed path')}`);
          console.log(`    Score: ${scoreColor(scoreBar)} ${(score * 100).toFixed(0)}%`);
          console.log(`    Criticality: ${path.criticality || 'medium'}`);
          
          // Show path nodes if available
          const nodes = path.nodes || [];
          if (nodes.length > 0) {
            console.log(chalk.dim('    Path:'));
            for (let j = 0; j < Math.min(5, nodes.length); j++) {
              const node = nodes[j];
              const indent = '    ' + '  '.repeat(j);
              const arrow = j > 0 ? '↳ ' : '';
              const nodeName = node.symbol || node.path?.split('/').pop() || 'unknown';
              const fileName = node.file?.split('/').pop() || node.path?.split('/').pop() || '';
              console.log(chalk.dim(`${indent}${arrow}${nodeName}${fileName ? ` (${fileName})` : ''}`));
            }
            if (nodes.length > 5) {
              console.log(chalk.dim(`      ... +${nodes.length - 5} more nodes`));
            }
          }

          // Description if available
          if (path.description) {
            console.log(chalk.dim(`    ${path.description}`));
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
      console.log(`  Total entry points:      ${chalk.yellow(detectedEntryPoints.length)}`);
      console.log(`  Total hot paths:         ${chalk.yellow(hotPaths.length)}`);
      console.log(`  Critical paths (>80%):   ${chalk.red(hotPaths.filter((p: any) => (p.criticalityScore || 0) >= 0.8).length)}`);
      if (analysis.summary?.averageDepth !== undefined) {
        console.log(`  Average path depth:      ${chalk.yellow(analysis.summary.averageDepth.toFixed(1))}`);
        console.log(`  Max path depth:          ${chalk.yellow(analysis.summary.maxDepth)}`);
      }

      console.log();
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
