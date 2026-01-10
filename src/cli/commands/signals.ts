import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const signalsCommand = new Command('signals')
  .description('Detect code quality signals (orphan code, god classes, circular deps)')
  .option('--orphans', 'Check for orphan (unused exported) code')
  .option('--god-classes', 'Check for overly large files')
  .option('--cycles', 'Check for circular dependencies')
  .addHelpText('after', `
Examples:
  $ codexia signals              Run all signal checks
  $ codexia signals --orphans    Check for unused exports only
  $ codexia signals --cycles     Check for circular dependencies only
  $ codexia signals --json       Output as JSON for tooling
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    console.log('Analyzing code signals...\n');

    try {
      const engine = new CodexiaEngine();
      const signals = await engine.analyzeSignals({
        checkOrphans: options.orphans ?? true,
        checkGodClasses: options.godClasses ?? true,
        checkCycles: options.cycles ?? true,
      });

      console.log(formatter.formatSignals(signals));
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
