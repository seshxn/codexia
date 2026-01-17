import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import chalk from 'chalk';

export const historyCommand = new Command('history')
  .description('Analyze git history and temporal patterns')
  .argument('[file]', 'File to analyze (optional, analyzes all if omitted)')
  .option('--since <date>', 'Analyze commits since date (e.g., "6 months ago")', '1 year ago')
  .option('--churn', 'Show churn analysis (frequently changed files)')
  .option('--ownership', 'Show code ownership and bus factor')
  .option('--coupling', 'Show temporal coupling (files changed together)')
  .option('--regression-risk', 'Show regression-prone areas')
  .option('--top <n>', 'Show top N results', '15')
  .addHelpText('after', `
Examples:
  $ codexia history                        Full temporal analysis
  $ codexia history --churn                Show file churn rates
  $ codexia history --ownership            Show ownership analysis
  $ codexia history --coupling             Show co-change patterns
  $ codexia history --regression-risk      Find regression-prone code
  $ codexia history src/core/types.ts      Analyze specific file
`)
  .action(async (file, options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      await engine.initialize();

      const analysis = await engine.analyzeHistory({
        file,
        since: options.since,
        includeChurn: options.churn || (!options.ownership && !options.coupling && !options.regressionRisk),
        includeOwnership: options.ownership || (!options.churn && !options.coupling && !options.regressionRisk),
        includeCoupling: options.coupling || (!options.churn && !options.ownership && !options.regressionRisk),
        includeRegressionRisk: options.regressionRisk || (!options.churn && !options.ownership && !options.coupling),
      });

      if (globalOpts.json) {
        console.log(JSON.stringify(analysis, null, 2));
        return;
      }

      const topN = parseInt(options.top);

      console.log(chalk.bold.cyan('\n📜 Temporal Analysis Report\n'));
      console.log(chalk.dim(`Analyzing commits since: ${options.since}`));
      console.log(chalk.dim('─'.repeat(80)));

      // Churn analysis
      if (analysis.churn?.length) {
        console.log(chalk.bold('\n🔄 File Churn (Most Frequently Changed):\n'));
        for (const item of analysis.churn.slice(0, topN)) {
          const churnBar = '█'.repeat(Math.min(20, Math.round(item.churnRate * 20)));
          const stability = item.stability >= 0.8 ? chalk.green('stable') :
                           item.stability >= 0.5 ? chalk.yellow('moderate') :
                           chalk.red('volatile');
          console.log(`  ${chalk.cyan(item.file)}`);
          console.log(`    Changes: ${chalk.yellow(item.commits)} commits, ${chalk.yellow(item.additions)}+ ${chalk.yellow(item.deletions)}-`);
          console.log(`    Churn:   ${chalk.dim(churnBar)} (${(item.churnRate * 100).toFixed(0)}%)`);
          console.log(`    Status:  ${stability}`);
          console.log();
        }
      }

      // Ownership analysis
      if (analysis.ownership?.length) {
        console.log(chalk.bold('\n👥 Code Ownership & Bus Factor:\n'));
        for (const item of analysis.ownership.slice(0, topN)) {
          const riskLevel = item.busFactor <= 1 ? chalk.red('HIGH RISK') :
                           item.busFactor <= 2 ? chalk.yellow('MEDIUM RISK') :
                           chalk.green('LOW RISK');
          console.log(`  ${chalk.cyan(item.file)}`);
          console.log(`    Primary owner:  ${chalk.bold(item.primaryOwner)} (${(item.ownershipPercentage * 100).toFixed(0)}%)`);
          console.log(`    Contributors:   ${item.totalContributors}`);
          console.log(`    Bus factor:     ${item.busFactor} ${riskLevel}`);
          console.log();
        }
      }

      // Temporal coupling
      if (analysis.coupling?.length) {
        console.log(chalk.bold('\n🔗 Temporal Coupling (Files Changed Together):\n'));
        for (const item of analysis.coupling.slice(0, topN)) {
          const strength = item.couplingStrength >= 0.8 ? chalk.red('STRONG') :
                          item.couplingStrength >= 0.5 ? chalk.yellow('MODERATE') :
                          chalk.dim('WEAK');
          console.log(`  ${chalk.cyan(item.file1)} ${chalk.dim('↔')} ${chalk.cyan(item.file2)}`);
          console.log(`    Co-changes: ${chalk.yellow(item.coChanges)} times (${(item.couplingStrength * 100).toFixed(0)}% correlation)`);
          console.log(`    Coupling:   ${strength}`);
          if (item.suggestedRefactor) {
            console.log(`    ${chalk.yellow('💡')} ${item.suggestedRefactor}`);
          }
          console.log();
        }
      }

      // Regression risk
      if (analysis.regressionRisk?.length) {
        console.log(chalk.bold('\n⚠️  Regression-Prone Areas:\n'));
        for (const item of analysis.regressionRisk.slice(0, topN)) {
          const riskBar = '█'.repeat(Math.min(10, Math.round(item.riskScore * 10)));
          const riskColor = item.riskScore >= 0.7 ? chalk.red : 
                           item.riskScore >= 0.4 ? chalk.yellow : chalk.dim;
          console.log(`  ${chalk.cyan(item.file)}`);
          console.log(`    Risk score:    ${riskColor(riskBar)} ${(item.riskScore * 100).toFixed(0)}%`);
          console.log(`    Bug-fix ratio: ${chalk.yellow((item.bugFixRatio * 100).toFixed(0))}% of commits`);
          console.log(`    Recent issues: ${chalk.yellow(item.recentIssues)} in last 3 months`);
          if (item.riskFactors?.length) {
            console.log(`    Risk factors:  ${item.riskFactors.join(', ')}`);
          }
          console.log();
        }
      }

      // Summary
      console.log(chalk.dim('─'.repeat(80)));
      console.log(chalk.bold('\n📊 Summary:\n'));
      if (analysis.summary) {
        console.log(`  Total files analyzed:     ${chalk.yellow(analysis.summary.totalFiles ?? analysis.summary.filesAnalyzed ?? 0)}`);
        console.log(`  Total commits analyzed:   ${chalk.yellow(analysis.summary.totalCommits ?? 'N/A')}`);
        console.log(`  High-risk files:          ${chalk.red(analysis.summary.highRiskFiles ?? analysis.summary.riskFileCount ?? 0)}`);
        console.log(`  Single-owner files:       ${chalk.yellow(analysis.summary.singleOwnerFiles ?? 0)}`);
        console.log(`  Highly coupled pairs:     ${chalk.yellow(analysis.summary.highlyCoupledPairs ?? 0)}`);
      } else {
        console.log(chalk.dim('  Summary data not available.'));
      }

      console.log();
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
