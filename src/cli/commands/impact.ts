import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import { isAIEnabled, getAIExplainer } from '../../ai/index.js';

export const impactCommand = new Command('impact')
  .description('Analyze impact of current git diff')
  .option('-b, --base <ref>', 'Base ref for comparison', 'HEAD')
  .option('--head <ref>', 'Head ref for comparison')
  .option('--staged', 'Analyze only staged changes')
  .option('--ai', 'Use AI to explain the impact of changes')
  .option('--explain', 'Alias for --ai')
  .addHelpText('after', `
Examples:
  $ codexia impact                        Analyze uncommitted changes
  $ codexia impact --staged               Analyze staged changes only
  $ codexia impact -b main                Compare current HEAD to main
  $ codexia impact -b HEAD~3 --head HEAD  Compare last 3 commits
  $ codexia impact --ai                   Include AI explanation
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

      // AI explanation
      if ((options.ai || options.explain) && isAIEnabled()) {
        const explainer = getAIExplainer();
        
        if (explainer) {
          console.log('\n🤖 AI Impact Analysis\n');
          const explanation = await explainer.explainImpact(impact);
          
          console.log(explanation.summary || 'Unable to generate AI explanation.');
          
          if (explanation.details) {
            console.log(`\n${explanation.details}`);
          }
          
          if (explanation.recommendations?.length) {
            console.log('\n📝 Recommendations:');
            explanation.recommendations.forEach((r: string, i: number) => console.log(`  ${i + 1}. ${r}`));
          }
        }
      } else if (options.ai || options.explain) {
        console.log('\n⚠️  AI features require configuration. Set CODEXIA_AI_PROVIDER and CODEXIA_AI_API_KEY environment variables.');
      }
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
