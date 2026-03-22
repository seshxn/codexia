import { computeJiraFlowMetrics } from './jira-flow.js';
import { GitHubAnalyticsService, type GitHubDeployment, type GitHubPullRequest } from './github.js';
import { TeamConfigLoader } from './teams.js';
import type { JiraAnalyticsService, JiraFlowWorkItem, JiraIncidentReportItem } from './jira.js';
import type { TeamConfig } from './teams.js';

export type MetricConfidence = 'high' | 'medium' | 'low';

export interface MetricValue {
  value: number;
  source: string;
  confidence: MetricConfidence;
}

export interface EngineeringPullRequest {
  id: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  createdAt: string;
  mergedAt?: string;
  closedAt?: string;
  firstCommitAt?: string;
  firstReviewAt?: string;
  issueKeys: string[];
  state: 'open' | 'closed' | 'merged';
  baseBranch: string;
  headBranch: string;
  isDraft: boolean;
  mergedBy?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  reviewCount?: number;
}

export interface EngineeringDeployment {
  id: string;
  repo: string;
  environment: string;
  status: 'success' | 'failure' | 'in_progress' | 'queued' | 'unknown';
  createdAt: string;
  updatedAt?: string;
  sha?: string;
  source: 'github_deployment' | 'workflow_run' | 'merge_heuristic';
  confidence: MetricConfidence;
  linkedPullRequestIds: string[];
}

export interface EngineeringIncident {
  id: string;
  key: string;
  summary: string;
  createdAt: string;
  resolvedAt?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  issueKeys: string[];
  labels: string[];
  linkedDeploymentIds: string[];
  source: 'jira_incident' | 'heuristic';
  confidence: MetricConfidence;
}

export interface EngineeringWorkItem {
  id: string;
  key: string;
  title: string;
  projectKey: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  cycleTimeHours?: number;
  leadTimeHours?: number;
  issueKeys: string[];
  blockedHours?: number;
  reopened?: boolean;
}

export interface DoraMetrics {
  deploymentFrequency: MetricValue;
  leadTimeHours: MetricValue;
  changeFailureRate: MetricValue;
  meanTimeToRestoreHours: MetricValue;
}

export interface TeamReport {
  team: {
    name: string;
    repos: string[];
  };
  dora: DoraMetrics;
  pullRequestFunnel: {
    total: number;
    merged: number;
    open: number;
    reviewed: number;
    averageReviewLatencyHours: number;
  };
  githubLinkageCoverage: MetricValue;
  incidents: {
    total: number;
    active: number;
    failedChanges: number;
  };
  prHealth: {
    averagePickupTimeHours: number;
    averageMergeTimeHours: number;
    averageReviewRounds: number;
    averagePrSize: number;
    largePrRate: number;
    staleOpen: number;
    hotfixRate: number;
    mergeRate: number;
  };
  planning: {
    flowEfficiencyPct: number;
    carryoverRate: number;
    averageWipAgeHours: number;
    blockedWorkRate: number;
    forecastReliability: number;
  };
  reliability: {
    severityDistribution: Record<'low' | 'medium' | 'high' | 'critical', number>;
    repeatIncidentRate: number;
    incidentLinkageCoverage: MetricValue;
  };
  throughput: {
    completedWorkItems: number;
    deployments: number;
    deployedRepos: number;
    workItemsByType: Array<{
      issueType: string;
      throughput: number;
    }>;
  };
  peopleRisk: {
    topAuthorShare: MetricValue;
    topMergerShare: MetricValue;
    afterHoursDeploymentRate: MetricValue;
  };
  linkageQuality: {
    githubLinkageCoverage: MetricValue;
    deploymentTraceabilityCoverage: MetricValue;
    incidentLinkageCoverage: MetricValue;
    incidentDeploymentCoverage: MetricValue;
  };
  deploymentTimeline: Array<{
    id: string;
    repo: string;
    environment: string;
    createdAt: string;
    status: EngineeringDeployment['status'];
    source: EngineeringDeployment['source'];
    confidence: MetricConfidence;
    linkedIncidentCount: number;
  }>;
  recentIncidents: EngineeringIncident[];
  flow: ReturnType<typeof computeJiraFlowMetrics>;
}

