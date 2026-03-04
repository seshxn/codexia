import type { JiraAiInsightsData, JiraSprintReportData } from '../types';
import { useJiraAnalytics } from '../hooks/useJiraAnalytics';

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

const formatDate = (value?: string): string => {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }

  return parsed.toLocaleDateString();
};

const riskBadgeClass = (risk: 'low' | 'medium' | 'high'): string => {
  if (risk === 'low') {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  }
  if (risk === 'medium') {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  }
  return 'bg-red-500/20 text-red-300 border-red-500/30';
};

const healthBadgeClass = (status: JiraSprintReportData['health']['status']): string => {
  if (status === 'completed' || status === 'on_track') {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  }
  if (status === 'at_risk') {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  }
  if (status === 'off_track') {
    return 'bg-red-500/20 text-red-300 border-red-500/30';
  }
  return 'bg-neutral-700/40 text-neutral-300 border-neutral-600';
};

const statusLabel = (status: JiraSprintReportData['health']['status']): string => status.replace('_', ' ');

interface InsightListProps {
  title: string;
  items: string[];
  emptyLabel: string;
}

const InsightList = ({ title, items, emptyLabel }: InsightListProps) => {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-neutral-200">
          {items.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface MetricTileProps {
  label: string;
  value: string;
  helper?: string;
}

const MetricTile = ({ label, value, helper }: MetricTileProps) => {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white tracking-tight">{value}</p>
      {helper && <p className="mt-1 text-xs text-neutral-500">{helper}</p>}
    </div>
  );
};

interface JiraSprintAnalysisProps {
  refreshKey?: number;
}

const insightScopeLabel = (scope: JiraAiInsightsData['scope']): string => {
  return scope === 'board' ? 'Board History' : 'Sprint';
};

export const JiraSprintAnalysis = ({ refreshKey = 0 }: JiraSprintAnalysisProps) => {
  const {
    config,
    configLoading,
    configError,
    projectKey,
    setProjectKey,
    boardIdInput,
    setBoardIdInput,
    maxSprintsInput,
    setMaxSprintsInput,
    boards,
    boardsLoading,
    boardsError,
    selectedBoardId,
    setSelectedBoardId,
    sprints,
    sprintsLoading,
    sprintsError,
    selectedSprintId,
    setSelectedSprintId,
    analysisLoading,
    analysisError,
    sprintReport,
    boardReport,
    aiInsights,
    aiInsightsLoading,
    aiInsightsError,
    selectedBoard,
    loadBoards,
    applyBoardId,
    runSprintAnalysis,
    runBoardAnalysis,
    runSprintAiInsights,
    runBoardAiInsights,
  } = useJiraAnalytics({ refreshKey });

  if (configLoading) {
    return <p className="text-sm text-neutral-400">Loading Jira configuration...</p>;
  }

  if (configError) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
        {configError}
      </div>
    );
  }

  if (!config?.enabled) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-300">Jira analytics is not configured yet.</p>
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-400">
          <p>{config?.message || 'Missing Jira configuration.'}</p>
          <p className="mt-2 text-xs text-neutral-500">
            Expected env vars: <code>CODEXIA_JIRA_BASE_URL</code> and either <code>CODEXIA_JIRA_EMAIL</code> + <code>CODEXIA_JIRA_API_TOKEN</code> or <code>CODEXIA_JIRA_BEARER_TOKEN</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 xl:col-span-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Connection</p>
          <p className="mt-2 text-sm text-neutral-300">
            Connected to <span className="text-white">{config.baseUrl}</span> using <span className="text-white">{config.authMode}</span> auth.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Historical Depth</p>
          <input
            value={maxSprintsInput}
            onChange={(event) => setMaxSprintsInput(event.target.value)}
            className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            placeholder="8"
            inputMode="numeric"
          />
          <p className="mt-2 text-xs text-neutral-500">Used for board-wide sprint trend analysis.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 xl:col-span-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Project Filter</p>
          <div className="mt-2 flex gap-2">
            <input
              value={projectKey}
              onChange={(event) => setProjectKey(event.target.value)}
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              placeholder="e.g. CORE"
            />
            <button
              onClick={loadBoards}
              disabled={boardsLoading}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {boardsLoading ? 'Loading...' : 'Find Boards'}
            </button>
          </div>
          {boardsError && <p className="mt-2 text-xs text-red-300">{boardsError}</p>}
          <p className="mt-2 text-xs text-neutral-500">Optional project key. Leave blank to search all visible boards.</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 xl:col-span-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Board Selection</p>
          <div className="mt-2 flex gap-2">
            <input
              value={boardIdInput}
              onChange={(event) => setBoardIdInput(event.target.value)}
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
              placeholder="Enter board ID"
              inputMode="numeric"
            />
            <button
              onClick={applyBoardId}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-white"
            >
              Use ID
            </button>
          </div>
          <select
            value={selectedBoardId || ''}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedBoardId(value ? Number(value) : null);
            }}
            className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          >
            <option value="">Select board...</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name} ({board.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 xl:col-span-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Sprint Selection</p>
          <select
            value={selectedSprintId || ''}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedSprintId(value ? Number(value) : null);
            }}
            className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            disabled={!selectedBoardId || sprintsLoading}
          >
            <option value="">Select sprint...</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name} [{sprint.state}]
              </option>
            ))}
          </select>
          {sprintsLoading && <p className="mt-2 text-xs text-neutral-500">Loading sprints...</p>}
          {sprintsError && <p className="mt-2 text-xs text-red-300">{sprintsError}</p>}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 xl:col-span-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Run Analysis</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={runSprintAnalysis}
              disabled={analysisLoading || !selectedBoardId || !selectedSprintId}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analysisLoading ? 'Running...' : 'Analyze Sprint'}
            </button>
            <button
              onClick={runBoardAnalysis}
              disabled={analysisLoading || !selectedBoardId}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analysisLoading ? 'Running...' : 'Analyze Board History'}
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {selectedBoard
              ? `Active board: ${selectedBoard.name} (${selectedBoard.id})`
              : selectedBoardId
                ? `Active board ID: ${selectedBoardId}`
                : 'Pick a board to start.'}
          </p>
          {analysisError && <p className="mt-2 text-xs text-red-300">{analysisError}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
        <p className="text-xs uppercase tracking-wide text-violet-200">AI Insights</p>
        <p className="mt-2 text-sm text-neutral-300">
          Generate narrative analysis from sprint metrics to explain delivery confidence, integrity risk, and next actions.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={runSprintAiInsights}
            disabled={aiInsightsLoading || !selectedBoardId || !selectedSprintId}
            className="rounded-lg bg-violet-400 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiInsightsLoading ? 'Generating...' : 'AI Sprint Insights'}
          </button>
          <button
            onClick={runBoardAiInsights}
            disabled={aiInsightsLoading || !selectedBoardId}
            className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiInsightsLoading ? 'Generating...' : 'AI Board Insights'}
          </button>
        </div>
        {aiInsightsError && <p className="mt-2 text-xs text-red-300">{aiInsightsError}</p>}
      </div>

      {aiInsights && (
        <div className="space-y-4 rounded-2xl border border-violet-500/30 bg-neutral-900/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-base font-semibold text-white tracking-tight">
                AI {insightScopeLabel(aiInsights.scope)} Insights
              </h4>
              <p className="text-xs text-neutral-500">
                Generated via {aiInsights.provider} at {new Date(aiInsights.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Overview</p>
            <p className="mt-2 text-sm text-neutral-200">{aiInsights.overview}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InsightList title="Positives" items={aiInsights.positives} emptyLabel="No notable positives returned." />
            <InsightList title="Risks" items={aiInsights.risks} emptyLabel="No explicit risks returned." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InsightList
              title="Integrity Findings"
              items={aiInsights.integrityFindings}
              emptyLabel="No integrity findings returned."
            />
            <InsightList
              title="Recommendations"
              items={aiInsights.recommendations}
              emptyLabel="No recommendations returned."
            />
          </div>

          <InsightList
            title="Follow-up Questions"
            items={aiInsights.questions}
            emptyLabel="No follow-up questions suggested."
          />
        </div>
      )}

      {sprintReport && (
        <div className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-white tracking-tight">
                Sprint Report: {sprintReport.sprint.name}
              </h4>
              <p className="text-sm text-neutral-400">
                {sprintReport.board.name} | {formatDate(sprintReport.sprint.startDate)} - {formatDate(sprintReport.sprint.completeDate || sprintReport.sprint.endDate)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase ${healthBadgeClass(sprintReport.health.status)}`}>
                {statusLabel(sprintReport.health.status)}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase ${riskBadgeClass(sprintReport.integrity.risk)}`}>
                Integrity {sprintReport.integrity.risk}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricTile
              label="Point Completion"
              value={formatPercent(sprintReport.metrics.points.completionRate)}
              helper={`${sprintReport.metrics.points.completedByEnd}/${sprintReport.metrics.points.committed} committed points`}
            />
            <MetricTile
              label="Scope Creep"
              value={formatPercent(sprintReport.integrity.indicators.scopeCreepPct)}
              helper={`${sprintReport.metrics.points.addedAfterStart} points added after start`}
            />
            <MetricTile
              label="Point Churn"
              value={formatPercent(sprintReport.integrity.indicators.pointChurnPct)}
              helper={`${sprintReport.metrics.points.changeEventCount} mid-sprint estimate changes`}
            />
            <MetricTile
              label="Health"
              value={`${sprintReport.health.score.toFixed(1)}/100`}
              helper={sprintReport.health.summary}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricTile
              label="Remaining Points"
              value={sprintReport.metrics.points.remaining.toFixed(1)}
              helper={
                sprintReport.health.remainingDays > 0
                  ? `${sprintReport.health.requiredPointsPerDay.toFixed(2)} points/day needed`
                  : 'No remaining sprint days'
              }
            />
            <MetricTile
              label="Pace Delta"
              value={formatPercent(sprintReport.health.paceDelta)}
              helper={`${formatPercent(sprintReport.health.completionPct)} completion vs ${formatPercent(sprintReport.health.elapsedPct)} elapsed`}
            />
            <MetricTile
              label="Carryover"
              value={formatPercent(sprintReport.integrity.indicators.carryoverPct)}
              helper={`${sprintReport.metrics.issues.carryover} committed issues not done`}
            />
            <MetricTile
              label="Removed Issues"
              value={formatPercent(sprintReport.integrity.indicators.removedPct)}
              helper={`${sprintReport.metrics.issues.removedDuringSprint} removed during sprint`}
            />
          </div>

          {sprintReport.integrity.flags.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-amber-200">Integrity Flags</p>
              <ul className="mt-2 space-y-1 text-sm text-amber-100">
                {sprintReport.integrity.flags.map((flag) => (
                  <li key={flag}>- {flag}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {boardReport && (
        <div className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <div>
            <h4 className="text-base font-semibold text-white tracking-tight">Board History Report: {boardReport.board.name}</h4>
            <p className="text-sm text-neutral-400">
              {boardReport.summary.sprintsAnalyzed} sprint(s) analyzed. Average integrity score: {boardReport.summary.averageIntegrityScore.toFixed(1)}/100.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricTile
              label="Avg Completion"
              value={formatPercent(boardReport.summary.averageCompletionRate)}
            />
            <MetricTile
              label="Avg Scope Creep"
              value={formatPercent(boardReport.summary.averageScopeCreepPct)}
            />
            <MetricTile
              label="Avg Point Churn"
              value={formatPercent(boardReport.summary.averagePointChurnPct)}
            />
            <MetricTile
              label="On-Track Sprints"
              value={`${boardReport.summary.onTrackLikeSprints}/${boardReport.summary.sprintsAnalyzed}`}
              helper={`Risk low/medium/high: ${boardReport.summary.riskDistribution.low}/${boardReport.summary.riskDistribution.medium}/${boardReport.summary.riskDistribution.high}`}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-900/70 text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Sprint</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Completion</th>
                  <th className="px-3 py-2">Scope Creep</th>
                  <th className="px-3 py-2">Point Churn</th>
                  <th className="px-3 py-2">Integrity</th>
                </tr>
              </thead>
              <tbody>
                {boardReport.sprints.map((sprint) => (
                  <tr key={sprint.id} className="border-t border-neutral-800 text-neutral-200">
                    <td className="px-3 py-2">
                      <p className="font-medium text-white">{sprint.name}</p>
                      <p className="text-xs text-neutral-500">{formatDate(sprint.startDate)} - {formatDate(sprint.completeDate || sprint.endDate)}</p>
                    </td>
                    <td className="px-3 py-2 capitalize">{sprint.state}</td>
                    <td className="px-3 py-2">{formatPercent(sprint.completionRate)}</td>
                    <td className="px-3 py-2">{formatPercent(sprint.scopeCreepPct)}</td>
                    <td className="px-3 py-2">{formatPercent(sprint.pointChurnPct)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium uppercase ${riskBadgeClass(sprint.integrityRisk)}`}>
                        {sprint.integrityRisk} ({sprint.integrityScore.toFixed(1)})
                      </span>
                      {sprint.flags.length > 0 && (
                        <p className="mt-1 text-xs text-neutral-500">{sprint.flags.join(' ')}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
