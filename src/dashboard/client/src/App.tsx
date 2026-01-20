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
  Users,
  GitCommit,
  Calendar,
  Shield,
  Heart,
  Zap,
} from 'lucide-react';
import { useApi } from './hooks/useApi';
import {
  fetchOverview,
  fetchComplexity,
  fetchSignals,
  fetchHotPaths,
  fetchTemporal,
  fetchContributors,
  fetchCommits,
  fetchBranches,
  fetchActivity,
  fetchOwnership,
  fetchCodeHealth,
  fetchVelocity,
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
import { ContributorsList } from './components/ContributorsList';
import { RecentCommits } from './components/RecentCommits';
import { BranchList } from './components/BranchList';
import { CommitActivity } from './components/CommitActivity';
import { CommitHeatmap } from './components/CommitHeatmap';
import { OwnershipPanel } from './components/OwnershipPanel';
import { CodeHealthPanel } from './components/CodeHealthPanel';
import { VelocityPanel } from './components/VelocityPanel';
import {
  FileDetailsModal,
  ContributorDetailsModal,
  CommitDetailsModal,
  SignalDetailsModal,
  OwnershipDetailsModal,
  HealthScoreModal,
  HotPathDetailsModal,
} from './components/DetailModals';
import type { ComplexityData, Signal, HotPath, Contributor, Commit, OwnershipData } from './types';

function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Modal states
  const [selectedFile, setSelectedFile] = useState<ComplexityData['files'][0] | null>(null);
  const [selectedHotPath, setSelectedHotPath] = useState<HotPath | null>(null);
  const [selectedContributor, setSelectedContributor] = useState<Contributor | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [selectedOwnershipFile, setSelectedOwnershipFile] = useState<OwnershipData['files'][0] | null>(null);
  const [showHealthModal, setShowHealthModal] = useState(false);

  const refreshAll = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const overview = useApi(useCallback(() => fetchOverview(), [refreshKey]));
  const complexity = useApi(useCallback(() => fetchComplexity(), [refreshKey]));
  const signals = useApi(useCallback(() => fetchSignals(), [refreshKey]));
  const hotPaths = useApi(useCallback(() => fetchHotPaths(), [refreshKey]));
  const temporal = useApi(useCallback(() => fetchTemporal(), [refreshKey]));
  const contributors = useApi(useCallback(() => fetchContributors(), [refreshKey]));
  const commits = useApi(useCallback(() => fetchCommits(), [refreshKey]));
  const branches = useApi(useCallback(() => fetchBranches(), [refreshKey]));
  const activity = useApi(useCallback(() => fetchActivity(), [refreshKey]));
  const ownership = useApi(useCallback(() => fetchOwnership(), [refreshKey]));
  const codeHealth = useApi(useCallback(() => fetchCodeHealth(), [refreshKey]));
  const velocity = useApi(useCallback(() => fetchVelocity(), [refreshKey]));

  // Show loading page if overview is still loading
  if (overview.loading && !overview.data) {
    return <LoadingPage />;
  }

  // Show error if overview failed
  if (overview.error && !overview.data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <ErrorDisplay
          message={`Failed to connect to Codexia: ${overview.error.message}`}
          onRetry={overview.refetch}
        />
      </div>
    );
  }

  const data = overview.data!;

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-sky-500 to-violet-600">
                  <Code2 className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-semibold text-white tracking-tight">Codexia</h1>
              </div>
              <div className="h-5 w-px bg-neutral-800" />
              <span className="text-neutral-400 text-sm font-medium">{data.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Updated {new Date(data.lastIndexed).toLocaleTimeString()}</span>
              </div>
              <button
                onClick={refreshAll}
                disabled={overview.loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-black transition-all duration-200 hover:scale-[1.02]"
              >
                <RefreshCw className={`w-4 h-4 ${overview.loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 animate-fade-in">
        {/* Health Score & Stats Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {/* Health Score */}
          <Card title="Repository Health" className="lg:col-span-1">
            <div className="flex justify-center py-4">
              <HealthScore 
                score={data.healthScore} 
                size="lg" 
                onClick={() => setShowHealthModal(true)} 
              />
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
              <ComplexityHeatmap 
                data={complexity.data!} 
                onFileClick={setSelectedFile}
              />
            )}
          </Card>
        </div>

        {/* Code Health & Velocity Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card
            title="Code Health"
            subtitle="Maintainability & technical debt analysis"
            action={<Heart className="w-5 h-5 text-rose-400" />}
          >
            {codeHealth.loading && !codeHealth.data ? (
              <LoadingCard />
            ) : codeHealth.error ? (
              <ErrorDisplay message="Failed to load code health data" onRetry={codeHealth.refetch} />
            ) : (
              <CodeHealthPanel data={codeHealth.data!} />
            )}
          </Card>

          <Card
            title="Development Velocity"
            subtitle="Team productivity & commit trends"
            action={<Zap className="w-5 h-5 text-amber-400" />}
          >
            {velocity.loading && !velocity.data ? (
              <LoadingCard />
            ) : velocity.error ? (
              <ErrorDisplay message="Failed to load velocity data" onRetry={velocity.refetch} />
            ) : (
              <VelocityPanel data={velocity.data!} />
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
              <SignalsList 
                signals={signals.data!.signals} 
                limit={5}
                onSignalClick={setSelectedSignal}
              />
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
              <HotPathsList 
                hotPaths={hotPaths.data!.hotPaths} 
                limit={5}
                onHotPathClick={setSelectedHotPath}
              />
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

        {/* Commit Heatmap - GitHub Style */}
        <Card
          title="Contribution Activity"
          subtitle="GitHub-style commit heatmap"
          action={<Calendar className="w-5 h-5 text-green-400" />}
          className="mt-8"
        >
          {activity.loading && !activity.data ? (
            <LoadingCard />
          ) : activity.error ? (
            <ErrorDisplay message="Failed to load activity data" onRetry={activity.refetch} />
          ) : (
            <CommitHeatmap data={activity.data!} />
          )}
        </Card>

        {/* Team Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Contributors Leaderboard */}
          <Card
            title="Team Leaderboard"
            subtitle="Top contributors by commits"
            action={<Users className="w-5 h-5 text-yellow-400" />}
          >
            {contributors.loading && !contributors.data ? (
              <LoadingCard />
            ) : contributors.error ? (
              <ErrorDisplay message="Failed to load contributors" onRetry={contributors.refetch} />
            ) : (
              <ContributorsList 
                contributors={contributors.data!.contributors}
                totalContributors={contributors.data!.totalContributors}
                activeContributors={contributors.data!.activeContributors}
                onContributorClick={setSelectedContributor}
              />
            )}
          </Card>

          {/* Recent Commits */}
          <Card
            title="Recent Commits"
            subtitle="Latest changes to the repository"
            action={<GitCommit className="w-5 h-5 text-blue-400" />}
          >
            {commits.loading && !commits.data ? (
              <LoadingCard />
            ) : commits.error ? (
              <ErrorDisplay message="Failed to load commits" onRetry={commits.refetch} />
            ) : (
              <RecentCommits 
                commits={commits.data!.commits}
                onCommitClick={setSelectedCommit}
              />
            )}
          </Card>
        </div>

        {/* Git Stats Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Commit Time Distribution */}
          <Card
            title="When Does Your Team Code?"
            subtitle="Commit activity by hour and day of week"
            action={<Clock className="w-5 h-5 text-blue-400" />}
          >
            {activity.loading && !activity.data ? (
              <LoadingCard />
            ) : activity.error ? (
              <ErrorDisplay message="Failed to load activity data" onRetry={activity.refetch} />
            ) : (
              <CommitActivity data={activity.data!} />
            )}
          </Card>

          {/* Branches */}
          <Card
            title="Branches"
            subtitle="Active and stale branches"
            action={<GitBranch className="w-5 h-5 text-purple-400" />}
          >
            {branches.loading && !branches.data ? (
              <LoadingCard />
            ) : branches.error ? (
              <ErrorDisplay message="Failed to load branches" onRetry={branches.refetch} />
            ) : (
              <BranchList 
                branches={branches.data!.branches}
                current={branches.data!.current}
                staleBranches={branches.data!.staleBranches}
              />
            )}
          </Card>
        </div>

        {/* Ownership & Risk Section */}
        <Card
          title="Code Ownership & Bus Factor"
          subtitle="Who owns what and potential knowledge silos"
          action={<Shield className="w-5 h-5 text-red-400" />}
          className="mt-8"
        >
          {ownership.loading && !ownership.data ? (
            <LoadingCard />
          ) : ownership.error ? (
            <ErrorDisplay message="Failed to load ownership data" onRetry={ownership.refetch} />
          ) : (
            <OwnershipPanel 
              data={ownership.data!}
              onFileClick={setSelectedOwnershipFile}
            />
          )}
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-gradient-to-br from-sky-500 to-violet-600">
                <Code2 className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-medium text-neutral-400">Codexia</span>
            </div>
            <p className="text-sm text-neutral-600">
              Engineering Intelligence Layer for Repositories
            </p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <FileDetailsModal
        isOpen={!!selectedFile}
        onClose={() => setSelectedFile(null)}
        file={selectedFile}
      />
      
      <HotPathDetailsModal
        isOpen={!!selectedHotPath}
        onClose={() => setSelectedHotPath(null)}
        hotPath={selectedHotPath}
      />
      
      <ContributorDetailsModal
        isOpen={!!selectedContributor}
        onClose={() => setSelectedContributor(null)}
        contributor={selectedContributor}
      />
      
      <CommitDetailsModal
        isOpen={!!selectedCommit}
        onClose={() => setSelectedCommit(null)}
        commit={selectedCommit}
      />
      
      <SignalDetailsModal
        isOpen={!!selectedSignal}
        onClose={() => setSelectedSignal(null)}
        signal={selectedSignal}
      />
      
      <OwnershipDetailsModal
        isOpen={!!selectedOwnershipFile}
        onClose={() => setSelectedOwnershipFile(null)}
        file={selectedOwnershipFile}
      />
      
      <HealthScoreModal
        isOpen={showHealthModal}
        onClose={() => setShowHealthModal(false)}
        score={data.healthScore}
        signalsData={signals.data}
        complexityData={complexity.data}
      />
    </div>
  );
}

export default App;
