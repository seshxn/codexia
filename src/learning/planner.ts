import type { PlanStep, SessionRecord } from '../codegraph/types.js';

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);

const similarity = (left: string, right: string): number => {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
};

export class ExecutionPlanner {
  buildPlan(task: string, sessions: SessionRecord[]): PlanStep[] {
    const scoredSessions = sessions
      .filter((session) => session.outcome === 'success' && session.filesRead.length > 0)
      .map((session) => ({
        session,
        score: similarity(task, session.taskDescription),
      }))
      .filter((item) => item.score > 0);

    if (scoredSessions.length === 0) {
      return [];
    }

    const fileScores = new Map<string, { score: number; reads: number }>();

    for (const item of scoredSessions) {
      for (const read of item.session.filesRead) {
        const weight = item.score / read.order;
        const existing = fileScores.get(read.path) || { score: 0, reads: 0 };
        existing.score += weight;
        existing.reads += 1;
        fileScores.set(read.path, existing);
      }
    }

    const topScore = Math.max(...Array.from(fileScores.values()).map((entry) => entry.score));
    return Array.from(fileScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 8)
      .map(([file, entry]) => ({
        file,
        confidence: Number((entry.score / topScore).toFixed(2)),
        reason: `Derived from ${entry.reads} successful session${entry.reads === 1 ? '' : 's'} with similar task wording.`,
      }));
  }
}
