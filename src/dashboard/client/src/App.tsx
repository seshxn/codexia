import { useCallback, useState } from 'react';
import {
  RefreshCw,
  FileCode,
  GitBranch,
  Layers,
  AlertTriangle,
  Flame,
  Clock,
  Code2,
} from 'lucide-react';
import { useApi } from './hooks/useApi';
import {
  fetchOverview,
  fetchComplexity,
  fetchSignals,
  fetchHotPaths,
  fetchTemporal,
} from './api';
import { Card, StatCard } from './components/Card';
import { HealthScore } from './components/HealthScore';
import { LanguageBreakdown } from './components/LanguageBreakdown';
import { ComplexityHeatmap } from './components/ComplexityHeatmap';
import { SignalsList } from './components/SignalsList';
import { HotPathsList } from './components/HotPathsList';
import { ActivityChart } from './components/ActivityChart';
import { LoadingPage, LoadingCard } from './components/Loading';
import { ErrorDisplay } from './components/ErrorDisplay';

function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshAll = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const overview = useApi(useCallback(() => fetchOverview(), [refreshKey]));
  const complexity = useApi(useCallback(() => fetchComplexity(), [refreshKey]));
  const signals = useApi(useCallback(() => fetchSignals(), [refreshKey]));
  const hotPaths = useApi(useCallback(() => fetchHotPaths(), [refreshKey]));
  const temporal = useApi(useCallback(() => fetchTemporal(), [refreshKey]));

  // Show loading page if overview is still loading
  if (overview.loading && !overview.data) {
    return <LoadingPage />;
  }

  // Show error if overview failed
  if (overview.error && !overview.data) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <ErrorDisplay
          message={`Failed to connect to Codexia: ${overview.error.message}`}
          onRetry={overview.refetch}
        />
      </div>
    );
  }

  const data = overview.data!;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Code2 className="w-8 h-8 text-blue-500" />
                <h1 className="text-2xl font-bold text-white">Codexia</h1>
              </div>
              <span className="text-sm text-slate-500">|</span>
              <span className="text-slate-400">{data.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">
                Last indexed: {new Date(data.lastIndexed).toLocaleString()}
              </span>
              <button
                onClick={refreshAll}
                disabled={overview.loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${overview.loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Health Score & Stats Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {/* Health Score */}
          <Card title="Repository Health" className="lg:col-span-1">
            <div className="flex justify-center py-4">
              <HealthScore score={data.healthScore} size="lg" />
            </div>
          </Card>

          {/* Stats */}
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              title="Total Files"
              value={data.totalFiles.toLocaleString()}
              icon={<FileCode className="w-5 h-5 text-white" />}
              color="blue"
            />
            <StatCard
              title="Symbols"
              value={data.totalSymbols.toLocaleString()}
              icon={<Layers className="w-5 h-5 text-white" />}
              color="purple"
            />
            <StatCard
              title="Dependencies"
              value={data.totalDependencies.toLocaleString()}
              icon={<GitBranch className="w-5 h-5 text-white" />}
              color="green"
            />
            <StatCard
              title="Signals"
              value={signals.data?.signals.length ?? '—'}
              subtitle={signals.data ? `${signals.data.bySeverity.critical ?? 0} critical` : undefined}
              icon={<AlertTriangle className="w-5 h-5 text-white" />}
              color="yellow"
            />
          </div>
        </div>

        {/* Languages & Complexity Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card title="Languages" subtitle="File distribution by language">
            <LanguageBreakdown languages={data.languages} />
          </Card>

          <Card title="Complexity Hotspots" subtitle="Files ranked by complexity score">
            {complexity.loading && !complexity.data ? (
              <LoadingCard />
            ) : complexity.error ? (
              <ErrorDisplay message="Failed to load complexity data" onRetry={complexity.refetch} />
            ) : (
              <ComplexityHeatmap data={complexity.data!} />
            )}
          </Card>
        </div>

        {/* Signals & Hot Paths Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card
            title="Code Signals"
            subtitle="Issues and improvements detected"
            action={
              signals.data && (
                <div className="flex gap-2 text-xs">
                  {signals.data.bySeverity.critical > 0 && (
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded">
                      {signals.data.bySeverity.critical} critical
                    </span>
                  )}
                  {signals.data.bySeverity.high > 0 && (
                    <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded">
                      {signals.data.bySeverity.high} high
                    </span>
                  )}
                </div>
              )
            }
          >
            {signals.loading && !signals.data ? (
              <LoadingCard />
            ) : signals.error ? (
              <ErrorDisplay message="Failed to load signals" onRetry={signals.refetch} />
            ) : (
              <SignalsList signals={signals.data!.signals} limit={5} />
            )}
          </Card>

          <Card
            title="Hot Paths"
            subtitle="High-risk areas requiring attention"
            action={<Flame className="w-5 h-5 text-orange-400" />}
          >
            {hotPaths.loading && !hotPaths.data ? (
              <LoadingCard />
            ) : hotPaths.error ? (
              <ErrorDisplay message="Failed to load hot paths" onRetry={hotPaths.refetch} />
            ) : (
              <HotPathsList hotPaths={hotPaths.data!.hotPaths} limit={5} />
            )}
          </Card>
        </div>

        {/* Activity Chart */}
        <Card
          title="Development Activity"
          subtitle="Recent commits and contributor activity"
          action={<Clock className="w-5 h-5 text-slate-400" />}
        >
          {temporal.loading && !temporal.data ? (
            <LoadingCard />
          ) : temporal.error ? (
            <ErrorDisplay message="Failed to load activity data" onRetry={temporal.refetch} />
          ) : (
            <ActivityChart data={temporal.data!} />
          )}
        </Card>
      </main>

      {/* Footer */}
      <footer className="bg-slate-800 border-t border-slate-700 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <p className="text-center text-sm text-slate-500">
            Codexia — Engineering Intelligence Layer for Repositories
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