export interface EngineeringOverview {
  generatedAt: string;
  teams: Array<Pick<TeamReport, 'team' | 'dora' | 'incidents' | 'githubLinkageCoverage'>>;
  portfolioDora: DoraMetrics;
  activeIncidents: number;
  failedChanges: number;
  totalPullRequests: number;
}

export interface EngineeringConfigStatus {
  enabled: boolean;
  teamConfig: {
    enabled: boolean;
    path: string;
    message: string;
    teamsConfigured: number;
  };
  providers: {
    github: {
      enabled: boolean;
      apiUrl: string | null;
      message: string;
    };
    jira: {
      enabled: boolean;
      baseUrl: string | null;
      authMode: 'none' | 'basic' | 'bearer';
      message: string;
    };
  };
}

export interface DoraMetricsInput {
  pullRequests: EngineeringPullRequest[];
  deployments: EngineeringDeployment[];
  incidents: EngineeringIncident[];
  lookbackDays: number;
  now?: string;
}

export interface TeamReportInput extends DoraMetricsInput {
  team: TeamConfig;
  workItems: EngineeringWorkItem[];
}

interface EngineeringIntelligenceServiceOptions {
  repoRoot: string;
  github?: GitHubAnalyticsService;
  jira?: JiraAnalyticsService;
  teamConfigLoader?: TeamConfigLoader;
}

