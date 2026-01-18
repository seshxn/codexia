import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import { isAIEnabled, getAIExplainer } from '../../ai/index.js';

export const prReportCommand = new Command('pr-report')
  .description('Generate a PR analysis report')
  .option('-b, --base <ref>', 'Base ref for comparison')
  .option('--head <ref>', 'Head ref for comparison')
  .option('--ai', 'Use AI to generate PR summary and review')
  .option('--describe', 'Generate AI description for the PR')
  .addHelpText('after', `
Examples:
  $ codexia pr-report              Generate report for latest commit
  $ codexia pr-report -b main      Generate report comparing to main
  $ codexia pr-report --ai         Include AI-powered review summary
  $ codexia pr-report --describe   Generate AI PR description
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

      // AI features
      if ((options.ai || options.describe) && isAIEnabled()) {
        const explainer = getAIExplainer();
        
        if (explainer) {
          console.log('\n');
          
          if (options.ai) {
            console.log('🤖 AI Review Summary\n');
            // Adapt report to PrReportData format
            const prReportData = {
              summary: {
                filesChanged: report.summary.filesChanged,
                additions: report.summary.additions,
                deletions: report.summary.deletions,
                authors: report.summary.authors,
              },
              impact: report.impact,
              conventions: report.conventions || [],
              riskLevel: report.risks.level,
              riskScore: report.risks.score,
            };
            const review = await explainer.reviewPr(prReportData);
            console.log(review.summary || 'Unable to generate AI review.');
            
            if (review.recommendations?.length) {
              console.log('\n📝 Recommendations:');
              review.recommendations.forEach((r: string, i: number) => console.log(`  ${i + 1}. ${r}`));
            }
          }
          
          if (options.describe) {
            console.log('\n📋 AI-Generated PR Description\n');
            const prDescribeData = {
              commits: [],
              filesChanged: report.summary.filesChanged,
              additions: report.summary.additions,
              deletions: report.summary.deletions,
              impact: report.impact,
            };
            const description = await explainer.describePr(prDescribeData);
            console.log(description || 'Unable to generate description.');
          }
        }
      } else if (options.ai || options.describe) {
        console.log('\n⚠️  AI features require configuration. Set CODEXIA_AI_PROVIDER and CODEXIA_AI_API_KEY environment variables.');
      }
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
