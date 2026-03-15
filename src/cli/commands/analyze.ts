import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const analyzeCommand = new Command('analyze')
  .description('Analyze the repository and register it for CodeGraph features')
  .option('--fast', 'Analyze structural information only')
  .option('-f, --force', 'Force a full re-index')
  .addHelpText('after', `
Examples:
  $ codexia analyze
  $ codexia analyze --fast
  $ codexia analyze --force
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      const result = await engine.analyzeRepository({ force: Boolean(options.force) });

      if (options.fast && !globalOpts.json) {
        console.log('Fast mode selected: using the existing structural index pipeline.');
      }

      console.log(formatter.formatScan(result));
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