export const computeDoraMetrics = ({
  pullRequests,
  deployments,
  incidents,
  lookbackDays,
  now,
}: DoraMetricsInput): DoraMetrics => {
  const nowDate = new Date(now || new Date().toISOString());
  const lookbackStart = new Date(nowDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const scopedDeployments = deployments.filter((deployment) => {
    const createdAt = new Date(deployment.createdAt);
    return createdAt >= lookbackStart && deployment.status === 'success';
  });
  const mergedPullRequests = pullRequests.filter((pull) => pull.state === 'merged' && pull.mergedAt);

  const leadTimes = scopedDeployments.flatMap((deployment) => {
    const linkedPulls = mergedPullRequests.filter((pull) => deployment.linkedPullRequestIds.includes(pull.id));
    return linkedPulls
      .map((pull) => {
        const start = pull.firstCommitAt || pull.createdAt;
        return hoursBetween(start, deployment.createdAt);
      })
      .filter((value) => value >= 0);
  });

  const failedDeployments = scopedDeployments.filter((deployment) =>
    incidents.some((incident) =>
      incident.linkedDeploymentIds.includes(deployment.id)
      || incident.issueKeys.some((key) => {
        const linkedPulls = mergedPullRequests.filter((pull) => deployment.linkedPullRequestIds.includes(pull.id));
        return linkedPulls.some((pull) => pull.issueKeys.includes(key));
      }),
    ),
  );

  const restoreTimes = incidents
    .filter((incident) => incident.resolvedAt)
    .map((incident) => hoursBetween(incident.createdAt, incident.resolvedAt!));

  return {
    deploymentFrequency: {
      value: scopedDeployments.length,
      source: deployments.some((deployment) => deployment.source === 'github_deployment') ? 'github_deployments' : 'deployment_heuristic',
      confidence: minConfidence(scopedDeployments.map((deployment) => deployment.confidence)),
    },
    leadTimeHours: {
      value: round(median(leadTimes), 0),
      source: scopedDeployments.every((deployment) => deployment.source === 'github_deployment')
        ? 'github_deployments'
        : 'mixed_deployment_sources',
      confidence: leadTimes.length > 0 ? minConfidence(scopedDeployments.map((deployment) => deployment.confidence)) : 'low',
    },
    changeFailureRate: {
      value: scopedDeployments.length > 0 ? round((failedDeployments.length / scopedDeployments.length) * 100, 1) : 0,
      source: incidents.every((incident) => incident.source === 'jira_incident') ? 'jira_incidents' : 'incident_heuristic',
      confidence: minConfidence(incidents.map((incident) => incident.confidence)),
    },
    meanTimeToRestoreHours: {
      value: round(median(restoreTimes), 1),
      source: incidents.every((incident) => incident.source === 'jira_incident') ? 'jira_incidents' : 'incident_heuristic',
      confidence: minConfidence(incidents.map((incident) => incident.confidence)),
    },
  };
};

export const buildTeamReport = ({
  team,
  pullRequests,
  deployments,
  incidents,
  workItems,
  lookbackDays,
  now,
}: TeamReportInput): TeamReport => {
  const nowIso = now || new Date().toISOString();
  const repos = new Set(team.repos);
  const scopedPullRequests = pullRequests.filter((pull) => repos.has(pull.repo));
  const scopedDeployments = deployments.filter((deployment) => repos.has(deployment.repo));
  const scopedIssueKeys = new Set(workItems.map((item) => item.key));
  const scopedIncidents = incidents.filter((incident) =>
    incident.issueKeys.some((key) => scopedIssueKeys.has(key))
    || incident.linkedDeploymentIds.some((id) => scopedDeployments.some((deployment) => deployment.id === id)),
  );

  const jiraFlowIssues = workItems.map((item) => ({
    key: item.key,
    projectKey: item.projectKey,
    issueType: item.type,
    status: item.status,
    createdAt: item.createdAt,
    resolvedAt: item.completedAt,
    labels: [],
    changelog: item.startedAt
      ? [
          { from: 'Backlog', to: 'In Progress', at: item.startedAt },
          ...(item.completedAt ? [{ from: 'In Progress', to: 'Done', at: item.completedAt }] : []),
        ]
      : [],
  }));

  const reviewed = scopedPullRequests.filter((pull) => pull.firstReviewAt);
  const reviewLatencies = reviewed.map((pull) => hoursBetween(pull.createdAt, pull.firstReviewAt!));
  const linkedIssueKeys = new Set(scopedPullRequests.flatMap((pull) => pull.issueKeys));
  const flow = computeJiraFlowMetrics(jiraFlowIssues, {
    lookbackDays,
    now,
  });
  const prHealth = computePrHealth(scopedPullRequests, nowIso);
  const planning = computePlanningMetrics(workItems, nowIso);
  const reliability = computeReliabilityMetrics(scopedIncidents);
  const throughput = computeThroughputMetrics(scopedDeployments, workItems);
  const peopleRisk = computePeopleRisk(scopedPullRequests, scopedDeployments);
  const linkageQuality = computeLinkageQuality(scopedPullRequests, scopedDeployments, scopedIncidents, workItems);

  return {
    team: {
      name: team.name,
      repos: [...repos],
    },
    dora: computeDoraMetrics({
      pullRequests: scopedPullRequests,
      deployments: scopedDeployments,
      incidents: scopedIncidents,
      lookbackDays,
      now,
    }),
    pullRequestFunnel: {
      total: scopedPullRequests.length,
      merged: scopedPullRequests.filter((pull) => pull.state === 'merged').length,
      open: scopedPullRequests.filter((pull) => pull.state === 'open').length,
      reviewed: reviewed.length,
      averageReviewLatencyHours: round(average(reviewLatencies), 1),
    },
    githubLinkageCoverage: {
      value: workItems.length > 0 ? round((linkedIssueKeys.size / workItems.length) * 100, 1) : 0,
      source: 'github_pr_issue_keys',
      confidence: 'medium',
    },
    incidents: {
      total: scopedIncidents.length,
      active: scopedIncidents.filter((incident) => !incident.resolvedAt).length,
      failedChanges: scopedDeployments.filter((deployment) => scopedIncidents.some((incident) => incident.linkedDeploymentIds.includes(deployment.id))).length,
    },
    prHealth,
    planning: {
      ...planning,
      forecastReliability: flow.trends.forecastReliability,
    },
    reliability,
    throughput,
    peopleRisk,
    linkageQuality,
    deploymentTimeline: scopedDeployments
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((deployment) => ({
        id: deployment.id,
        repo: deployment.repo,
        environment: deployment.environment,
        createdAt: deployment.createdAt,
        status: deployment.status,
        source: deployment.source,
        confidence: deployment.confidence,
        linkedIncidentCount: scopedIncidents.filter((incident) =>
          incident.linkedDeploymentIds.includes(deployment.id)
          || incident.issueKeys.some((key) => scopedPullRequests
            .filter((pull) => deployment.linkedPullRequestIds.includes(pull.id))
            .some((pull) => pull.issueKeys.includes(key))),
        ).length,
      })),
    recentIncidents: scopedIncidents
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 10),
    flow,
  };
};

