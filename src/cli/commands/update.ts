import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const updateCommand = new Command('update')
  .description('Refresh the existing repository index after changes')
  .addHelpText('after', `
When to use:
  Run this after editing code so the local index matches the current tree.

Depends on:
  A repository that has already been indexed with \`codexia analyze\`.

Usually next:
  Run \`codexia status\` to confirm freshness, or \`codexia setup\` before \`codexia serve\` if you are wiring integrations.

Examples:
  $ codexia update
`)
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
