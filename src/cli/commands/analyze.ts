import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const analyzeCommand = new Command('analyze')
  .description('Index the current repository for later status and update checks')
  .option('--fast', 'Compatibility flag; uses the standard analyze path')
  .option('-f, --force', 'Force a full re-index')
  .addHelpText('after', `
When to use:
  Run this after cloning a repository or when you need a fresh local index.

Depends on:
  A repository checkout in the current directory.

Usually next:
  Run \`codexia status\` to confirm the index, or \`codexia update\` after code changes.

Notes:
  \`--fast\` does not change the analyze engine path; it only keeps the command-line shape stable.

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
