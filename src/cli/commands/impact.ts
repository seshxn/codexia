import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const impactCommand = new Command('impact')
  .description('Analyze impact of current git diff')
  .option('-b, --base <ref>', 'Base ref for comparison', 'HEAD')
  .option('--head <ref>', 'Head ref for comparison')
  .option('--staged', 'Analyze only staged changes')
  .addHelpText('after', `
Examples:
  $ codexia impact                        Analyze uncommitted changes
  $ codexia impact --staged               Analyze staged changes only
  $ codexia impact -b main                Compare current HEAD to main
  $ codexia impact -b HEAD~3 --head HEAD  Compare last 3 commits
  $ codexia impact --json                 Output as JSON
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      
      const impact = await engine.analyzeImpact({
        base: options.base,
        head: options.head,
        staged: options.staged,
      });

      const diff = options.staged 
        ? await engine.getStagedDiff()
        : await engine.getDiff(options.base, options.head);

      console.log(formatter.formatImpact(impact, diff));
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
