import type { IntentLocation, SessionRecord } from '../codegraph/types.js';

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);

const overlapScore = (intent: string, task: string): number => {
  const intentTokens = new Set(tokenize(intent));
  const taskTokens = new Set(tokenize(task));
  if (intentTokens.size === 0 || taskTokens.size === 0) {
    return 0;
  }

  let hits = 0;
  for (const token of intentTokens) {
    if (taskTokens.has(token)) {
      hits += 1;
    }
  }

  return hits / intentTokens.size;
};

export class IntentMapper {
  locate(intent: string, sessions: SessionRecord[]): IntentLocation[] {
    const fileScores = new Map<string, { score: number; evidence: number }>();

    for (const session of sessions) {
      const score = overlapScore(intent, session.taskDescription);
      if (score === 0) {
        continue;
      }

      const relevantFiles = session.filesEdited.length > 0 ? session.filesEdited.map((entry) => entry.path) : session.filesRead.map((entry) => entry.path);
      for (const file of relevantFiles) {
        const existing = fileScores.get(file) || { score: 0, evidence: 0 };
        existing.score += score;
        existing.evidence += 1;
        fileScores.set(file, existing);
      }
    }

    if (fileScores.size === 0) {
      return [];
    }

    const maxScore = Math.max(...Array.from(fileScores.values()).map((entry) => entry.score));
    return Array.from(fileScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 8)
      .map(([file, entry]) => ({
        file,
        confidence: Number((entry.score / maxScore).toFixed(2)),
        reason: `Matched against ${entry.evidence} similar historical task${entry.evidence === 1 ? '' : 's'}.`,
      }));
  }
}
