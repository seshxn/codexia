interface JiraApiBoard {
  id: number;
  name: string;
  type?: string;
  location?: {
    projectId?: number;
    projectKey?: string;
    projectName?: string;
  };
}

interface JiraApiSprint {
  id: number;
  name: string;
  state: 'future' | 'active' | 'closed' | string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
  originBoardId?: number;
}

interface JiraApiPaginatedResponse<T> {
  maxResults: number;
  startAt: number;
  isLast?: boolean;
  total?: number;
  values: T[];
}

interface JiraField {
  id: string;
  name: string;
}

interface JiraChangeItem {
  field: string;
  fieldId?: string;
  from?: string | null;
  fromString?: string | null;
  to?: string | null;
  toString?: string | null;
}

interface JiraChangeHistory {
  created: string;
  items: JiraChangeItem[];
}

interface JiraIssue {
  key: string;
  fields: Record<string, unknown>;
  changelog?: {
    histories: JiraChangeHistory[];
  };
}

interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
  nextPageToken?: string;
}

interface JiraGreenhopperIssueStatistic {
  statFieldId?: string;
  statFieldValue?: {
    value?: number | string;
  } | null;
}

interface JiraGreenhopperIssue {
  key?: string;
  estimateStatistic?: JiraGreenhopperIssueStatistic;
  currentEstimateStatistic?: JiraGreenhopperIssueStatistic;
}

interface JiraGreenhopperSprintReport {
  contents?: {
    completedIssues?: JiraGreenhopperIssue[];
    issuesNotCompletedInCurrentSprint?: JiraGreenhopperIssue[];
    puntedIssues?: JiraGreenhopperIssue[];
    issueKeysAddedDuringSprint?: Record<string, unknown>;
  };
}

interface SprintMembershipEvent {
  type: 'enter' | 'leave';
  at: Date;
}

interface SprintPointChanges {
  eventCount: number;
  absoluteDelta: number;
  netDelta: number;
}

interface SprintIssueSearchResult {
  issues: JiraIssue[];
  coverage: 'full' | 'partial';
  truncated: boolean;
}

interface JiraSearchIssuesResult {
  issues: JiraIssue[];
  truncated: boolean;
}

interface JiraCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface JiraConfig {
  enabled: boolean;
  baseUrl: string | null;
  authMode: 'none' | 'basic' | 'bearer';
  message: string;
}

export interface JiraBoardSummary {
  id: number;
  name: string;
  type: string;
  projectKey: string | null;
  projectName: string | null;
}

export interface JiraSprintSummary {
  id: number;
  name: string;
  state: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

export interface JiraSprintReport {
  board: {
    id: number;
    name: string;
  };
  sprint: JiraSprintSummary;
  metrics: {
    issues: {
      total: number;
      committed: number;
      completedByEnd: number;
      completionRate: number;
      addedAfterStart: number;
      removedDuringSprint: number;
      carryover: number;
    };
    points: {
      committed: number;
      completedByEnd: number;
      completionRate: number;
      addedAfterStart: number;
      removedDuringSprint: number;
      absoluteChangeDuringSprint: number;
      netChangeDuringSprint: number;
      changedIssueCount: number;
      changeEventCount: number;
      currentScope: number;
      remaining: number;
    };
  };
  health: {
    status: 'on_track' | 'at_risk' | 'off_track' | 'completed' | 'unknown';
    score: number;
    elapsedPct: number;
    completionPct: number;
    paceDelta: number;
    remainingDays: number;
    requiredPointsPerDay: number;
    summary: string;
  };
  integrity: {
    risk: 'low' | 'medium' | 'high';
    score: number;
    flags: string[];
    indicators: {
      scopeCreepPct: number;
      pointChurnPct: number;
      carryoverPct: number;
      removedPct: number;
    };
  };
}

export interface JiraBoardHistoryReport {
  board: {
    id: number;
    name: string;
  };
  summary: {
    sprintsAnalyzed: number;
    averageCompletionRate: number;
    averageScopeCreepPct: number;
    averagePointChurnPct: number;
    averageIntegrityScore: number;
    onTrackLikeSprints: number;
    riskDistribution: {
      low: number;
      medium: number;
      high: number;
    };
  };
  sprints: Array<{
    id: number;
    name: string;
    state: string;
    startDate?: string;
    endDate?: string;
    completeDate?: string;
    goal?: string;
    completionRate: number;
    committedPoints: number;
    completedPoints: number;
    scopeCreepPct: number;
    pointChurnPct: number;
    carryoverPct: number;
    integrityRisk: 'low' | 'medium' | 'high';
    integrityScore: number;
    healthStatus: JiraSprintReport['health']['status'];
    flags: string[];
  }>;
}

class JiraConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JiraConfigError';
  }
}

/**
 * Jira analytics adapter used by the dashboard API.
 *
 * Credentials are read from environment variables:
 * - CODEXIA_JIRA_BASE_URL (required)
 * - CODEXIA_JIRA_EMAIL + CODEXIA_JIRA_API_TOKEN (basic auth), or
 * - CODEXIA_JIRA_BEARER_TOKEN (bearer auth)
 */
export class JiraAnalyticsService {
  private readonly baseUrl: string | null;
  private readonly basicAuth: string | null;
  private readonly bearerToken: string | null;
<<<<<<< HEAD
  private readonly useGreenhopperSprintReport: boolean;
||||||| 83e9878
=======
  private readonly requestRetryMax: number;
  private readonly requestRetryBaseMs: number;
  private readonly requestRetryMaxMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxIssuesPerSprint: number;
  private readonly sprintSearchTimeBudgetMs: number;
  private readonly sprintMembershipMode: 'currentOnly' | 'auto';
  private readonly cacheTtlMs: number;
  private readonly boardHistoryTimeBudgetMs: number;
  private sprintHistoryJqlMode: 'unknown' | 'was' | 'changed' | 'currentOnly' = 'unknown';
  private readonly sprintReportCache = new Map<string, JiraCacheEntry<JiraSprintReport>>();
  private readonly boardHistoryCache = new Map<string, JiraCacheEntry<JiraBoardHistoryReport>>();
  private readonly sprintReportInFlight = new Map<string, Promise<JiraSprintReport>>();
  private readonly boardHistoryInFlight = new Map<string, Promise<JiraBoardHistoryReport>>();
>>>>>>> main
  private storyPointsFieldId: string | null | undefined;
  private sprintFieldId: string | null | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const rawBaseUrl = (env.CODEXIA_JIRA_BASE_URL || '').trim();
    this.baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/$/, '') : null;

    const email = (env.CODEXIA_JIRA_EMAIL || '').trim();
    const apiToken = (env.CODEXIA_JIRA_API_TOKEN || '').trim();
    this.basicAuth = email && apiToken
      ? Buffer.from(`${email}:${apiToken}`).toString('base64')
      : null;

    const bearerToken = (env.CODEXIA_JIRA_BEARER_TOKEN || '').trim();
    this.bearerToken = bearerToken || null;

<<<<<<< HEAD
    const greenhopperMode = (env.CODEXIA_JIRA_USE_GREENHOPPER_REPORT || 'true').trim().toLowerCase();
    this.useGreenhopperSprintReport = greenhopperMode !== 'false' && greenhopperMode !== '0' && greenhopperMode !== 'no';