export const buildEngineeringOverview = (
  reports: TeamReport[],
  generatedAt = new Date().toISOString(),
): EngineeringOverview => {
  const portfolioDora = computeAggregateDora(reports.map((report) => report.dora));
  return {
    generatedAt,
    teams: reports.map((report) => ({
      team: report.team,
      dora: report.dora,
      incidents: report.incidents,
      githubLinkageCoverage: report.githubLinkageCoverage,
    })),
    portfolioDora,
    activeIncidents: reports.reduce((sum, report) => sum + report.incidents.active, 0),
    failedChanges: reports.reduce((sum, report) => sum + report.incidents.failedChanges, 0),
    totalPullRequests: reports.reduce((sum, report) => sum + report.pullRequestFunnel.total, 0),
  };
};

export type { TeamConfig } from './teams.js';

export class EngineeringIntelligenceService {
  private readonly teamConfigLoader: TeamConfigLoader;
  private readonly github: GitHubAnalyticsService;
  private readonly jira: JiraAnalyticsService | null;

  constructor(options: EngineeringIntelligenceServiceOptions) {
    this.teamConfigLoader = options.teamConfigLoader || new TeamConfigLoader(options.repoRoot);
    this.github = options.github || new GitHubAnalyticsService();
    this.jira = options.jira || null;
  }

  async getConfig(): Promise<EngineeringConfigStatus> {
    const teamConfig = await this.teamConfigLoader.load();
    const github = this.github.getConfig();
    const jira = this.jira?.getConfig() || {
      enabled: false,
      baseUrl: null,
      authMode: 'none' as const,
      message: 'Jira analytics is unavailable.',
    };

    return {
      enabled: teamConfig.enabled && (github.enabled || jira.enabled),
      teamConfig: {
        enabled: teamConfig.enabled,
        path: teamConfig.path,
        message: teamConfig.message,
        teamsConfigured: teamConfig.teams.length,
      },
      providers: {
        github,
        jira,
      },
    };
  }

  async getTeams(): Promise<Array<{ name: string; repos: string[] }>> {
    const config = await this.teamConfigLoader.load();
    return config.teams.map((team) => ({
      name: team.name,
      repos: team.repos,
    }));
  }

  async getOverview(lookbackDays = 90): Promise<EngineeringOverview> {
    const config = await this.teamConfigLoader.load();
    const reports = await Promise.all(config.teams.map((team) => this.getReportForTeam(team, lookbackDays)));
    return buildEngineeringOverview(reports);
  }

  async getTeamReport(teamName: string, lookbackDays = 90): Promise<TeamReport> {
    const config = await this.teamConfigLoader.load();
    const team = config.teams.find((item) => item.name.toLowerCase() === teamName.toLowerCase());
    if (!team) {
      throw new Error(`BadRequest: Unknown engineering team "${teamName}".`);
    }

    return this.getReportForTeam(team, lookbackDays);
  }

