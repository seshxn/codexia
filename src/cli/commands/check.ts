import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const checkCommand = new Command('check')
  .description('Check code against project conventions')
  .option('-b, --base <ref>', 'Base ref for comparison', 'HEAD')
  .option('--staged', 'Check only staged changes')
  .addHelpText('after', `
Examples:
  $ codexia check              Check convention violations in changes
  $ codexia check --staged     Check staged changes only
  $ codexia check -b main      Check changes since main branch
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      
      const violations = await engine.checkConventions({
        base: options.base,
        staged: options.staged,
      });

      console.log(formatter.formatConventions(violations));
      
      // Exit with error if there are violations
      const errors = violations.filter(v => v.convention.severity === 'error');
      if (errors.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
