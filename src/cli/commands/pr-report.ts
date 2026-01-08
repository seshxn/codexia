import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const prReportCommand = new Command('pr-report')
  .description('Generate a PR analysis report')
  .option('-b, --base <ref>', 'Base ref for comparison')
  .option('--head <ref>', 'Head ref for comparison')
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      
      const report = await engine.generatePrReport({
        base: options.base,
        head: options.head,
      });

      console.log(formatter.formatPrReport(report));
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