  async getRepoReport(repo: string, lookbackDays = 90): Promise<TeamReport> {
    const config = await this.teamConfigLoader.load();
    const team = config.teams.find((item) => item.repos.includes(repo));
    if (!team) {
      throw new Error(`BadRequest: No engineering team is mapped to repo "${repo}".`);
    }

    return this.getReportForTeam({
      ...team,
      repos: [repo],
    }, lookbackDays);
  }

  private async getReportForTeam(team: TeamConfig, lookbackDays: number): Promise<TeamReport> {
    const [pullRequests, deployments, workItems, incidents] = await Promise.all([
      this.collectPullRequests(team, lookbackDays),
      this.collectDeployments(team, lookbackDays),
      this.collectWorkItems(team, lookbackDays),
      this.collectIncidents(team, lookbackDays),
    ]);

    return buildTeamReport({
      team,
      pullRequests,
      deployments,
      incidents,
      workItems,
      lookbackDays,
    });
  }

  private async collectPullRequests(team: TeamConfig, lookbackDays: number): Promise<EngineeringPullRequest[]> {
    if (!this.github.getConfig().enabled) {
      return [];
    }

    const snapshots = await Promise.all(
      team.repos.map(async (repo) => {
        const pulls = await this.github.getPullRequests(repo, lookbackDays);
        return pulls.map(this.mapPullRequest);
      }),
    );

    return snapshots.flat();
  }

  private async collectDeployments(team: TeamConfig, lookbackDays: number): Promise<EngineeringDeployment[]> {
    if (!this.github.getConfig().enabled) {
      return [];
    }

    const repoPulls = await this.collectPullRequests(team, lookbackDays);
    const snapshots = await Promise.all(
      team.repos.map(async (repo) => {
        const deployments = await this.github.getDeployments(repo, lookbackDays, {
          environments: team.deployments?.environments,
        });
        if (deployments.length > 0) {
          return deployments.map((deployment) => this.mapDeployment(deployment));
        }

        return createMergeHeuristicDeployments(
          repoPulls.filter((pull) => pull.repo === repo),
          team.deployments?.branches || ['main', 'master'],
        );
      }),
    );

    return snapshots.flat();
  }

  private async collectWorkItems(team: TeamConfig, lookbackDays: number): Promise<EngineeringWorkItem[]> {
    if (!this.jira?.getConfig().enabled) {
      return [];
    }

    const projectKeys = await this.resolveProjectKeys(team);
    if (projectKeys.length === 0) {
      return [];
    }

    const flow = await this.jira.getFlowSnapshot({
      projectKeys,
      lookbackDays,
    });

    return flow.workItems.map(this.mapWorkItem);
  }

  private async collectIncidents(team: TeamConfig, lookbackDays: number): Promise<EngineeringIncident[]> {
    if (!this.jira?.getConfig().enabled || !team.incidents) {
      return [];
    }

    const incidents = await this.jira.getIncidentSnapshot({
      ...team.incidents,
      lookbackDays,
    });

    return incidents.map(this.mapIncident);
  }

  private async resolveProjectKeys(team: TeamConfig): Promise<string[]> {
    const configured = new Set((team.jira?.projectKeys || []).map((item) => item.toUpperCase()));
    if (!this.jira?.getConfig().enabled) {
      return [...configured];
    }

    for (const boardId of team.jira?.boardIds || []) {
      const board = await this.jira.getBoard(boardId);
      if (board.projectKey) {
        configured.add(board.projectKey.toUpperCase());
      }
    }

    return [...configured];
  }

