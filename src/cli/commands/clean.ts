import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const cleanCommand = new Command('clean')
  .description('Remove CodeGraph-generated index data for the current repository')
  .action(async (_options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      await engine.cleanRepository();

      if (globalOpts.json) {
        console.log(JSON.stringify({ success: true }, null, 2));
      } else {
        console.log('\nRemoved CodeGraph index data for this repository.\n');
      }
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
