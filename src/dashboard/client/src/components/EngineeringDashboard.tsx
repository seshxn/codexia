import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, GitPullRequest, Layers3, Link2, Radar, ShieldAlert, TimerReset, TrendingUp, Users } from 'lucide-react';
import {
  fetchEngineeringConfig,
  fetchEngineeringOverview,
  fetchEngineeringRepoReport,
  fetchEngineeringTeamReport,
  fetchEngineeringTeams,
} from '../api';
import { useApi } from '../hooks/useApi';
import type { ConfidenceMetricData, TeamReportData } from '../types';
import { Card, StatCard } from './Card';
import { LoadingCard, LoadingPage } from './Loading';
import { ErrorDisplay } from './ErrorDisplay';

interface EngineeringDashboardProps {
  refreshKey: number;
}

const confidenceClass = (confidence: ConfidenceMetricData['confidence']): string => {
  if (confidence === 'high') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  if (confidence === 'medium') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }
  return 'border-red-500/30 bg-red-500/10 text-red-300';
};

const severityClass = (severity: TeamReportData['recentIncidents'][number]['severity']): string => {
  if (severity === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (severity === 'high') return 'border-orange-500/30 bg-orange-500/10 text-orange-300';
  if (severity === 'medium') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
};

const deploymentStatusClass = (status: TeamReportData['deploymentTimeline'][number]['status']): string => {
  if (status === 'success') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'failure') return 'border-red-500/30 bg-red-500/10 text-red-300';
  if (status === 'in_progress') return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
};

const formatMetric = (metric: ConfidenceMetricData, unit?: 'hours' | 'percent'): string => {
  if (unit === 'hours') {
    return `${metric.value.toFixed(metric.value % 1 === 0 ? 0 : 1)}h`;
  }
  if (unit === 'percent') {
    return `${metric.value.toFixed(metric.value % 1 === 0 ? 0 : 1)}%`;
  }
  return metric.value.toFixed(metric.value % 1 === 0 ? 0 : 1);
};

const formatNumber = (value: number, unit?: 'hours' | 'percent'): string => {
  if (unit === 'hours') {
    return `${value.toFixed(value % 1 === 0 ? 0 : 1)}h`;
  }
  if (unit === 'percent') {
    return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
  }
  return value.toFixed(value % 1 === 0 ? 0 : 1);
};