  private mapPullRequest = (pull: GitHubPullRequest): EngineeringPullRequest => ({
    id: pull.id,
    repo: pull.repo,
    number: pull.number,
    title: pull.title,
    author: pull.author,
    createdAt: pull.createdAt,
    mergedAt: pull.mergedAt,
    closedAt: pull.closedAt,
    firstCommitAt: pull.firstCommitAt,
    firstReviewAt: pull.firstReviewAt,
    issueKeys: pull.issueKeys,
    state: pull.state,
    baseBranch: pull.baseBranch,
    headBranch: pull.headBranch,
    isDraft: pull.isDraft,
    mergedBy: pull.mergedBy,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changedFiles,
    reviewCount: pull.reviewCount,
  });

  private mapDeployment = (deployment: GitHubDeployment): EngineeringDeployment => ({
    id: deployment.id,
    repo: deployment.repo,
    environment: deployment.environment,
    status: deployment.status,
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt,
    sha: deployment.sha,
    source: deployment.source,
    confidence: deployment.confidence,
    linkedPullRequestIds: deployment.linkedPullRequestIds,
  });

  private mapWorkItem = (item: JiraFlowWorkItem): EngineeringWorkItem => ({
    id: item.id,
    key: item.key,
    title: item.title,
    projectKey: item.projectKey,
    type: item.type,
    status: item.status,
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    cycleTimeHours: item.cycleTimeHours,
    leadTimeHours: item.leadTimeHours,
    issueKeys: [item.key],
    blockedHours: item.blockedHours,
    reopened: item.reopened,
  });

  private mapIncident = (incident: JiraIncidentReportItem): EngineeringIncident => ({
    id: incident.id,
    key: incident.key,
    summary: incident.summary,
    createdAt: incident.createdAt,
    resolvedAt: incident.resolvedAt,
    severity: incident.severity,
    issueKeys: incident.issueKeys,
    labels: incident.labels,
    linkedDeploymentIds: [],
    source: incident.source,
    confidence: incident.confidence,
  });
}

const computeAggregateDora = (metrics: DoraMetrics[]): DoraMetrics => ({
  deploymentFrequency: aggregateMetric(metrics.map((item) => item.deploymentFrequency), 'aggregate'),
  leadTimeHours: aggregateMetric(metrics.map((item) => item.leadTimeHours), 'aggregate'),
  changeFailureRate: aggregateMetric(metrics.map((item) => item.changeFailureRate), 'aggregate'),
  meanTimeToRestoreHours: aggregateMetric(metrics.map((item) => item.meanTimeToRestoreHours), 'aggregate'),
});

const computePrHealth = (pullRequests: EngineeringPullRequest[], nowIso: string) => {
  const merged = pullRequests.filter((pull) => pull.state === 'merged' && pull.mergedAt);
  const reviewed = pullRequests.filter((pull) => pull.firstReviewAt);
  const open = pullRequests.filter((pull) => pull.state === 'open');
  const pickupTimes = reviewed.map((pull) => hoursBetween(pull.createdAt, pull.firstReviewAt!));
  const mergeTimes = merged.map((pull) => hoursBetween(pull.createdAt, pull.mergedAt!));
  const reviewRounds = reviewed.map((pull) => pull.reviewCount || 0);
  const prSizes = pullRequests.map((pull) => (pull.additions || 0) + (pull.deletions || 0));
  const largePrCount = pullRequests.filter((pull) => ((pull.additions || 0) + (pull.deletions || 0)) >= 500 || (pull.changedFiles || 0) >= 20).length;
  const hotfixCount = pullRequests.filter((pull) => /(hotfix|revert|rollback)/i.test(`${pull.title} ${pull.headBranch}`)).length;

  return {
    averagePickupTimeHours: round(average(pickupTimes), 1),
    averageMergeTimeHours: round(average(mergeTimes), 1),
    averageReviewRounds: round(average(reviewRounds), 1),
    averagePrSize: round(average(prSizes), 1),
    largePrRate: pullRequests.length > 0 ? round((largePrCount / pullRequests.length) * 100, 1) : 0,
    staleOpen: open.filter((pull) => hoursBetween(pull.createdAt, nowIso) >= 72).length,
    hotfixRate: pullRequests.length > 0 ? round((hotfixCount / pullRequests.length) * 100, 1) : 0,
    mergeRate: pullRequests.length > 0 ? round((merged.length / pullRequests.length) * 100, 1) : 0,
  };
};

