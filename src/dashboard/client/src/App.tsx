import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { RefreshCw, Code2 } from 'lucide-react';
import { useApi } from './hooks/useApi';
import { fetchRepoContext } from './api';
import { Card } from './components/Card';
import { JiraSprintAnalysis } from './components/JiraSprintAnalysis';
import { RepoSelector } from './components/RepoSelector';
import { RepositoryDashboard } from './components/RepositoryDashboard';

const TAB_TRANSITION_MS = 180;

type DashboardTab = 'repository' | 'jira';

const App = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<DashboardTab>('repository');
  const [visibleTab, setVisibleTab] = useState<DashboardTab>('repository');
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date>(new Date());

  const repoContext = useApi(useCallback(() => fetchRepoContext(), []));
  const repoContextRefetch = repoContext.refetch;

  useEffect(() => {
    if (activeTab === visibleTab) {
      return;
    }

    setIsTabTransitioning(true);
    const switchTimer = window.setTimeout(() => {
      setVisibleTab(activeTab);
      window.requestAnimationFrame(() => setIsTabTransitioning(false));
    }, TAB_TRANSITION_MS);

    return () => {
      window.clearTimeout(switchTimer);
    };
  }, [activeTab, visibleTab]);

  const refreshAll = useCallback(() => {
    setRefreshKey((current) => current + 1);
    setLastRefreshAt(new Date());
    repoContextRefetch();
  }, [repoContextRefetch]);

  const getTabButtonClass = (tab: DashboardTab): string => (
    `rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 ${
      activeTab === tab
        ? 'bg-white text-black shadow-sm'
        : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
    }`
  );

  const tabPanelClassName = `tab-panel ${isTabTransitioning ? 'tab-panel-exit' : 'tab-panel-enter'}`;
  const tabPanelStyle: CSSProperties = { '--tab-transition-ms': `${TAB_TRANSITION_MS}ms` } as CSSProperties;
  const repoName = repoContext.data?.repoName || 'Repository';

  return (
    <div className="min-h-screen bg-black">
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
              <span className="text-neutral-400 text-sm font-medium">{repoName}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Updated {lastRefreshAt.toLocaleTimeString()}</span>
              </div>
              <button
                onClick={refreshAll}
                disabled={repoContext.loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-black transition-all duration-200 hover:scale-[1.02]"
              >
                <RefreshCw className={`w-4 h-4 ${repoContext.loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 animate-fade-in">
        <Card
          title="Repository Context"
          subtitle="Run Codexia as a standalone app and switch local Git repos"
          className="mb-8"
        >
          <RepoSelector onRepoSwitched={refreshAll} />
        </Card>

        <div className="mb-8">
          <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900/60 p-1">
            <button onClick={() => setActiveTab('repository')} className={getTabButtonClass('repository')}>
              Repository
            </button>
            <button onClick={() => setActiveTab('jira')} className={getTabButtonClass('jira')}>
              Jira
            </button>
          </div>
        </div>

        <section
          className={tabPanelClassName}
          style={tabPanelStyle}
        >
          <div key={visibleTab} className="tab-content">
            {visibleTab === 'repository' ? (
              <RepositoryDashboard refreshKey={refreshKey} />
            ) : (
              <Card
                title="Jira Sprint Intelligence"
                subtitle="Sprint health, scope changes, and board-level delivery integrity"
              >
                <JiraSprintAnalysis refreshKey={refreshKey} />
              </Card>
            )}
          </div>
        </section>
      </main>

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
    </div>
  );
};

export default App;
