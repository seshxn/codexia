import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const impactCommand = new Command('impact')
  .description('Analyze impact of current git diff')
  .option('-b, --base <ref>', 'Base ref for comparison', 'HEAD')
  .option('--staged', 'Analyze only staged changes')
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      
      const impact = await engine.analyzeImpact({
        base: options.base,
        staged: options.staged,
      });

      const diff = options.staged 
        ? await engine.getStagedDiff()
        : await engine.getDiff(options.base);

      console.log(formatter.formatImpact(impact, diff));
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
