import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const prReportCommand = new Command('pr-report')
  .description('Generate a PR analysis report')
  .option('-b, --base <ref>', 'Base ref for comparison')
  .option('--head <ref>', 'Head ref for comparison')
  .addHelpText('after', `
Examples:
  $ codexia pr-report              Generate report for latest commit
  $ codexia pr-report -b main      Generate report comparing to main
  $ codexia pr-report --json       Output as JSON for CI integration
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const isJson = globalOpts.json || globalOpts.format === 'json';
    const isMarkdown = globalOpts.format === 'markdown';
    const formatter = new Formatter(isJson, isMarkdown);

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