||||||| 83e9878
=======
    const parsedRetryMax = Number.parseInt(env.CODEXIA_JIRA_RETRY_MAX || '1', 10);
    const parsedRetryBaseMs = Number.parseInt(env.CODEXIA_JIRA_RETRY_BASE_MS || '500', 10);
    const parsedRetryMaxMs = Number.parseInt(env.CODEXIA_JIRA_RETRY_MAX_MS || '4000', 10);
    const parsedTimeoutMs = Number.parseInt(env.CODEXIA_JIRA_REQUEST_TIMEOUT_MS || '15000', 10);
    const parsedMaxIssuesPerSprint = Number.parseInt(env.CODEXIA_JIRA_MAX_ISSUES_PER_SPRINT || '500', 10);
    const parsedSprintSearchTimeBudgetMs = Number.parseInt(env.CODEXIA_JIRA_SPRINT_SEARCH_TIME_BUDGET_MS || '15000', 10);
    const membershipMode = (env.CODEXIA_JIRA_SPRINT_MEMBERSHIP_MODE || 'current_only').trim().toLowerCase();
    const parsedCacheTtlMs = Number.parseInt(env.CODEXIA_JIRA_CACHE_TTL_MS || '90000', 10);
    const parsedBoardHistoryTimeBudgetMs = Number.parseInt(env.CODEXIA_JIRA_BOARD_TIME_BUDGET_MS || '45000', 10);

    this.requestRetryMax = Number.isFinite(parsedRetryMax) ? Math.min(10, Math.max(0, parsedRetryMax)) : 1;
    this.requestRetryBaseMs = Number.isFinite(parsedRetryBaseMs) ? Math.min(10000, Math.max(100, parsedRetryBaseMs)) : 500;
    this.requestRetryMaxMs = Number.isFinite(parsedRetryMaxMs) ? Math.min(120000, Math.max(500, parsedRetryMaxMs)) : 4000;
    this.requestTimeoutMs = Number.isFinite(parsedTimeoutMs) ? Math.min(180000, Math.max(1000, parsedTimeoutMs)) : 15000;
    this.maxIssuesPerSprint = Number.isFinite(parsedMaxIssuesPerSprint) ? Math.min(5000, Math.max(50, parsedMaxIssuesPerSprint)) : 500;
    this.sprintSearchTimeBudgetMs = Number.isFinite(parsedSprintSearchTimeBudgetMs)
      ? Math.min(180000, Math.max(3000, parsedSprintSearchTimeBudgetMs))
      : 15000;
    this.sprintMembershipMode = membershipMode === 'auto' ? 'auto' : 'currentOnly';
    this.cacheTtlMs = Number.isFinite(parsedCacheTtlMs) ? Math.min(3600000, Math.max(10000, parsedCacheTtlMs)) : 90000;
    this.boardHistoryTimeBudgetMs = Number.isFinite(parsedBoardHistoryTimeBudgetMs)
      ? Math.min(600000, Math.max(5000, parsedBoardHistoryTimeBudgetMs))
      : 45000;
