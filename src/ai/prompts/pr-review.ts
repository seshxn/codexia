import type { ImpactResult, ConventionViolation } from '../../core/types.js';

export interface PrReportData {
  summary: {
    filesChanged: number;
    additions: number;
    deletions: number;
    authors: string[];
  };
  impact: ImpactResult;
  conventions: ConventionViolation[];
  riskLevel: string;
  riskScore: number;
}

/**
 * Build a prompt for generating AI-powered PR review summary
 */
export function buildPrReviewPrompt(data: PrReportData): string {
  const changedFiles = data.summary.filesChanged;
  const additions = data.summary.additions;
  const deletions = data.summary.deletions;

  const directChanges = data.impact.directlyChanged
    .slice(0, 10)
    .map(c => `- ${c.changeType} ${c.symbol.kind} \`${c.symbol.name}\``)
    .join('\n');

  const affectedModules = data.impact.affectedModules
    .slice(0, 8)
    .map(m => `- ${m.path}: ${m.reason}`)
    .join('\n');

  const breakingChanges = data.impact.publicApiChanges
    .filter(c => c.changeType === 'breaking')
    .map(c => `- ${c.symbol}: ${c.description}`)
    .join('\n');

  const conventionIssues = data.conventions
    .slice(0, 5)
    .map(v => `- ${v.filePath}:${v.line}: ${v.message}`)
    .join('\n');

  const riskFactors = data.impact.riskScore.factors
    .map(f => `- ${f.name}: ${f.reason}`)
    .join('\n');

  return `You are a senior code reviewer providing a summary for a pull request.

## PR Statistics
- **Files Changed:** ${changedFiles}
- **Lines:** +${additions} / -${deletions}
- **Risk Level:** ${data.riskLevel} (${data.riskScore}/100)
- **Authors:** ${data.summary.authors.join(', ')}

## Direct Changes
${directChanges || 'No symbol-level changes detected'}

## Modules Affected by Changes
${affectedModules || 'Changes are self-contained'}

## Breaking Changes
${breakingChanges || 'None detected'}

## Convention Violations
${conventionIssues || 'None'}

## Risk Factors
${riskFactors || 'Low risk change'}

## Your Task

Write a professional code review summary (4-6 sentences) that:
1. Describes what this PR accomplishes at a high level
2. Identifies the areas of highest risk or complexity
3. Mentions any breaking changes or convention issues that need attention
4. Provides 1-2 specific suggestions for the author or reviewers
5. Recommends specific team members to review based on affected areas (if applicable)

Be constructive and actionable. Avoid generic statements.`;
}
