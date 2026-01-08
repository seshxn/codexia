import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const scanCommand = new Command('scan')
  .description('Scan and index the repository')
  .action(async (_options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    console.log('Scanning repository...');

    try {
      const engine = new CodexiaEngine();
      const result = await engine.scan();
      console.log(formatter.formatScan(result));
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