>>>>>>> main
  }

  getConfig(): JiraConfig {
    const hasBaseUrl = Boolean(this.baseUrl);
    const authMode = this.bearerToken
      ? 'bearer'
      : this.basicAuth
        ? 'basic'
        : 'none';

    if (!hasBaseUrl) {
      return {
        enabled: false,
        baseUrl: null,
        authMode,
        message: 'Set CODEXIA_JIRA_BASE_URL to enable Jira analytics.',
      };
    }

    if (authMode === 'none') {
      return {
        enabled: false,
        baseUrl: this.baseUrl,
        authMode,
        message: 'Set CODEXIA_JIRA_EMAIL and CODEXIA_JIRA_API_TOKEN (or CODEXIA_JIRA_BEARER_TOKEN).',
      };
    }

    return {
      enabled: true,
      baseUrl: this.baseUrl,
      authMode,
      message: 'Jira analytics is configured.',
    };
  }

  async getBoards(projectKey?: string, limit = 50): Promise<{ boards: JiraBoardSummary[]; total: number }> {
    this.ensureConfigured();

    const sanitizedLimit = this.clamp(limit, 1, 200);
    const boards = await this.fetchAgilePages<JiraApiBoard>('/board', {
      projectKeyOrId: projectKey || undefined,
      maxResults: Math.min(100, sanitizedLimit),
    }, sanitizedLimit);

    const mapped = boards.map((board) => ({
      id: board.id,
      name: board.name,
      type: board.type || 'unknown',
      projectKey: board.location?.projectKey || null,
      projectName: board.location?.projectName || null,
    }));

    return {
      boards: mapped,
      total: mapped.length,
    };
  }

  async getSprints(
    boardId: number,
    state = 'active,closed,future',
    limit = 50,
  ): Promise<{ boardId: number; sprints: JiraSprintSummary[]; total: number }> {
    this.ensureConfigured();

    const sanitizedLimit = this.clamp(limit, 1, 200);
    const sprints = await this.fetchAgilePages<JiraApiSprint>(
      `/board/${boardId}/sprint`,
      {
        state,
        maxResults: Math.min(100, sanitizedLimit),
      },
      sanitizedLimit,
    );

    const mapped = sprints.map(this.mapSprintSummary);

    return {
      boardId,
      sprints: mapped,
      total: mapped.length,
    };
  }

  async getSprintReport(boardId: number, sprintId: number): Promise<JiraSprintReport> {
    this.ensureConfigured();

    const sprintCacheKey = `${boardId}:${sprintId}`;
    const cached = this.getCacheValue(this.sprintReportCache, sprintCacheKey);
    if (cached) {
      return cached;
    }

    const pending = this.sprintReportInFlight.get(sprintCacheKey);
    if (pending) {
      return pending;
    }

    const task = (async (): Promise<JiraSprintReport> => {
      const board = await this.requestAgile<JiraApiBoard>(`/board/${boardId}`);
      const sprint = await this.getSprintById(boardId, sprintId);
      if (sprint.originBoardId && sprint.originBoardId !== boardId) {
        throw new Error(`BadRequest: Sprint ${sprintId} belongs to board ${sprint.originBoardId}, not board ${boardId}.`);
      }
      const report = await this.buildSprintReport(board, sprint);
      this.setCacheValue(this.sprintReportCache, sprintCacheKey, report);
      return report;
    })();

    this.sprintReportInFlight.set(sprintCacheKey, task);
    try {
      return await task;
    } finally {
      this.sprintReportInFlight.delete(sprintCacheKey);
    }
  }

  async getBoardHistoryReport(boardId: number, maxSprints = 12): Promise<JiraBoardHistoryReport> {
    this.ensureConfigured();

    const normalizedMaxSprints = this.clamp(maxSprints, 1, 50);
    const historyCacheKey = `${boardId}:${normalizedMaxSprints}`;
    const cached = this.getCacheValue(this.boardHistoryCache, historyCacheKey);
    if (cached) {
      return cached;
    }

    const pending = this.boardHistoryInFlight.get(historyCacheKey);
    if (pending) {
      return pending;
    }

    const task = (async (): Promise<JiraBoardHistoryReport> => {
      const board = await this.requestAgile<JiraApiBoard>(`/board/${boardId}`);
      const sprints = await this.fetchAgilePages<JiraApiSprint>(
        `/board/${boardId}/sprint`,
        { state: 'closed', maxResults: 50 },
        normalizedMaxSprints,
      );

      const sorted = sprints
        .slice()
        .sort((a, b) => {
          const aDate = this.dateOrEpoch(a.completeDate || a.endDate || a.startDate);
          const bDate = this.dateOrEpoch(b.completeDate || b.endDate || b.startDate);
          return bDate.getTime() - aDate.getTime();
        })
        .slice(0, normalizedMaxSprints);

      const reports: JiraSprintReport[] = [];
      const warnings: string[] = [];
      const startedAt = Date.now();
      const budgetMs = this.boardHistoryTimeBudgetMs;

      for (const sprint of sorted) {
        if ((Date.now() - startedAt) >= budgetMs) {
          warnings.push(
            `Board analysis time budget (${Math.floor(budgetMs / 1000)}s) reached. Returning partial history.`,
          );
          break;
        }

        const sprintCacheKey = `${board.id}:${sprint.id}`;
        const cachedSprint = this.getCacheValue(this.sprintReportCache, sprintCacheKey);
        if (cachedSprint) {
          reports.push(cachedSprint);
          continue;
        }

        try {
          const computed = await this.buildSprintReport(board, sprint);
          this.setCacheValue(this.sprintReportCache, sprintCacheKey, computed);
          reports.push(computed);
        } catch (error) {
          if (!this.isRetryableOperationalError(error)) {
            throw error;
          }

          warnings.push('Jira rate limits or request timeouts interrupted board history analysis. Returning partial history.');
          break;
        }
      }

      if (reports.length === 0 && warnings.length > 0) {
        throw new Error(
          `${warnings[0]} Try lowering max sprints or tighten CODEXIA_JIRA_MAX_ISSUES_PER_SPRINT.`,
        );
      }

      const low = reports.filter(r => r.integrity.risk === 'low').length;
      const medium = reports.filter(r => r.integrity.risk === 'medium').length;
      const high = reports.filter(r => r.integrity.risk === 'high').length;

      const summary = {
        sprintsAnalyzed: reports.length,
        averageCompletionRate: this.round(this.average(reports.map(r => r.metrics.points.completionRate)), 1),
        averageScopeCreepPct: this.round(this.average(reports.map(r => r.integrity.indicators.scopeCreepPct)), 1),
        averagePointChurnPct: this.round(this.average(reports.map(r => r.integrity.indicators.pointChurnPct)), 1),
        averageIntegrityScore: this.round(this.average(reports.map(r => r.integrity.score)), 1),
        onTrackLikeSprints: reports.filter(r => r.health.status === 'on_track' || r.health.status === 'completed').length,
        riskDistribution: {
          low,
          medium,
          high,
        },
      };

      const mappedSprints = reports.map((report, index) => ({
        id: report.sprint.id,
        name: report.sprint.name,
        state: report.sprint.state,
        startDate: report.sprint.startDate,
        endDate: report.sprint.endDate,
        completeDate: report.sprint.completeDate,
        goal: report.sprint.goal,
        completionRate: report.metrics.points.completionRate,
        committedPoints: report.metrics.points.committed,
        completedPoints: report.metrics.points.completedByEnd,
        scopeCreepPct: report.integrity.indicators.scopeCreepPct,
        pointChurnPct: report.integrity.indicators.pointChurnPct,
        carryoverPct: report.integrity.indicators.carryoverPct,
        integrityRisk: report.integrity.risk,
        integrityScore: report.integrity.score,
        healthStatus: report.health.status,
        flags: index === 0 && warnings.length > 0
          ? [...report.integrity.flags, ...warnings]
          : report.integrity.flags,
      }));

      const boardHistoryReport = {
        board: {
          id: board.id,
          name: board.name,
        },
        summary,
        sprints: mappedSprints,
      };

      this.setCacheValue(this.boardHistoryCache, historyCacheKey, boardHistoryReport);
      return boardHistoryReport;
    })();

    this.boardHistoryInFlight.set(historyCacheKey, task);
    try {
      return await task;
    } finally {
      this.boardHistoryInFlight.delete(historyCacheKey);
    }
  }

  private async buildSprintReport(board: JiraApiBoard, sprint: JiraApiSprint): Promise<JiraSprintReport> {
    const greenhopperReport = await this.tryBuildSprintReportFromGreenhopper(board, sprint);
    if (greenhopperReport) {
      return greenhopperReport;
    }

    const storyPointsFieldId = await this.getStoryPointsFieldId();
    const sprintFieldId = await this.getSprintFieldId();

    const fields = ['summary', 'status', 'resolutiondate', 'created', 'updated'];
    if (storyPointsFieldId) {
      fields.push(storyPointsFieldId);
    }
    if (sprintFieldId) {
      fields.push(sprintFieldId);
    }

    let sprintIssueSearch: SprintIssueSearchResult;
    let changelogFallback = false;
    try {
      sprintIssueSearch = await this.getSprintIssuesForAnalysis(sprint.id, fields, true);
    } catch (error) {
      if (!this.isRetryableOperationalError(error)) {
        throw error;
      }

      sprintIssueSearch = await this.getSprintIssuesForAnalysis(sprint.id, fields, false);
      changelogFallback = true;
    }

    const issues = sprintIssueSearch.issues;

    const now = new Date();
    const sprintStart = this.tryParseDate(sprint.startDate);
    const sprintEnd = this.tryParseDate(sprint.completeDate || sprint.endDate) || now;

    let committedIssues = 0;
    let completedIssues = 0;
    let addedAfterStartIssues = 0;
    let removedDuringSprintIssues = 0;

    let committedPoints = 0;
    let completedPoints = 0;
    let completedCommittedPoints = 0;
    let addedAfterStartPoints = 0;
    let removedDuringSprintPoints = 0;
    let currentScopePoints = 0;

    let pointChangeEventCount = 0;
    let absolutePointChange = 0;
    let netPointChange = 0;
    const pointChangedIssues = new Set<string>();

    for (const issue of issues) {
      const currentPoints = this.getStoryPoints(issue.fields, storyPointsFieldId);
      const pointsAtStart = sprintStart
        ? this.estimateStoryPointsAtDate(issue, storyPointsFieldId, sprintStart)
        : currentPoints;
      const pointsAtEnd = this.estimateStoryPointsAtDate(issue, storyPointsFieldId, sprintEnd);

      const sprintEvents = this.extractSprintMembershipEvents(issue, sprint, sprintFieldId);
      const inSprintNow = this.isIssueInSprintNow(issue, sprint, sprintFieldId, sprintEvents);

      const inSprintAtStart = sprintStart
        ? this.rewindMembershipState(inSprintNow, sprintEvents, sprintStart)
        : inSprintNow;

      const addedAfterStart = sprintStart
        ? sprintEvents.some((event) => event.type === 'enter' && event.at > sprintStart && event.at <= sprintEnd)
        : false;
      const removedDuringSprint = sprintStart
        ? sprintEvents.some((event) => event.type === 'leave' && event.at > sprintStart && event.at <= sprintEnd)
        : false;

      const pointChanges = sprintStart
        ? this.extractStoryPointChanges(issue, storyPointsFieldId, sprintStart, sprintEnd)
        : { eventCount: 0, absoluteDelta: 0, netDelta: 0 };

      pointChangeEventCount += pointChanges.eventCount;
      absolutePointChange += pointChanges.absoluteDelta;
      netPointChange += pointChanges.netDelta;
      if (pointChanges.eventCount > 0) {
        pointChangedIssues.add(issue.key);
      }

      const completedByEnd = this.isIssueCompletedByEnd(issue, sprintEnd);

      if (inSprintAtStart) {
        committedIssues++;
        committedPoints += pointsAtStart;
      }

      if (addedAfterStart) {
        addedAfterStartIssues++;
        addedAfterStartPoints += pointsAtEnd;
      }

      if (removedDuringSprint) {
        removedDuringSprintIssues++;
        removedDuringSprintPoints += pointsAtEnd;
      }

      if (inSprintNow) {
        currentScopePoints += pointsAtEnd;
      }

      if (completedByEnd) {
        completedIssues++;
        completedPoints += pointsAtEnd;
        if (inSprintAtStart) {
          completedCommittedPoints += pointsAtEnd;
        }
      }
    }

    const issueCompletionRate = committedIssues > 0
      ? (completedIssues / committedIssues) * 100
      : issues.length > 0
        ? (completedIssues / issues.length) * 100
        : 0;

    const pointsCompletionRate = committedPoints > 0
      ? (completedCommittedPoints / committedPoints) * 100
      : currentScopePoints > 0
        ? (completedPoints / currentScopePoints) * 100
        : 0;

    const scopeForProgress = sprint.state === 'active'
      ? currentScopePoints
      : Math.max(0, committedPoints + addedAfterStartPoints - removedDuringSprintPoints);

    const remainingPoints = Math.max(0, scopeForProgress - completedPoints);

    const scopeCreepRatio = committedPoints > 0
      ? addedAfterStartPoints / committedPoints
      : committedIssues > 0
        ? addedAfterStartIssues / committedIssues
        : 0;

    const pointChurnRatio = committedPoints > 0 ? absolutePointChange / committedPoints : 0;
    const carryoverRatio = committedPoints > 0
      ? Math.max(0, (committedPoints - completedCommittedPoints) / committedPoints)
      : 0;
    const removedRatio = issues.length > 0 ? removedDuringSprintIssues / issues.length : 0;

    const integrity = this.assessIntegrity(scopeCreepRatio, pointChurnRatio, carryoverRatio, removedRatio);
    if (sprintIssueSearch.coverage === 'partial') {
      integrity.flags.push('Historical sprint membership is unavailable for this Jira tenant; metrics are based on current sprint scope only.');
    }
    if (sprintIssueSearch.truncated) {
      integrity.flags.push(`Issue sample truncated at ${this.maxIssuesPerSprint} for performance; metrics may be approximate on very large sprints.`);
    }
    if (changelogFallback) {
      integrity.flags.push('Changelog expansion was skipped due Jira load/rate limits; point churn metrics are likely understated.');
    }

    const health = this.assessSprintHealth({
      state: sprint.state,
      start: sprintStart,
      end: sprintEnd,
      completionRate: pointsCompletionRate,
      integrityScore: integrity.score,
      remainingPoints,
      scopeForProgress,
    });

    return {
      board: {
        id: board.id,
        name: board.name,
      },
      sprint: this.mapSprintSummary(sprint),
      metrics: {
        issues: {
          total: issues.length,
          committed: committedIssues,
          completedByEnd: completedIssues,
          completionRate: this.round(issueCompletionRate, 1),
          addedAfterStart: addedAfterStartIssues,
          removedDuringSprint: removedDuringSprintIssues,
          carryover: Math.max(0, committedIssues - completedIssues),
        },
        points: {
          committed: this.round(committedPoints, 1),
          completedByEnd: this.round(completedPoints, 1),
          completionRate: this.round(pointsCompletionRate, 1),
          addedAfterStart: this.round(addedAfterStartPoints, 1),
          removedDuringSprint: this.round(removedDuringSprintPoints, 1),
          absoluteChangeDuringSprint: this.round(absolutePointChange, 1),
          netChangeDuringSprint: this.round(netPointChange, 1),
          changedIssueCount: pointChangedIssues.size,
          changeEventCount: pointChangeEventCount,
          currentScope: this.round(scopeForProgress, 1),
          remaining: this.round(remainingPoints, 1),
        },
      },
      health,
      integrity: {
        ...integrity,
        indicators: {
          scopeCreepPct: this.round(scopeCreepRatio * 100, 1),
          pointChurnPct: this.round(pointChurnRatio * 100, 1),
          carryoverPct: this.round(carryoverRatio * 100, 1),
          removedPct: this.round(removedRatio * 100, 1),
        },
      },
    };
  }

  private async tryBuildSprintReportFromGreenhopper(
    board: JiraApiBoard,
    sprint: JiraApiSprint,
  ): Promise<JiraSprintReport | null> {
    if (!this.useGreenhopperSprintReport) {
      return null;
    }

    try {
      const payload = await this.getGreenhopperSprintReport(board.id, sprint.id);
      return this.buildSprintReportFromGreenhopperPayload(board, sprint, payload);
    } catch {
      return null;
    }
  }

  private async getGreenhopperSprintReport(boardId: number, sprintId: number): Promise<JiraGreenhopperSprintReport> {
    return this.request<JiraGreenhopperSprintReport>(
      '/rest/greenhopper/1.0/rapid/charts/sprintreport',
      { rapidViewId: boardId, sprintId },
    );
  }

  private buildSprintReportFromGreenhopperPayload(
    board: JiraApiBoard,
    sprint: JiraApiSprint,
    payload: JiraGreenhopperSprintReport,
  ): JiraSprintReport {
    const contents = payload.contents || {};
    const completed = Array.isArray(contents.completedIssues) ? contents.completedIssues : [];
    const notCompleted = Array.isArray(contents.issuesNotCompletedInCurrentSprint) ? contents.issuesNotCompletedInCurrentSprint : [];
    const punted = Array.isArray(contents.puntedIssues) ? contents.puntedIssues : [];
    const addedKeys = new Set<string>(
      contents.issueKeysAddedDuringSprint && typeof contents.issueKeysAddedDuringSprint === 'object'
        ? Object.keys(contents.issueKeysAddedDuringSprint)
        : [],
    );

    const committedCompleted = completed.filter((issue) => {
      const key = this.getGreenhopperIssueKey(issue);
      return key && !addedKeys.has(key);
    });
    const addedCompleted = completed.filter((issue) => {
      const key = this.getGreenhopperIssueKey(issue);
      return key && addedKeys.has(key);
    });
    const committedNotCompleted = notCompleted.filter((issue) => {
      const key = this.getGreenhopperIssueKey(issue);
      return key && !addedKeys.has(key);
    });
    const addedNotCompleted = notCompleted.filter((issue) => {
      const key = this.getGreenhopperIssueKey(issue);
      return key && addedKeys.has(key);
    });
    const committedPunted = punted.filter((issue) => {
      const key = this.getGreenhopperIssueKey(issue);
      return key && !addedKeys.has(key);
    });
    const addedPunted = punted.filter((issue) => {
      const key = this.getGreenhopperIssueKey(issue);
      return key && addedKeys.has(key);
    });

    const committedCompletedPts = this.sumGreenhopperPoints(committedCompleted, 'estimateStatistic');
    const committedNotCompletedPts = this.sumGreenhopperPoints(committedNotCompleted, 'estimateStatistic');
    const addedCompletedPts = this.sumGreenhopperPoints(addedCompleted, 'estimateStatistic');
    const addedNotCompletedPts = this.sumGreenhopperPoints(addedNotCompleted, 'estimateStatistic');
    const committedRemovedPts = this.sumGreenhopperPoints(committedPunted, 'estimateStatistic');
    const addedRemovedPts = this.sumGreenhopperPoints(addedPunted, 'estimateStatistic');

    const removedPts = committedRemovedPts + addedRemovedPts;
    const initialCommitmentPts = committedCompletedPts + committedNotCompletedPts + committedRemovedPts;
    const totalAddedPts = addedCompletedPts + addedNotCompletedPts + addedRemovedPts;
    const finalScopePts = Math.max(
      0,
      initialCommitmentPts - committedRemovedPts + addedCompletedPts + addedNotCompletedPts,
    );
    const totalCompletedPts = committedCompletedPts + addedCompletedPts;
    const totalNotCompletedPts = committedNotCompletedPts + addedNotCompletedPts;

    const allIssuesByKey = new Map<string, JiraGreenhopperIssue>();
    for (const issue of [...completed, ...notCompleted, ...punted]) {
      const key = this.getGreenhopperIssueKey(issue);
      if (!key || allIssuesByKey.has(key)) {
        continue;
      }
      allIssuesByKey.set(key, issue);
    }

    let changedIssueCount = 0;
    let absolutePointChange = 0;
    let netPointChange = 0;
    for (const issue of allIssuesByKey.values()) {
      const original = this.extractGreenhopperPoints(issue, 'estimateStatistic');
      const current = this.extractGreenhopperPoints(issue, 'currentEstimateStatistic');
      if (original === current) {
        continue;
      }

      changedIssueCount++;
      const delta = current - original;
      absolutePointChange += Math.abs(delta);
      netPointChange += delta;
    }

    const committedIssueCount = committedCompleted.length + committedNotCompleted.length + committedPunted.length;
    const addedIssueCount = addedCompleted.length + addedNotCompleted.length + addedPunted.length;
    const completedIssueCount = completed.length;
    const removedIssueCount = punted.length;
    const carryoverIssueCount = committedNotCompleted.length;
    const issueCompletionRate = committedIssueCount > 0
      ? (completedIssueCount / committedIssueCount) * 100
      : 0;

    const remainingCommitmentPts = committedCompletedPts + committedNotCompletedPts;
    const pointsCompletionRate = remainingCommitmentPts > 0
      ? (committedCompletedPts / remainingCommitmentPts) * 100
      : finalScopePts > 0
        ? (totalCompletedPts / finalScopePts) * 100
        : 0;

    const scopeForProgress = sprint.state === 'active' ? finalScopePts : Math.max(0, finalScopePts);
    const remainingPoints = Math.max(totalNotCompletedPts, scopeForProgress - totalCompletedPts);

    const scopeCreepRatio = initialCommitmentPts > 0
      ? (totalAddedPts - removedPts) / initialCommitmentPts
      : 0;
    const pointChurnRatio = initialCommitmentPts > 0 ? absolutePointChange / initialCommitmentPts : 0;
    const carryoverRatio = remainingCommitmentPts > 0
      ? (committedNotCompletedPts / remainingCommitmentPts)
      : 0;
    const removedRatio = allIssuesByKey.size > 0 ? removedIssueCount / allIssuesByKey.size : 0;

    const integrity = this.assessIntegrity(scopeCreepRatio, pointChurnRatio, carryoverRatio, removedRatio);
    integrity.flags.push('Sprint metrics sourced from Jira sprint report categories (completed/not-completed/punted/added).');
    if (initialCommitmentPts === 0 && allIssuesByKey.size > 0) {
      integrity.flags.push('Story points are missing on sprint report issues; point metrics may appear as zero.');
    }

    const health = this.assessSprintHealth({
      state: sprint.state,
      start: this.tryParseDate(sprint.startDate),
      end: this.tryParseDate(sprint.completeDate || sprint.endDate) || new Date(),
      completionRate: pointsCompletionRate,
      integrityScore: integrity.score,
      remainingPoints,
      scopeForProgress,
    });

    return {
      board: {
        id: board.id,
        name: board.name,
      },
      sprint: this.mapSprintSummary(sprint),
      metrics: {
        issues: {
          total: allIssuesByKey.size,
          committed: committedIssueCount,
          completedByEnd: completedIssueCount,
          completionRate: this.round(issueCompletionRate, 1),
          addedAfterStart: addedIssueCount,
          removedDuringSprint: removedIssueCount,
          carryover: carryoverIssueCount,
        },
        points: {
          committed: this.round(initialCommitmentPts, 1),
          completedByEnd: this.round(totalCompletedPts, 1),
          completionRate: this.round(pointsCompletionRate, 1),
          addedAfterStart: this.round(totalAddedPts, 1),
          removedDuringSprint: this.round(removedPts, 1),
          absoluteChangeDuringSprint: this.round(absolutePointChange, 1),
          netChangeDuringSprint: this.round(netPointChange, 1),
          changedIssueCount,
          changeEventCount: changedIssueCount,
          currentScope: this.round(scopeForProgress, 1),
          remaining: this.round(remainingPoints, 1),
        },
      },
      health,
      integrity: {
        ...integrity,
        indicators: {
          scopeCreepPct: this.round(scopeCreepRatio * 100, 1),
          pointChurnPct: this.round(pointChurnRatio * 100, 1),
          carryoverPct: this.round(carryoverRatio * 100, 1),
          removedPct: this.round(removedRatio * 100, 1),
        },
      },
    };
  }

  private getGreenhopperIssueKey(issue: JiraGreenhopperIssue): string | null {
    if (!issue || typeof issue.key !== 'string') {
      return null;
    }

    const key = issue.key.trim();
    return key ? key : null;
  }

  private extractGreenhopperPoints(
    issue: JiraGreenhopperIssue,
    field: 'estimateStatistic' | 'currentEstimateStatistic',
  ): number {
    const statistic = issue[field];
    if (!statistic || typeof statistic !== 'object') {
      return 0;
    }

    const statFieldValue = statistic.statFieldValue;
    if (!statFieldValue || typeof statFieldValue !== 'object') {
      return 0;
    }

    return this.parseNumeric(statFieldValue.value) ?? 0;
  }

  private sumGreenhopperPoints(
    issues: JiraGreenhopperIssue[],
    field: 'estimateStatistic' | 'currentEstimateStatistic',
  ): number {
    let total = 0;
    for (const issue of issues) {
      total += this.extractGreenhopperPoints(issue, field);
    }
    return total;
  }

  private assessIntegrity(
    scopeCreepRatio: number,
    pointChurnRatio: number,
    carryoverRatio: number,
    removedRatio: number,
  ): {
    risk: 'low' | 'medium' | 'high';
    score: number;
    flags: string[];
  } {
    const flags: string[] = [];

    if (scopeCreepRatio > 0.25) {
      flags.push('High scope creep after sprint start (>25%).');
    }
    if (pointChurnRatio > 0.2) {
      flags.push('Significant in-sprint story point churn (>20% of commitment).');
    }
    if (carryoverRatio > 0.35) {
      flags.push('Large carryover from commitment (>35%).');
    }
    if (removedRatio > 0.12) {
      flags.push('Frequent issue removal during sprint (>12% of issues).');
    }

    const scoreRaw = 100
      - (scopeCreepRatio * 40)
      - (pointChurnRatio * 35)
      - (carryoverRatio * 20)
      - (removedRatio * 15);

    const score = this.round(this.clamp(scoreRaw, 0, 100), 1);

    let risk: 'low' | 'medium' | 'high' = 'low';
    if (score < 55 || flags.length >= 3) {
      risk = 'high';
    } else if (score < 75 || flags.length >= 1) {
      risk = 'medium';
    }

    return { risk, score, flags };
  }

  private assessSprintHealth(input: {
    state: string;
    start: Date | null;
    end: Date;
    completionRate: number;
    integrityScore: number;
    remainingPoints: number;
    scopeForProgress: number;
  }): JiraSprintReport['health'] {
    const now = new Date();

    if (input.state === 'active' && input.start) {
      const totalDurationMs = Math.max(1, input.end.getTime() - input.start.getTime());
      const elapsedMs = this.clamp(now.getTime() - input.start.getTime(), 0, totalDurationMs);
      const elapsedPct = elapsedMs / totalDurationMs;
      const completionPct = input.scopeForProgress > 0
        ? input.completionRate / 100
        : 0;
      const paceDelta = completionPct - elapsedPct;

      const remainingDays = Math.max(0, Math.ceil((input.end.getTime() - now.getTime()) / 86400000));
      const requiredPointsPerDay = remainingDays > 0
        ? input.remainingPoints / remainingDays
        : input.remainingPoints;

      let status: JiraSprintReport['health']['status'];
      if (completionPct >= 1) {
        status = 'completed';
      } else if (paceDelta >= -0.08) {
        status = 'on_track';
      } else if (paceDelta >= -0.2) {
        status = 'at_risk';
      } else {
        status = 'off_track';
      }

      const scoreRaw = 70 + (paceDelta * 100) - ((100 - input.integrityScore) * 0.2);
      const score = this.round(this.clamp(scoreRaw, 0, 100), 1);

      return {
        status,
        score,
        elapsedPct: this.round(elapsedPct * 100, 1),
        completionPct: this.round(completionPct * 100, 1),
        paceDelta: this.round(paceDelta * 100, 1),
        remainingDays,
        requiredPointsPerDay: this.round(requiredPointsPerDay, 2),
        summary: this.describeHealth(status, input.remainingPoints, remainingDays),
      };
    }

    const closedStatus = input.completionRate >= 90
      ? 'completed'
      : input.completionRate >= 75
        ? 'on_track'
        : input.completionRate >= 60
          ? 'at_risk'
          : 'off_track';

    return {
      status: input.state === 'future' ? 'unknown' : closedStatus,
      score: this.round(this.clamp((input.completionRate * 0.8) + (input.integrityScore * 0.2), 0, 100), 1),
      elapsedPct: input.state === 'future' ? 0 : 100,
      completionPct: this.round(input.completionRate, 1),
      paceDelta: 0,
      remainingDays: 0,
      requiredPointsPerDay: 0,
      summary: input.state === 'future'
        ? 'Sprint has not started yet.'
        : `Sprint closed with ${this.round(input.completionRate, 1)}% completion.`,
    };
  }

  private describeHealth(
    status: JiraSprintReport['health']['status'],
    remainingPoints: number,
    remainingDays: number,
  ): string {
    if (status === 'completed') {
      return 'Sprint scope is completed.';
    }
    if (status === 'on_track') {
      return `Pace is healthy. ${this.round(remainingPoints, 1)} points remain over ${remainingDays} day(s).`;
    }
    if (status === 'at_risk') {
      return `Pace is behind plan. ${this.round(remainingPoints, 1)} points remain over ${remainingDays} day(s).`;
    }
    if (status === 'off_track') {
      return `Sprint is significantly behind pace with ${this.round(remainingPoints, 1)} points remaining.`;
    }
    return 'Insufficient sprint timeline data for pace analysis.';
  }

  private async getStoryPointsFieldId(): Promise<string | null> {
    if (this.storyPointsFieldId !== undefined) {
      return this.storyPointsFieldId;
    }

    const fields = await this.requestCore<JiraField[]>('/field');
    const priorities = [
      'story point estimate',
      'story points',
      'story points estimate',
    ];

    const preferred = priorities
      .map((name) => fields.find((field) => field.name.toLowerCase() === name))
      .find(Boolean);

    const fallback = fields.find((field) => field.name.toLowerCase().includes('story point'));

    this.storyPointsFieldId = (preferred || fallback)?.id || null;
    return this.storyPointsFieldId;
  }

  private async getSprintFieldId(): Promise<string | null> {
    if (this.sprintFieldId !== undefined) {
      return this.sprintFieldId;
    }

    const fields = await this.requestCore<JiraField[]>('/field');
    const sprintField = fields.find((field) => field.name.toLowerCase() === 'sprint');

    this.sprintFieldId = sprintField?.id || null;
    return this.sprintFieldId;
  }

  private getStoryPoints(fields: Record<string, unknown>, storyPointsFieldId: string | null): number {
    if (storyPointsFieldId && typeof fields[storyPointsFieldId] === 'number') {
      return fields[storyPointsFieldId] as number;
    }

    const fallbackFieldIds = ['customfield_10016', 'customfield_10026'];
    for (const fieldId of fallbackFieldIds) {
      if (typeof fields[fieldId] === 'number') {
        return fields[fieldId] as number;
      }
    }

    return 0;
  }

  private estimateStoryPointsAtDate(issue: JiraIssue, storyPointsFieldId: string | null, boundary: Date): number {
    const currentPoints = this.getStoryPoints(issue.fields, storyPointsFieldId);
    const histories = issue.changelog?.histories || [];

    const sorted = histories
      .slice()
      .sort((a, b) => this.dateOrEpoch(b.created).getTime() - this.dateOrEpoch(a.created).getTime());

    let value = currentPoints;

    for (const history of sorted) {
      const changedAt = this.tryParseDate(history.created);
      if (!changedAt || changedAt <= boundary) {
        continue;
      }

      for (const item of history.items) {
        if (!this.isStoryPointField(item, storyPointsFieldId)) {
          continue;
        }

        const fromValue = this.parseNumeric(item.fromString ?? item.from);
        value = fromValue ?? 0;
      }
    }

    return value;
  }

  private extractStoryPointChanges(
    issue: JiraIssue,
    storyPointsFieldId: string | null,
    start: Date,
    end: Date,
  ): SprintPointChanges {
    const histories = issue.changelog?.histories || [];
    let eventCount = 0;
    let absoluteDelta = 0;
    let netDelta = 0;

    for (const history of histories) {
      const changedAt = this.tryParseDate(history.created);
      if (!changedAt || changedAt < start || changedAt > end) {
        continue;
      }

      for (const item of history.items) {
        if (!this.isStoryPointField(item, storyPointsFieldId)) {
          continue;
        }

        const fromValue = this.parseNumeric(item.fromString ?? item.from) ?? 0;
        const toValue = this.parseNumeric(item.toString ?? item.to) ?? 0;

        if (fromValue === toValue) {
          continue;
        }

        eventCount++;
        const delta = toValue - fromValue;
        netDelta += delta;
        absoluteDelta += Math.abs(delta);
      }
    }

    return {
      eventCount,
      absoluteDelta,
      netDelta,
    };
  }

  private extractSprintMembershipEvents(
    issue: JiraIssue,
    sprint: JiraApiSprint,
    sprintFieldId: string | null,
  ): SprintMembershipEvent[] {
    const histories = issue.changelog?.histories || [];
    const events: SprintMembershipEvent[] = [];

    for (const history of histories) {
      const changedAt = this.tryParseDate(history.created);
      if (!changedAt) {
        continue;
      }

      for (const item of history.items) {
        if (!this.isSprintField(item, sprintFieldId)) {
          continue;
        }

        const fromIncludes = this.sprintReferenceContains(item.fromString ?? item.from, sprint);
        const toIncludes = this.sprintReferenceContains(item.toString ?? item.to, sprint);

        if (!fromIncludes && toIncludes) {
          events.push({ type: 'enter', at: changedAt });
        } else if (fromIncludes && !toIncludes) {
          events.push({ type: 'leave', at: changedAt });
        }
      }
    }

    return events.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  private isIssueInSprintNow(
    issue: JiraIssue,
    sprint: JiraApiSprint,
    sprintFieldId: string | null,
    events: SprintMembershipEvent[],
  ): boolean {
    if (sprintFieldId) {
      const sprintFieldValue = issue.fields[sprintFieldId];
      if (sprintFieldValue !== undefined) {
        return this.sprintReferenceContains(sprintFieldValue, sprint);
      }
    }

    if (events.length > 0) {
      return events[events.length - 1].type === 'enter';
    }

    return false;
  }

  private rewindMembershipState(
    inSprintNow: boolean,
    events: SprintMembershipEvent[],
    boundary: Date,
  ): boolean {
    let state = inSprintNow;

    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event.at <= boundary) {
        break;
      }

      state = event.type === 'enter' ? false : true;
    }

    return state;
  }

  private isIssueCompletedByEnd(issue: JiraIssue, sprintEnd: Date): boolean {
    const resolution = this.tryParseDate((issue.fields.resolutiondate as string | undefined) || null);
    if (resolution) {
      return resolution <= sprintEnd;
    }

    const status = issue.fields.status as { statusCategory?: { key?: string } } | undefined;
    return status?.statusCategory?.key === 'done';
  }

  private sprintReferenceContains(value: unknown, sprint: JiraApiSprint): boolean {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'number') {
      return value === sprint.id;
    }

    if (typeof value === 'string') {
      return this.sprintTextContains(value, sprint);
    }

    if (Array.isArray(value)) {
      return value.some((entry) => this.sprintReferenceContains(entry, sprint));
    }

    if (typeof value === 'object') {
      const candidate = value as { id?: number; name?: string };
      if (candidate.id === sprint.id) {
        return true;
      }
      if (candidate.name && sprint.name) {
        return candidate.name.toLowerCase() === sprint.name.toLowerCase();
      }
      return false;
    }

    return false;
  }

  private sprintTextContains(text: string, sprint: JiraApiSprint): boolean {
    const normalized = text.toLowerCase();
    const sprintName = (sprint.name || '').toLowerCase();

    if (sprintName && normalized.includes(sprintName)) {
      return true;
    }

    const idRegex = /id=(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = idRegex.exec(text)) !== null) {
      if (Number(match[1]) === sprint.id) {
        return true;
      }
    }

    const directIdRegex = /\b\d+\b/g;
    let directMatch: RegExpExecArray | null;
    while ((directMatch = directIdRegex.exec(text)) !== null) {
      if (Number(directMatch[0]) === sprint.id) {
        return true;
      }
    }

    return false;
  }

  private isStoryPointField(item: JiraChangeItem, storyPointsFieldId: string | null): boolean {
    if (storyPointsFieldId && item.fieldId === storyPointsFieldId) {
      return true;
    }

    const field = item.field.toLowerCase();
    return field.includes('story point') || field.includes('story points');
  }

  private isSprintField(item: JiraChangeItem, sprintFieldId: string | null): boolean {
    if (sprintFieldId && item.fieldId === sprintFieldId) {
      return true;
    }

    return item.field.toLowerCase() === 'sprint';
  }

  private mapSprintSummary = (sprint: JiraApiSprint): JiraSprintSummary => ({
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    completeDate: sprint.completeDate,
  });

  private async fetchAgilePages<T>(
    endpoint: string,
    params: Record<string, string | number | undefined>,
    maxItems: number,
  ): Promise<T[]> {
    const results: T[] = [];
    let startAt = 0;
    const pageSize = this.clamp(Number(params.maxResults) || 50, 1, 100);

    while (results.length < maxItems) {
      const response = await this.requestAgile<JiraApiPaginatedResponse<T>>(endpoint, {
        ...params,
        startAt,
        maxResults: pageSize,
      });

      if (!response.values || response.values.length === 0) {
        break;
      }

      results.push(...response.values);

      if (response.isLast || response.values.length < pageSize) {
        break;
      }

      startAt += response.values.length;
    }

    return results.slice(0, maxItems);
  }

  private async searchIssues(jql: string, fields: string[], includeChangelog: boolean): Promise<JiraSearchIssuesResult> {
    const issues: JiraIssue[] = [];
    const maxResults = 100;
    let startAt = 0;
    let nextPageToken: string | undefined;
    const seenPageTokens = new Set<string>();
    let truncated = false;
    const startedAt = Date.now();

    while (true) {
      if ((Date.now() - startedAt) >= this.sprintSearchTimeBudgetMs) {
        truncated = true;
        break;
      }

      let response: JiraSearchResponse;
      try {
        response = await this.requestCore<JiraSearchResponse>('/search/jql', {
          jql,
          fields: fields.join(','),
          expand: includeChangelog ? 'changelog' : undefined,
          maxResults,
          startAt: nextPageToken ? undefined : startAt,
          nextPageToken,
        });
      } catch (error) {
        if (!this.isHttpStatusError(error, 404) && !this.isHttpStatusError(error, 405)) {
          throw error;
        }

        // Compatibility fallback for tenants that still expose /search.
        response = await this.requestCore<JiraSearchResponse>('/search', {
          jql,
          fields: fields.join(','),
          expand: includeChangelog ? 'changelog' : undefined,
          maxResults,
          startAt,
        });
      }

      issues.push(...(response.issues || []));

      if (issues.length >= this.maxIssuesPerSprint) {
        truncated = true;
        issues.length = this.maxIssuesPerSprint;
        break;
      }

      if (!response.issues || response.issues.length === 0) {
        break;
      }

      if (response.nextPageToken) {
        if (seenPageTokens.has(response.nextPageToken)) {
          break;
        }
        seenPageTokens.add(response.nextPageToken);
        nextPageToken = response.nextPageToken;
        continue;
      }

      const loaded = startAt + response.issues.length;
      if (loaded >= response.total) {
        break;
      }

      startAt += response.issues.length;
    }

    return { issues, truncated };
  }

  private async getSprintIssuesForAnalysis(
    sprintId: number,
    fields: string[],
    includeChangelog: boolean,
  ): Promise<SprintIssueSearchResult> {
    if (this.sprintMembershipMode === 'currentOnly') {
      try {
        const agileResult = await this.fetchSprintIssuesCurrentScope(sprintId, fields, includeChangelog);
        this.sprintHistoryJqlMode = 'currentOnly';
        return {
          issues: agileResult.issues,
          coverage: 'partial',
          truncated: agileResult.truncated,
        };
      } catch {
        // Fall through to JQL strategy if sprint issue endpoint is unavailable.
      }
    }

    const modeToStrategy: Record<'was' | 'changed' | 'currentOnly', { jql: string; coverage: 'full' | 'partial' }> = {
      was: {
        jql: `sprint = ${sprintId} OR sprint WAS ${sprintId}`,
        coverage: 'full',
      },
      changed: {
        jql: `sprint = ${sprintId} OR sprint CHANGED TO ${sprintId} OR sprint CHANGED FROM ${sprintId}`,
        coverage: 'full',
      },
      currentOnly: {
        jql: `sprint = ${sprintId}`,
        coverage: 'partial',
      },
    };

    const strategyOrder: Array<'was' | 'changed' | 'currentOnly'> = this.sprintHistoryJqlMode === 'unknown'
      ? ['was', 'changed', 'currentOnly']
      : [this.sprintHistoryJqlMode, 'currentOnly'];

    let lastError: unknown = null;
    for (const mode of strategyOrder) {
      const strategy = modeToStrategy[mode];
      try {
        const result = await this.searchIssues(strategy.jql, fields, includeChangelog);
        if (mode !== 'currentOnly') {
          this.sprintHistoryJqlMode = mode;
        } else {
          this.sprintHistoryJqlMode = 'currentOnly';
        }
        return {
          issues: result.issues,
          coverage: strategy.coverage,
          truncated: result.truncated,
        };
      } catch (error) {
        lastError = error;
        if (!this.isHttpStatusError(error, 400)) {
          throw error;
        }

        if (mode === this.sprintHistoryJqlMode) {
          this.sprintHistoryJqlMode = 'unknown';
        }
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error('Jira query failed for all sprint issue retrieval strategies.');
  }

  private async fetchSprintIssuesCurrentScope(
    sprintId: number,
    fields: string[],
    includeChangelog: boolean,
  ): Promise<JiraSearchIssuesResult> {
    const issues: JiraIssue[] = [];
    const maxResults = 100;
    let startAt = 0;
    let truncated = false;
    const startedAt = Date.now();

    while (true) {
      if ((Date.now() - startedAt) >= this.sprintSearchTimeBudgetMs) {
        truncated = true;
        break;
      }

      const response = await this.requestAgile<JiraSearchResponse>(`/sprint/${sprintId}/issue`, {
        fields: fields.join(','),
        expand: includeChangelog ? 'changelog' : undefined,
        maxResults,
        startAt,
      });

      issues.push(...(response.issues || []));

      if (issues.length >= this.maxIssuesPerSprint) {
        truncated = true;
        issues.length = this.maxIssuesPerSprint;
        break;
      }

      if (!response.issues || response.issues.length === 0) {
        break;
      }

      const loaded = startAt + response.issues.length;
      if (loaded >= response.total) {
        break;
      }

      startAt += response.issues.length;
    }

    return { issues, truncated };
  }

  private async getSprintById(boardId: number, sprintId: number): Promise<JiraApiSprint> {
    try {
      return await this.requestAgile<JiraApiSprint>(`/sprint/${sprintId}`);
    } catch (error) {
      if (!this.isHttpStatusError(error, 404)) {
        throw error;
      }

      // Compatibility fallback for older Agile route variants.
      return this.requestAgile<JiraApiSprint>(`/board/${boardId}/sprint/${sprintId}`);
    }
  }

  private async requestAgile<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>(`/rest/agile/1.0${endpoint}`, params);
  }

  private async requestCore<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return this.request<T>(`/rest/api/3${endpoint}`, params);
  }

  private async request<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    this.ensureConfigured();

    const url = new URL(endpoint, this.baseUrl!);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    for (let attempt = 0; attempt <= this.requestRetryMax; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: 'GET',
          headers: this.getAuthHeaders(),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeout);
        if (this.isAbortError(error) && attempt < this.requestRetryMax) {
          const delayMs = this.getRetryDelayMs(undefined, attempt);
          await this.sleep(delayMs);
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (response.ok) {
        return response.json() as Promise<T>;
      }

      const text = await response.text();
      const canRetry = this.shouldRetry(response.status) && attempt < this.requestRetryMax;
      if (canRetry) {
        const delayMs = this.getRetryDelayMs(response, attempt);
        await this.sleep(delayMs);
        continue;
      }

      throw new Error(`Jira request failed (${response.status}): ${text.slice(0, 300)}`);
    }

    throw new Error('Jira request failed after retry attempts were exhausted.');
  }

  private isHttpStatusError(error: unknown, status: number): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return error.message.includes(`(${status})`);
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  private isRetryableOperationalError(error: unknown): boolean {
    if (this.isAbortError(error)) {
      return true;
    }

    return this.shouldRetryStatusInErrorMessage(error, [429, 502, 503, 504]);
  }

  private shouldRetryStatusInErrorMessage(error: unknown, statuses: number[]): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return statuses.some((status) => error.message.includes(`(${status})`));
  }

  private getRetryDelayMs(response: Response | undefined, attempt: number): number {
    if (!response) {
      const exponential = Math.min(this.requestRetryMaxMs, this.requestRetryBaseMs * (2 ** attempt));
      const jitter = Math.floor(Math.random() * 250);
      return Math.min(this.requestRetryMaxMs, exponential + jitter);
    }

    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const asNumber = Number.parseInt(retryAfter, 10);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        return Math.min(this.requestRetryMaxMs, asNumber * 1000);
      }

      const asDate = Date.parse(retryAfter);
      if (!Number.isNaN(asDate)) {
        const fromDate = asDate - Date.now();
        if (fromDate > 0) {
          return Math.min(this.requestRetryMaxMs, fromDate);
        }
      }
    }

    const reset = response.headers.get('x-ratelimit-reset');
    if (reset) {
      const resetSeconds = Number.parseInt(reset, 10);
      if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
        const delay = (resetSeconds * 1000) - Date.now();
        if (delay > 0) {
          return Math.min(this.requestRetryMaxMs, delay);
        }
      }
    }

    const exponential = Math.min(this.requestRetryMaxMs, this.requestRetryBaseMs * (2 ** attempt));
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(this.requestRetryMaxMs, exponential + jitter);
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getAuthHeaders(): Record<string, string> {
    if (this.bearerToken) {
      return {
        Accept: 'application/json',
        Authorization: `Bearer ${this.bearerToken}`,
      };
    }

    if (this.basicAuth) {
      return {
        Accept: 'application/json',
        Authorization: `Basic ${this.basicAuth}`,
      };
    }

    throw new JiraConfigError('Jira auth is not configured.');
  }

  private ensureConfigured(): void {
    if (!this.baseUrl) {
      throw new JiraConfigError('Jira is not configured: missing CODEXIA_JIRA_BASE_URL.');
    }

    if (!this.basicAuth && !this.bearerToken) {
      throw new JiraConfigError(
        'Jira is not configured: set CODEXIA_JIRA_EMAIL + CODEXIA_JIRA_API_TOKEN, or CODEXIA_JIRA_BEARER_TOKEN.',
      );
    }
  }

  private parseNumeric(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private tryParseDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private dateOrEpoch(value: string | null | undefined): Date {
    return this.tryParseDate(value) || new Date(0);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private round(value: number, decimals = 0): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  private average(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private getCacheValue<T>(cache: Map<string, JiraCacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    return entry.value;
  }

  private setCacheValue<T>(cache: Map<string, JiraCacheEntry<T>>, key: string, value: T): void {
    cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

}
