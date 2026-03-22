export interface JiraFlowIssueChange {
  from?: string;
  to?: string;
  at: string;
}

export interface JiraFlowIssue {
  key: string;
  projectKey: string;
  issueType: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
  labels: string[];
  changelog: JiraFlowIssueChange[];
}

export interface JiraFlowMetricsReport {
  summary: {
    throughput: number;
    unplannedWorkRatio: number;
    reopenRate: number;
    blockedAgingHours: number;
  };
  queueVsActive: {
    queueHours: number;
    activeHours: number;
  };
  issueTypes: Array<{
    issueType: string;
    throughput: number;
    medianCycleTimeHours: number;
    medianLeadTimeHours: number;
  }>;
  trends: {
    forecastReliability: number;
  };
}

const DONE_PATTERN = /(done|closed|resolved)/i;
const ACTIVE_PATTERN = /(in progress|progress|review|testing|qa|develop)/i;
const BLOCKED_PATTERN = /(blocked|waiting|hold)/i;

export const computeJiraFlowMetrics = (
  issues: JiraFlowIssue[],
  options: { lookbackDays: number; now?: string },
): JiraFlowMetricsReport => {
  const now = new Date(options.now || new Date().toISOString());
  const lookbackStart = new Date(now.getTime() - options.lookbackDays * 24 * 60 * 60 * 1000);
  const scoped = issues.filter((issue) => new Date(issue.createdAt) >= lookbackStart);
  const resolved = scoped.filter((issue) => issue.resolvedAt);
  const reopened = scoped.filter((issue) => issue.changelog.some((change) => isDoneStatus(change.from) && !isDoneStatus(change.to)));
  const unplanned = scoped.filter((issue) => issue.labels.some((label) => label.toLowerCase() === 'unplanned') || /bug|incident/i.test(issue.issueType));

  const queueVsActive = scoped.reduce(
    (acc, issue) => {
      const durations = computeStatusDurations(issue, now);
      acc.queueHours += durations.queueHours;
      acc.activeHours += durations.activeHours;
      return acc;
    },
    { queueHours: 0, activeHours: 0 },
  );

  const blockedAgingHours = scoped
    .filter((issue) => BLOCKED_PATTERN.test(issue.status))
    .reduce((sum, issue) => sum + hoursBetween(issue.createdAt, now.toISOString()), 0);

  const issueTypes = Array.from(new Set(scoped.map((issue) => issue.issueType)))
    .sort((a, b) => a.localeCompare(b))
    .map((issueType) => {
      const items = scoped.filter((issue) => issue.issueType === issueType);
      const completed = items.filter((issue) => issue.resolvedAt);
      return {
        issueType,
        throughput: completed.length,
        medianCycleTimeHours: round(median(completed.map((issue) => computeCycleTimeHours(issue))), 1),
        medianLeadTimeHours: round(median(completed.map((issue) => hoursBetween(issue.createdAt, issue.resolvedAt!))), 1),
      };
    });

  const throughput = resolved.length;
  const createdCount = scoped.length;
  const forecastReliability = createdCount > 0 ? round((throughput / createdCount) * 100, 1) : 0;

  return {
    summary: {
      throughput,
      unplannedWorkRatio: scoped.length > 0 ? round((unplanned.length / scoped.length) * 100, 1) : 0,
      reopenRate: scoped.length > 0 ? round((reopened.length / scoped.length) * 100, 1) : 0,
      blockedAgingHours: round(blockedAgingHours, 1),
    },
    queueVsActive: {
      queueHours: round(queueVsActive.queueHours, 1),
      activeHours: round(queueVsActive.activeHours, 1),
    },
    issueTypes,
    trends: {
      forecastReliability,
    },
  };
};

const computeCycleTimeHours = (issue: JiraFlowIssue): number => {
  const start = issue.changelog.find((change) => ACTIVE_PATTERN.test(change.to || ''))?.at || issue.createdAt;
  const end = issue.resolvedAt || issue.createdAt;
  return hoursBetween(start, end);
};

const computeStatusDurations = (issue: JiraFlowIssue, now: Date): { queueHours: number; activeHours: number } => {
  const sorted = issue.changelog.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let queueHours = 0;
  let activeHours = 0;

  if (sorted.length > 0) {
    queueHours += hoursBetween(issue.createdAt, sorted[0].at);
  }

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const end = next?.at || issue.resolvedAt || now.toISOString();
    const duration = hoursBetween(current.at, end);
    const target = current.to || issue.status;
    if (ACTIVE_PATTERN.test(target) || BLOCKED_PATTERN.test(target)) {
      activeHours += duration;
    } else if (!isDoneStatus(target)) {
      queueHours += duration;
    }
  }

  if (sorted.length === 0) {
    queueHours += hoursBetween(issue.createdAt, issue.resolvedAt || now.toISOString());
  }

  return { queueHours, activeHours };
};

const isDoneStatus = (value?: string): boolean => DONE_PATTERN.test(value || '');

const hoursBetween = (start: string, end: string): number => {
  const delta = Date.parse(end) - Date.parse(start);
  return Math.max(0, delta / (1000 * 60 * 60));
};

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};

const round = (value: number, precision: number): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};