export const EngineeringDashboard = ({ refreshKey }: EngineeringDashboardProps) => {
  const config = useApi(useCallback(() => fetchEngineeringConfig(), [refreshKey]));
  const overview = useApi(useCallback(() => fetchEngineeringOverview({ lookbackDays: 90 }), [refreshKey]));
  const teams = useApi(useCallback(() => fetchEngineeringTeams(), [refreshKey]));

  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [report, setReport] = useState<TeamReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (!teams.data?.teams.length) {
      setSelectedTeam('');
      return;
    }

    if (!selectedTeam || !teams.data.teams.some((team) => team.name === selectedTeam)) {
      setSelectedTeam(teams.data.teams[0].name);
    }
  }, [selectedTeam, teams.data]);

  useEffect(() => {
    if (!selectedTeam) {
      setReport(null);
      return;
    }

    setReportLoading(true);
    setReportError(null);

    const loader = selectedRepo
      ? fetchEngineeringRepoReport(selectedRepo, { lookbackDays: 90 })
      : fetchEngineeringTeamReport(selectedTeam, { lookbackDays: 90 });

    loader
      .then(setReport)
      .catch((error) => setReportError(error instanceof Error ? error.message : 'Failed to load engineering report.'))
      .finally(() => setReportLoading(false));
  }, [selectedRepo, selectedTeam, refreshKey]);

  const selectedTeamEntry = teams.data?.teams.find((team) => team.name === selectedTeam) || null;

  useEffect(() => {
    if (!selectedTeamEntry) {
      setSelectedRepo('');
      return;
    }

    if (selectedRepo && !selectedTeamEntry.repos.includes(selectedRepo)) {
      setSelectedRepo('');
    }
  }, [selectedRepo, selectedTeamEntry]);

  if (config.loading && !config.data) {
    return <LoadingPage />;
  }

  if (config.error && !config.data) {
    return <ErrorDisplay message={`Failed to load engineering config: ${config.error.message}`} onRetry={config.refetch} />;
  }

  if (!config.data?.enabled) {
    return (
      <div className="space-y-6">
        <Card title="Engineering Intelligence" subtitle="Connect GitHub or Jira to unlock engineering analytics">
          <div className="space-y-4 text-sm text-ink-secondary">
            <p>{config.data?.teamConfig.message || 'Set CODEXIA_DASHBOARD_TEAMS_JSON to enable team analytics.'}</p>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
              <p className="text-xs uppercase tracking-wide text-ink-faint">Provider Status</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                  <p className="text-xs text-ink-faint">GitHub</p>
                  <p className="mt-1 text-sm text-ink">{config.data?.providers.github.message}</p>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                  <p className="text-xs text-ink-faint">Jira</p>
                  <p className="mt-1 text-sm text-ink">{config.data?.providers.jira.message}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <StatCard
          title="Deployments (90d)"
          value={overview.data ? formatMetric(overview.data.portfolioDora.deploymentFrequency) : '...'}
          subtitle={overview.data ? `${overview.data.teams.length} teams tracked` : undefined}
          icon={<Layers3 className="w-5 h-5 text-ink" />}
          color="blue"
        />
        <StatCard
          title="Lead Time"
          value={overview.data ? formatMetric(overview.data.portfolioDora.leadTimeHours, 'hours') : '...'}
          subtitle={overview.data ? overview.data.portfolioDora.leadTimeHours.source : undefined}
          icon={<TrendingUp className="w-5 h-5 text-ink" />}
          color="green"
        />
        <StatCard
          title="Change Failure Rate"
          value={overview.data ? formatMetric(overview.data.portfolioDora.changeFailureRate, 'percent') : '...'}
          subtitle={overview.data ? `${overview.data.failedChanges} failed changes` : undefined}
          icon={<ShieldAlert className="w-5 h-5 text-ink" />}
          color="yellow"
        />
        <StatCard
          title="MTTR"
          value={overview.data ? formatMetric(overview.data.portfolioDora.meanTimeToRestoreHours, 'hours') : '...'}
          subtitle={overview.data ? `${overview.data.activeIncidents} active incidents` : undefined}
          icon={<TimerReset className="w-5 h-5 text-ink" />}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card title="Scope" subtitle="Select a team or drill into one mapped repo" className="xl:col-span-1">
          <div className="space-y-4">
            <div>
              <label htmlFor="team-select" className="text-xs font-medium text-ink-faint uppercase tracking-wide">Team</label>
              <select
                id="team-select"
                value={selectedTeam}
                onChange={(event) => setSelectedTeam(event.target.value)}
                className="mt-2 w-full rounded-lg border border-edge-moderate bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {(teams.data?.teams || []).map((team) => (
                  <option key={team.name} value={team.name}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="repo-select" className="text-xs font-medium text-ink-faint uppercase tracking-wide">Repo Drill-down</label>
              <select
                id="repo-select"
                value={selectedRepo}
                onChange={(event) => setSelectedRepo(event.target.value)}
                className="mt-2 w-full rounded-lg border border-edge-moderate bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <option value="">All team repos</option>
                {(selectedTeamEntry?.repos || []).map((repo) => (
                  <option key={repo} value={repo}>
                    {repo}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-ink-faint border-t border-edge pt-3">
              {config.data.providers.github.enabled ? 'GitHub connected.' : config.data.providers.github.message}
              {' · '}
              {config.data.providers.jira.enabled ? 'Jira connected.' : config.data.providers.jira.message}
            </p>
          </div>
        </Card>

        <Card title="Team Comparison" subtitle="DORA and delivery health across mapped teams" className="xl:col-span-3">
          {overview.loading && !overview.data ? (
            <LoadingCard />
          ) : overview.error ? (
            <ErrorDisplay message="Failed to load engineering overview" onRetry={overview.refetch} />
          ) : (
            <div className="divide-y divide-edge">
              {overview.data!.teams.map((team) => (
                <dl key={team.team.name} className="grid grid-cols-1 gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0 lg:grid-cols-6">
                  <div className="lg:col-span-2">
                    <p className="text-sm font-semibold text-ink">{team.team.name}</p>
                    <p className="text-xs text-ink-faint">{team.team.repos.length} repos</p>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-faint">Deploys</dt>
                    <dd className="text-sm text-ink nums">{formatMetric(team.dora.deploymentFrequency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-faint">Lead Time</dt>
                    <dd className="text-sm text-ink nums">{formatMetric(team.dora.leadTimeHours, 'hours')}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-faint">Failure Rate</dt>
                    <dd className="text-sm text-ink nums">{formatMetric(team.dora.changeFailureRate, 'percent')}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-faint">Active Incidents</dt>
                    <dd className="text-sm text-ink nums">{team.incidents.active}</dd>
                  </div>
                </dl>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Selected Scope DORA" subtitle={report?.team.name || 'Loading...'} action={<Radar className="w-5 h-5 text-sky-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : reportError ? (
            <ErrorDisplay message={reportError} />
          ) : report ? (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              {[
                { label: 'Deployments', metric: report.dora.deploymentFrequency },
                { label: 'Lead Time', metric: report.dora.leadTimeHours, unit: 'hours' as const },
                { label: 'Failure Rate', metric: report.dora.changeFailureRate, unit: 'percent' as const },
                { label: 'MTTR', metric: report.dora.meanTimeToRestoreHours, unit: 'hours' as const },
              ].map((entry) => (
                <div key={entry.label}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">{entry.label}</dt>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${confidenceClass(entry.metric.confidence)}`}>
                      {entry.metric.confidence}
                    </span>
                  </div>
                  <dd className="text-2xl font-semibold text-ink nums">{formatMetric(entry.metric, entry.unit)}</dd>
                  <p className="mt-0.5 text-xs text-ink-faint">{entry.metric.source}</p>
                </div>
              ))}
            </dl>
          ) : null}
        </Card>

        <Card title="Review Funnel" subtitle="PR throughput and first-review latency" action={<GitPullRequest className="w-5 h-5 text-violet-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Total PRs</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.pullRequestFunnel.total}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Merged</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.pullRequestFunnel.merged}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Reviewed</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.pullRequestFunnel.reviewed}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Avg Review Latency</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.pullRequestFunnel.averageReviewLatencyHours.toFixed(1)}h</dd>
              </div>
            </dl>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="PR Health" subtitle="Pickup, merge speed, review depth, and risky batch size" action={<GitPullRequest className="w-5 h-5 text-fuchsia-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Pickup Time</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.prHealth.averagePickupTimeHours, 'hours')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Merge Time</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.prHealth.averageMergeTimeHours, 'hours')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Avg Review Rounds</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.prHealth.averageReviewRounds)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Avg PR Size</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.prHealth.averagePrSize)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Large PR Rate</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.prHealth.largePrRate, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Stale Open PRs</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.prHealth.staleOpen}</dd>
                <p className="mt-0.5 text-xs text-ink-faint">Hotfix rate: {formatNumber(report.prHealth.hotfixRate, 'percent')}</p>
              </div>
            </dl>
          ) : null}
        </Card>

        <Card title="Planning Quality" subtitle="Flow efficiency, carryover, WIP aging, and blocked work" action={<TrendingUp className="w-5 h-5 text-cyan-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Flow Efficiency</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.planning.flowEfficiencyPct, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Forecast Reliability</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.planning.forecastReliability, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Carryover</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.planning.carryoverRate, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Avg WIP Age</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.planning.averageWipAgeHours, 'hours')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Blocked Work Rate</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.planning.blockedWorkRate, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Queue vs Active</dt>
                <dd className="mt-1 text-sm text-ink nums">
                  {formatNumber(report.flow.queueVsActive.queueHours, 'hours')} queue · {formatNumber(report.flow.queueVsActive.activeHours, 'hours')} active
                </dd>
              </div>
            </dl>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Deployment Timeline" subtitle="Recent deploys with failure correlation" action={<Activity className="w-5 h-5 text-emerald-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="divide-y divide-edge">
              {report.deploymentTimeline.slice(0, 8).map((deployment) => (
                <div key={deployment.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{deployment.repo}</p>
                      <p className="text-xs text-ink-faint">
                        {deployment.environment} · {new Date(deployment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${deploymentStatusClass(deployment.status)}`}>
                        {deployment.status}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${confidenceClass(deployment.confidence)}`}>
                        {deployment.confidence}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    Source: {deployment.source} · Linked incidents: {deployment.linkedIncidentCount}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card title="Incidents" subtitle="Recent failure and recovery context" action={<AlertTriangle className="w-5 h-5 text-red-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="divide-y divide-edge">
              {report.recentIncidents.length === 0 ? (
                <p className="text-sm text-ink-faint">No incidents found in the current window.</p>
              ) : (
                report.recentIncidents.map((incident) => (
                  <div key={incident.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{incident.key}</p>
                        <p className="text-xs text-ink-faint">{incident.summary}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${severityClass(incident.severity)}`}>
                        {incident.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-faint">
                      Created {new Date(incident.createdAt).toLocaleString()}
                      {incident.resolvedAt ? ` · Resolved ${new Date(incident.resolvedAt).toLocaleString()}` : ' · Still active'}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Reliability Depth" subtitle="Incident severity, repeats, and escaped-change context" action={<ShieldAlert className="w-5 h-5 text-red-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Repeat Incident Rate</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatNumber(report.reliability.repeatIncidentRate, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Incident Linkage</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatMetric(report.reliability.incidentLinkageCoverage, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Severity Mix</dt>
                <dd className="mt-1 text-sm text-ink nums">
                  {report.reliability.severityDistribution.critical}C · {report.reliability.severityDistribution.high}H · {report.reliability.severityDistribution.medium}M · {report.reliability.severityDistribution.low}L
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Failed Changes</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.incidents.failedChanges}</dd>
              </div>
            </dl>
          ) : null}
        </Card>

        <Card title="Throughput" subtitle="Completed work, deploy coverage, and work mix" action={<Activity className="w-5 h-5 text-amber-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="space-y-5">
              <dl className="grid grid-cols-3 gap-x-6">
                <div>
                  <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Completed Items</dt>
                  <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.throughput.completedWorkItems}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Deployments</dt>
                  <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.throughput.deployments}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Deployed Repos</dt>
                  <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.throughput.deployedRepos}</dd>
                </div>
              </dl>
              <div className="divide-y divide-edge border-t border-edge">
                {report.throughput.workItemsByType.map((item) => (
                  <div key={item.issueType} className="flex items-center justify-between py-2">
                    <span className="text-sm text-ink">{item.issueType}</span>
                    <span className="text-sm text-ink-secondary nums">{item.throughput}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Jira Flow Diagnostics" subtitle="Queue health, throughput, and unplanned work" action={<TrendingUp className="w-5 h-5 text-cyan-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Throughput</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.flow.summary.throughput}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Unplanned Work</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.flow.summary.unplannedWorkRatio.toFixed(1)}%</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Reopen Rate</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.flow.summary.reopenRate.toFixed(1)}%</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Forecast Reliability</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{report.flow.trends.forecastReliability.toFixed(1)}%</dd>
              </div>
            </dl>
          ) : null}
        </Card>

        <Card title="Flow By Issue Type" subtitle="Cycle and lead time medians by work type" action={<Activity className="w-5 h-5 text-amber-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="divide-y divide-edge">
              {report.flow.issueTypes.map((issueType) => (
                <dl key={issueType.issueType} className="grid grid-cols-1 gap-x-4 py-3 first:pt-0 last:pb-0 md:grid-cols-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">{issueType.issueType}</p>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-faint">Throughput</dt>
                    <dd className="text-sm text-ink nums">{issueType.throughput}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-faint">Cycle Time</dt>
                    <dd className="text-sm text-ink nums">{issueType.medianCycleTimeHours.toFixed(1)}h</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-faint">Lead Time</dt>
                    <dd className="text-sm text-ink nums">{issueType.medianLeadTimeHours.toFixed(1)}h</dd>
                  </div>
                </dl>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="People Risk" subtitle="Contribution concentration and out-of-hours change activity" action={<Users className="w-5 h-5 text-indigo-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <dl className="grid grid-cols-3 gap-x-6">
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Top Author Share</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatMetric(report.peopleRisk.topAuthorShare, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Top Merger Share</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatMetric(report.peopleRisk.topMergerShare, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">After-Hours Deploys</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatMetric(report.peopleRisk.afterHoursDeploymentRate, 'percent')}</dd>
              </div>
            </dl>
          ) : null}
        </Card>

        <Card title="Linkage Quality" subtitle="Traceability between work, PRs, deployments, and incidents" action={<Link2 className="w-5 h-5 text-emerald-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">GitHub to Jira</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatMetric(report.linkageQuality.githubLinkageCoverage, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Deploy Traceability</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatMetric(report.linkageQuality.deploymentTraceabilityCoverage, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Incident Linkage</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatMetric(report.linkageQuality.incidentLinkageCoverage, 'percent')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-faint uppercase tracking-wide">Incident to Deploy</dt>
                <dd className="mt-1 text-2xl font-semibold text-ink nums">{formatMetric(report.linkageQuality.incidentDeploymentCoverage, 'percent')}</dd>
              </div>
            </dl>
          ) : null}
        </Card>
      </div>
    </div>
  );
};
