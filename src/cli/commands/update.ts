import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const updateCommand = new Command('update')
  .description('Refresh the CodeGraph index for the current repository')
  .action(async (_options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      const result = await engine.updateRepository();
      console.log(formatter.formatScan(result));
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