const computePlanningMetrics = (workItems: EngineeringWorkItem[], nowIso: string) => {
  const unresolved = workItems.filter((item) => !item.completedAt);
  const blocked = workItems.filter((item) => (item.blockedHours || 0) > 0);
  const activeHours = workItems.map((item) => item.cycleTimeHours || 0);
  const queueHours = workItems.map((item) => Math.max(0, (item.leadTimeHours || 0) - (item.cycleTimeHours || 0)));
  const totalActive = activeHours.reduce((sum, value) => sum + value, 0);
  const totalQueue = queueHours.reduce((sum, value) => sum + value, 0);

  return {
    flowEfficiencyPct: (totalActive + totalQueue) > 0 ? round((totalActive / (totalActive + totalQueue)) * 100, 1) : 0,
    carryoverRate: workItems.length > 0 ? round((unresolved.length / workItems.length) * 100, 1) : 0,
    averageWipAgeHours: unresolved.length > 0
      ? round(average(unresolved.map((item) => hoursBetween(item.startedAt || item.createdAt, nowIso))), 1)
      : 0,
    blockedWorkRate: workItems.length > 0 ? round((blocked.length / workItems.length) * 100, 1) : 0,
  };
};

const computeReliabilityMetrics = (incidents: EngineeringIncident[]) => {
  const severityDistribution: Record<'low' | 'medium' | 'high' | 'critical', number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const repeatedSignatures = new Map<string, number>();
  let linkedIncidents = 0;

  for (const incident of incidents) {
    severityDistribution[incident.severity] += 1;
    if (incident.issueKeys.length > 0 || incident.linkedDeploymentIds.length > 0) {
      linkedIncidents += 1;
    }
    const signature = incident.issueKeys.slice().sort().join('|') || incident.summary.toLowerCase().replace(/\W+/g, ' ').trim();
    repeatedSignatures.set(signature, (repeatedSignatures.get(signature) || 0) + 1);
  }

  const repeated = [...repeatedSignatures.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);

  return {
    severityDistribution,
    repeatIncidentRate: incidents.length > 0 ? round((repeated / incidents.length) * 100, 1) : 0,
    incidentLinkageCoverage: {
      value: incidents.length > 0 ? round((linkedIncidents / incidents.length) * 100, 1) : 0,
      source: 'jira_incidents',
      confidence: minConfidence(incidents.map((incident) => incident.confidence)),
    },
  };
};

const computeThroughputMetrics = (deployments: EngineeringDeployment[], workItems: EngineeringWorkItem[]) => ({
  completedWorkItems: workItems.filter((item) => item.completedAt).length,
  deployments: deployments.length,
  deployedRepos: new Set(deployments.map((deployment) => deployment.repo)).size,
  workItemsByType: Array.from(new Set(workItems.map((item) => item.type)))
    .sort((a, b) => a.localeCompare(b))
    .map((issueType) => ({
      issueType,
      throughput: workItems.filter((item) => item.type === issueType && item.completedAt).length,
    })),
});

const computePeopleRisk = (pullRequests: EngineeringPullRequest[], deployments: EngineeringDeployment[]) => {
  const topAuthorShare = computeTopShare(pullRequests.map((pull) => pull.author));
  const topMergerShare = computeTopShare(pullRequests.filter((pull) => pull.mergedBy).map((pull) => pull.mergedBy!));
  const afterHoursDeploymentRate = deployments.length > 0
    ? round((deployments.filter((deployment) => isAfterHours(deployment.createdAt)).length / deployments.length) * 100, 1)
    : 0;

  return {
    topAuthorShare: {
      value: topAuthorShare,
      source: 'github_pull_requests',
      confidence: 'medium' as const,
    },
    topMergerShare: {
      value: topMergerShare,
      source: 'github_pull_requests',
      confidence: 'medium' as const,
    },
    afterHoursDeploymentRate: {
      value: afterHoursDeploymentRate,
      source: 'deployment_timestamps',
      confidence: minConfidence(deployments.map((deployment) => deployment.confidence)),
    },
  };
};

