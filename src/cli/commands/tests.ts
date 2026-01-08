import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const testsCommand = new Command('tests')
  .description('Suggest tests for changed code')
  .option('-b, --base <ref>', 'Base ref for comparison', 'HEAD')
  .option('--staged', 'Analyze only staged changes')
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      
      const suggestions = await engine.suggestTests({
        base: options.base,
        staged: options.staged,
      });

      console.log(formatter.formatTests(suggestions));
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
