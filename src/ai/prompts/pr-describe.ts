import type { ImpactResult, CommitInfo } from '../../core/types.js';

export interface PrDescribeData {
  commits: CommitInfo[];
  impact: ImpactResult;
  filesChanged: number;
  additions: number;
  deletions: number;
}

/**
 * Build a prompt for generating a PR description
 */
export function buildPrDescriptionPrompt(data: PrDescribeData): string {
  const commitMessages = data.commits
    .slice(0, 20)
    .map(c => `- ${c.message}`)
    .join('\n');

  const changedSymbols = data.impact.directlyChanged
    .slice(0, 15)
    .map(c => `- ${c.changeType} ${c.symbol.kind} \`${c.symbol.name}\` in ${c.symbol.filePath}`)
    .join('\n');

  const affectedModules = data.impact.affectedModules
    .slice(0, 10)
    .map(m => `- ${m.path}: ${m.reason}`)
    .join('\n');

  const breakingChanges = data.impact.publicApiChanges
    .filter(c => c.changeType === 'breaking')
    .map(c => `- ${c.symbol}: ${c.description}`)
    .join('\n');

  return `You are helping a developer write a professional pull request description.

## Commits in this PR
${commitMessages || 'No commits yet'}

## Code Statistics
- **Files Changed:** ${data.filesChanged}
- **Lines:** +${data.additions} / -${data.deletions}

## Symbols Changed
${changedSymbols || 'No significant symbol changes'}

## Affected Modules
${affectedModules || 'Changes are self-contained'}

## Breaking Changes
${breakingChanges || 'None'}

## Your Task

Generate a well-structured PR description in Markdown with these sections:

## What
A brief 1-2 sentence summary of what this PR does.

## Why
The motivation and context for these changes (infer from commit messages and code changes).

## How
A technical explanation of the implementation approach.

## Testing
What testing was done or should be done (infer from file patterns).

## Breaking Changes
List any breaking changes, or state "None" if there are none.

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented above)

Be specific and technical. Use bullet points where appropriate.`;
}