const computeLinkageQuality = (
  pullRequests: EngineeringPullRequest[],
  deployments: EngineeringDeployment[],
  incidents: EngineeringIncident[],
  workItems: EngineeringWorkItem[],
) => {
  const linkedIssues = new Set(pullRequests.flatMap((pull) => pull.issueKeys));
  const deploymentTraceabilityCount = deployments.filter((deployment) => deployment.linkedPullRequestIds.length > 0).length;
  const incidentLinkedCount = incidents.filter((incident) => incident.issueKeys.length > 0 || incident.linkedDeploymentIds.length > 0).length;
  const incidentDeploymentCount = incidents.filter((incident) => incident.linkedDeploymentIds.length > 0).length;

  return {
    githubLinkageCoverage: {
      value: workItems.length > 0 ? round((linkedIssues.size / workItems.length) * 100, 1) : 0,
      source: 'github_pr_issue_keys',
      confidence: 'medium' as const,
    },
    deploymentTraceabilityCoverage: {
      value: deployments.length > 0 ? round((deploymentTraceabilityCount / deployments.length) * 100, 1) : 0,
      source: 'deployments_to_pull_requests',
      confidence: minConfidence(deployments.map((deployment) => deployment.confidence)),
    },
    incidentLinkageCoverage: {
      value: incidents.length > 0 ? round((incidentLinkedCount / incidents.length) * 100, 1) : 0,
      source: 'incidents_to_work',
      confidence: minConfidence(incidents.map((incident) => incident.confidence)),
    },
    incidentDeploymentCoverage: {
      value: incidents.length > 0 ? round((incidentDeploymentCount / incidents.length) * 100, 1) : 0,
      source: 'incidents_to_deployments',
      confidence: minConfidence(incidents.map((incident) => incident.confidence)),
    },
  };
};

const aggregateMetric = (values: MetricValue[], source: string): MetricValue => ({
  value: round(average(values.map((value) => value.value)), 1),
  source,
  confidence: minConfidence(values.map((value) => value.confidence)),
});

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

const hoursBetween = (start: string, end: string): number => {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / (1000 * 60 * 60));
};

const minConfidence = (values: MetricConfidence[]): MetricConfidence => {
  if (values.length === 0) {
    return 'low';
  }
  if (values.includes('low')) {
    return 'low';
  }
  if (values.includes('medium')) {
    return 'medium';
  }
  return 'high';
};

const computeTopShare = (values: string[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  const max = Math.max(...counts.values());
  return round((max / values.length) * 100, 1);
};

const isAfterHours = (value: string): boolean => {
  const date = new Date(value);
  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  return day === 0 || day === 6 || hour < 7 || hour >= 18;
};

const createMergeHeuristicDeployments = (
  pullRequests: EngineeringPullRequest[],
  branches: string[],
): EngineeringDeployment[] => {
  const allowed = new Set(branches.map((branch) => branch.toLowerCase()));
  return pullRequests
    .filter((pull) => pull.state === 'merged' && pull.mergedAt && allowed.has(pull.baseBranch.toLowerCase()))
    .map((pull) => ({
      id: `heuristic-${pull.id}`,
      repo: pull.repo,
      environment: 'production',
      status: 'success',
      createdAt: pull.mergedAt!,
      source: 'merge_heuristic',
      confidence: 'low',
      linkedPullRequestIds: [pull.id],
    }));
};
