import { Command } from 'commander';
import chalk from 'chalk';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const listCommand = new Command('list')
  .description('List repositories registered for CodeGraph features')
  .action(async (_options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      const repos = await engine.listRegisteredRepos();

      if (globalOpts.json) {
        console.log(JSON.stringify(repos, null, 2));
        return;
      }

      if (repos.length === 0) {
        console.log('\nNo registered repositories.\n');
        return;
      }

      console.log(chalk.bold('\nRegistered Repositories\n'));
      for (const repo of repos) {
        console.log(`${chalk.cyan(repo.repoName)}  ${chalk.dim(repo.repoRoot)}`);
        console.log(`  Last analyzed: ${repo.lastAnalyzedAt || 'never'}`);
      }
      console.log('');
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
