import { Command } from 'commander';
import chalk from 'chalk';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const statusCommand = new Command('status')
  .description('Show CodeGraph status for the current repository')
  .action(async (_options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      const status = await engine.getRepoStatus();

      if (globalOpts.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      console.log(chalk.bold('\nCodeGraph Status\n'));
      console.log(`Repository:       ${chalk.cyan(status.repoName)}`);
      console.log(`Indexed:          ${status.analyzed ? chalk.green('yes') : chalk.yellow('no')}`);
      console.log(`Stale:            ${status.isStale ? chalk.yellow('yes') : chalk.green('no')}`);
      console.log(`Last analyzed:    ${status.lastAnalyzedAt || 'never'}`);
      console.log(`Last updated:     ${status.lastUpdatedAt || 'never'}`);
      console.log(`Sessions logged:  ${status.sessionsRecorded}`);
      if (status.stats) {
        console.log(`Files:            ${status.stats.files}`);
        console.log(`Symbols:          ${status.stats.symbols}`);
        console.log(`Exports:          ${status.stats.exports}`);
        console.log(`Avg fan-out:      ${status.stats.avgFanOut}`);
      }
      console.log('');
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
