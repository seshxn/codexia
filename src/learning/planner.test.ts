import { describe, expect, it } from 'vitest';
import { ExecutionPlanner } from './planner.js';
import { IntentMapper } from './intent-map.js';
import type { SessionRecord } from '../codegraph/types.js';

const successfulSession = (taskDescription: string, filesRead: string[], filesEdited: string[] = []): SessionRecord => ({
  id: `session-${taskDescription}`,
  taskDescription,
  startedAt: new Date().toISOString(),
  endedAt: new Date().toISOString(),
  outcome: 'success',
  toolCalls: [],
  filesRead: filesRead.map((file, index) => ({
    path: file,
    order: index + 1,
  })),
  filesEdited: filesEdited.map((file) => ({
    path: file,
    linesChanged: 4,
  })),
});

describe('ExecutionPlanner', () => {
  it('builds a ranked plan from similar successful sessions', () => {
    const planner = new ExecutionPlanner();
    const sessions = [
      successfulSession('add authentication middleware', ['src/auth.ts', 'src/config.ts']),
      successfulSession('improve authentication token handling', ['src/auth.ts', 'src/token.ts']),
      successfulSession('fix billing retries', ['src/billing.ts']),
    ];

    const plan = planner.buildPlan('update authentication flow', sessions);

    expect(plan[0]?.file).toBe('src/auth.ts');
    expect(plan[0]?.confidence).toBeGreaterThan(0);
    expect(plan.some((step) => step.file === 'src/config.ts' || step.file === 'src/token.ts')).toBe(true);
  });
});

describe('IntentMapper', () => {
  it('maps an intent to historically relevant files', () => {
    const mapper = new IntentMapper();
    const sessions = [
      successfulSession('add rate limiting to API', ['src/routes.ts'], ['src/routes.ts', 'src/middleware/rate-limit.ts']),
      successfulSession('tighten API rate limiting', ['src/middleware/rate-limit.ts'], ['src/middleware/rate-limit.ts']),
      successfulSession('refresh dashboard widgets', ['src/dashboard.ts'], ['src/dashboard.ts']),
    ];

    const locations = mapper.locate('rate limit requests', sessions);

    expect(locations[0]?.file).toBe('src/middleware/rate-limit.ts');
    expect(locations[0]?.confidence).toBeGreaterThan(0);
  });
});
