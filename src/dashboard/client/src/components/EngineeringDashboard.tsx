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
          <div className="space-y-4 text-sm text-neutral-300">
            <p>{config.data?.teamConfig.message || 'Set CODEXIA_DASHBOARD_TEAMS_JSON to enable team analytics.'}</p>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Provider Status</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                  <p className="text-xs text-neutral-500">GitHub</p>
                  <p className="mt-1 text-sm text-white">{config.data?.providers.github.message}</p>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
                  <p className="text-xs text-neutral-500">Jira</p>
                  <p className="mt-1 text-sm text-white">{config.data?.providers.jira.message}</p>
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
          icon={<Layers3 className="w-5 h-5 text-white" />}
          color="blue"
        />
        <StatCard
          title="Lead Time"
          value={overview.data ? formatMetric(overview.data.portfolioDora.leadTimeHours, 'hours') : '...'}
          subtitle={overview.data ? overview.data.portfolioDora.leadTimeHours.source : undefined}
          icon={<TrendingUp className="w-5 h-5 text-white" />}
          color="green"
        />
        <StatCard
          title="Change Failure Rate"
          value={overview.data ? formatMetric(overview.data.portfolioDora.changeFailureRate, 'percent') : '...'}
          subtitle={overview.data ? `${overview.data.failedChanges} failed changes` : undefined}
          icon={<ShieldAlert className="w-5 h-5 text-white" />}
          color="yellow"
        />
        <StatCard
          title="MTTR"
          value={overview.data ? formatMetric(overview.data.portfolioDora.meanTimeToRestoreHours, 'hours') : '...'}
          subtitle={overview.data ? `${overview.data.activeIncidents} active incidents` : undefined}
          icon={<TimerReset className="w-5 h-5 text-white" />}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card title="Scope" subtitle="Select a team or drill into one mapped repo" className="xl:col-span-1">
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Team</p>
              <select
                value={selectedTeam}
                onChange={(event) => setSelectedTeam(event.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              >
                {(teams.data?.teams || []).map((team) => (
                  <option key={team.name} value={team.name}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Repo Drill-down</p>
              <select
                value={selectedRepo}
                onChange={(event) => setSelectedRepo(event.target.value)}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              >
                <option value="">All team repos</option>
                {(selectedTeamEntry?.repos || []).map((repo) => (
                  <option key={repo} value={repo}>
                    {repo}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 text-xs text-neutral-400">
              {config.data.providers.github.enabled ? 'GitHub connected.' : config.data.providers.github.message}
              <br />
              {config.data.providers.jira.enabled ? 'Jira connected.' : config.data.providers.jira.message}
            </div>
          </div>
        </Card>

        <Card title="Team Comparison" subtitle="DORA and delivery health across mapped teams" className="xl:col-span-3">
          {overview.loading && !overview.data ? (
            <LoadingCard />
          ) : overview.error ? (
            <ErrorDisplay message="Failed to load engineering overview" onRetry={overview.refetch} />
          ) : (
            <div className="space-y-3">
              {overview.data!.teams.map((team) => (
                <div key={team.team.name} className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 lg:grid-cols-6">
                  <div className="lg:col-span-2">
                    <p className="text-sm font-medium text-white">{team.team.name}</p>
                    <p className="text-xs text-neutral-500">{team.team.repos.length} repos</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Deploys</p>
                    <p className="mt-1 text-sm text-white">{formatMetric(team.dora.deploymentFrequency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Lead Time</p>
                    <p className="mt-1 text-sm text-white">{formatMetric(team.dora.leadTimeHours, 'hours')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Failure Rate</p>
                    <p className="mt-1 text-sm text-white">{formatMetric(team.dora.changeFailureRate, 'percent')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Active Incidents</p>
                    <p className="mt-1 text-sm text-white">{team.incidents.active}</p>
                  </div>
                </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Deployments', metric: report.dora.deploymentFrequency },
                { label: 'Lead Time', metric: report.dora.leadTimeHours, unit: 'hours' as const },
                { label: 'Failure Rate', metric: report.dora.changeFailureRate, unit: 'percent' as const },
                { label: 'MTTR', metric: report.dora.meanTimeToRestoreHours, unit: 'hours' as const },
              ].map((entry) => (
                <div key={entry.label} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-neutral-500">{entry.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white nums">{formatMetric(entry.metric, entry.unit)}</p>
                      <p className="mt-1 text-xs text-neutral-500">{entry.metric.source}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${confidenceClass(entry.metric.confidence)}`}>
                      {entry.metric.confidence}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card title="Review Funnel" subtitle="PR throughput and first-review latency" action={<GitPullRequest className="w-5 h-5 text-violet-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Total PRs</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.pullRequestFunnel.total}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Merged</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.pullRequestFunnel.merged}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Reviewed</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.pullRequestFunnel.reviewed}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Avg Review Latency</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.pullRequestFunnel.averageReviewLatencyHours.toFixed(1)}h</p>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="PR Health" subtitle="Pickup, merge speed, review depth, and risky batch size" action={<GitPullRequest className="w-5 h-5 text-fuchsia-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Pickup Time</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.prHealth.averagePickupTimeHours, 'hours')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Merge Time</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.prHealth.averageMergeTimeHours, 'hours')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Avg Review Rounds</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.prHealth.averageReviewRounds)}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Avg PR Size</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.prHealth.averagePrSize)}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Large PR Rate</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.prHealth.largePrRate, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Stale Open PRs</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.prHealth.staleOpen}</p>
                <p className="mt-1 text-xs text-neutral-500">Hotfix rate: {formatNumber(report.prHealth.hotfixRate, 'percent')}</p>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Planning Quality" subtitle="Flow efficiency, carryover, WIP aging, and blocked work" action={<TrendingUp className="w-5 h-5 text-cyan-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Flow Efficiency</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.planning.flowEfficiencyPct, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Forecast Reliability</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.planning.forecastReliability, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Carryover</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.planning.carryoverRate, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Avg WIP Age</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.planning.averageWipAgeHours, 'hours')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Blocked Work Rate</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.planning.blockedWorkRate, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Queue vs Active</p>
                <p className="mt-2 text-sm text-white">
                  {formatNumber(report.flow.queueVsActive.queueHours, 'hours')} queue
                </p>
                <p className="mt-1 text-sm text-white">
                  {formatNumber(report.flow.queueVsActive.activeHours, 'hours')} active
                </p>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Deployment Timeline" subtitle="Recent deploys with failure correlation" action={<Activity className="w-5 h-5 text-emerald-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="space-y-3">
              {report.deploymentTimeline.slice(0, 8).map((deployment) => (
                <div key={deployment.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{deployment.repo}</p>
                      <p className="text-xs text-neutral-500">
                        {deployment.environment} · {new Date(deployment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${deploymentStatusClass(deployment.status)}`}>
                        {deployment.status}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${confidenceClass(deployment.confidence)}`}>
                        {deployment.confidence}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-neutral-400">
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
            <div className="space-y-3">
              {report.recentIncidents.length === 0 ? (
                <p className="text-sm text-neutral-500">No incidents found in the current window.</p>
              ) : (
                report.recentIncidents.map((incident) => (
                  <div key={incident.id} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{incident.key}</p>
                        <p className="text-xs text-neutral-500">{incident.summary}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${severityClass(incident.severity)}`}>
                        {incident.severity}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-neutral-400">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Repeat Incident Rate</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatNumber(report.reliability.repeatIncidentRate, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Incident Linkage</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatMetric(report.reliability.incidentLinkageCoverage, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Severity Mix</p>
                <p className="mt-2 text-sm text-white">
                  Critical {report.reliability.severityDistribution.critical} · High {report.reliability.severityDistribution.high}
                </p>
                <p className="mt-1 text-sm text-white">
                  Medium {report.reliability.severityDistribution.medium} · Low {report.reliability.severityDistribution.low}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Failed Changes</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.incidents.failedChanges}</p>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Throughput" subtitle="Completed work, deploy coverage, and work mix" action={<Activity className="w-5 h-5 text-amber-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Completed Items</p>
                  <p className="mt-2 text-2xl font-semibold text-white nums">{report.throughput.completedWorkItems}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Deployments</p>
                  <p className="mt-2 text-2xl font-semibold text-white nums">{report.throughput.deployments}</p>
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Deployed Repos</p>
                  <p className="mt-2 text-2xl font-semibold text-white nums">{report.throughput.deployedRepos}</p>
                </div>
              </div>
              <div className="space-y-2">
                {report.throughput.workItemsByType.map((item) => (
                  <div key={item.issueType} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/40 px-4 py-3">
                    <span className="text-sm text-white">{item.issueType}</span>
                    <span className="text-sm text-neutral-300">{item.throughput}</span>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Throughput</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.flow.summary.throughput}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Unplanned Work</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.flow.summary.unplannedWorkRatio.toFixed(1)}%</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Reopen Rate</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.flow.summary.reopenRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Forecast Reliability</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{report.flow.trends.forecastReliability.toFixed(1)}%</p>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Flow By Issue Type" subtitle="Cycle and lead time medians by work type" action={<Activity className="w-5 h-5 text-amber-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="space-y-3">
              {report.flow.issueTypes.map((issueType) => (
                <div key={issueType.issueType} className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 md:grid-cols-4">
                  <div>
                    <p className="text-sm font-medium text-white">{issueType.issueType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Throughput</p>
                    <p className="mt-1 text-sm text-white">{issueType.throughput}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Cycle Time</p>
                    <p className="mt-1 text-sm text-white">{issueType.medianCycleTimeHours.toFixed(1)}h</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Lead Time</p>
                    <p className="mt-1 text-sm text-white">{issueType.medianLeadTimeHours.toFixed(1)}h</p>
                  </div>
                </div>
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
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Top Author Share</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatMetric(report.peopleRisk.topAuthorShare, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Top Merger Share</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatMetric(report.peopleRisk.topMergerShare, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">After-Hours Deploys</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatMetric(report.peopleRisk.afterHoursDeploymentRate, 'percent')}</p>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Linkage Quality" subtitle="Traceability between work, PRs, deployments, and incidents" action={<Link2 className="w-5 h-5 text-emerald-400" />}>
          {reportLoading && !report ? (
            <LoadingCard />
          ) : report ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">GitHub to Jira</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatMetric(report.linkageQuality.githubLinkageCoverage, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Deploy Traceability</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatMetric(report.linkageQuality.deploymentTraceabilityCoverage, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Incident Linkage</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatMetric(report.linkageQuality.incidentLinkageCoverage, 'percent')}</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
                <p className="text-xs uppercase tracking-wide text-neutral-500">Incident to Deploy</p>
                <p className="mt-2 text-2xl font-semibold text-white nums">{formatMetric(report.linkageQuality.incidentDeploymentCoverage, 'percent')}</p>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
};
