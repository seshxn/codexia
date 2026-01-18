import type { ImpactResult } from '../../core/types.js';

/**
 * Build a prompt for explaining impact analysis results
 */
export function buildImpactExplanationPrompt(impact: ImpactResult): string {
  const changedSymbols = impact.directlyChanged
    .slice(0, 15)
    .map(c => `- ${c.changeType.toUpperCase()}: ${c.symbol.kind} \`${c.symbol.name}\` in ${c.symbol.filePath}`)
    .join('\n');

  const affectedModules = impact.affectedModules
    .slice(0, 10)
    .map(m => `- ${m.path} (${m.reason}, distance: ${m.distance})`)
    .join('\n');

  const breakingChanges = impact.publicApiChanges
    .filter(c => c.changeType === 'breaking')
    .slice(0, 5)
    .map(c => `- ${c.symbol}: ${c.description}`)
    .join('\n');

  const riskFactors = impact.riskScore.factors
    .slice(0, 5)
    .map(f => `- ${f.name} (+${f.weight}): ${f.reason}`)
    .join('\n');

  return `You are a senior software engineer helping explain code change impact to a development team.

## Analysis Results

**Risk Score:** ${impact.riskScore.overall}/100

### Changed Symbols
${changedSymbols || 'None detected'}

### Affected Modules (Transitive Impact)
${affectedModules || 'None - changes are isolated'}

### Breaking API Changes
${breakingChanges || 'None'}

### Risk Factors
${riskFactors || 'Low risk change'}

## Your Task

Write a clear, concise explanation (3-5 sentences) that:
1. Summarizes what was changed and its scope
2. Highlights the most significant downstream impacts
3. Notes any breaking changes or high-risk areas
4. Provides one actionable recommendation

Use plain language that both senior and junior developers can understand. Be specific about file names and module boundaries.`;
}
