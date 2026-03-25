import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { RefreshCw, Code2, Network, LayoutDashboard, Workflow } from 'lucide-react';
import { useApi } from './hooks/useApi';
import { fetchRepoContext } from './api';
import { Card } from './components/Card';
import { EngineeringDashboard } from './components/EngineeringDashboard';
import { JiraSprintAnalysis } from './components/JiraSprintAnalysis';
import { KnowledgeGraphDashboard } from './components/KnowledgeGraphDashboard';
import { RepoSelector } from './components/RepoSelector';
import { RepositoryDashboard } from './components/RepositoryDashboard';

const TAB_TRANSITION_MS = 180;

type DashboardTab = 'engineering' | 'repository' | 'graph' | 'jira';

const NAV_ITEMS: Array<{
  id: DashboardTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'engineering', label: 'Engineering', icon: Code2 },
  { id: 'repository', label: 'Overview', icon: LayoutDashboard },
  { id: 'graph', label: 'Knowledge Graph', icon: Network },
  { id: 'jira', label: 'Jira', icon: Workflow },
];

const App = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<DashboardTab>('engineering');
  const [visibleTab, setVisibleTab] = useState<DashboardTab>('engineering');
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
    `inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
      activeTab === tab
        ? 'bg-ink text-surface shadow-sm'
        : 'text-ink-secondary hover:text-ink hover:bg-surface-raised/60'
    }`
  );

  const tabPanelClassName = `tab-panel ${isTabTransitioning ? 'tab-panel-exit' : 'tab-panel-enter'}`;
  const tabPanelStyle: CSSProperties = { '--tab-transition-ms': `${TAB_TRANSITION_MS}ms` } as CSSProperties;
  const repoName = repoContext.data?.repoName || 'Repository';
  const isGraphPage = visibleTab === 'graph';
  const activeTabDetails =
    visibleTab === 'engineering'
      ? {
          title: 'Engineering Intelligence',
          subtitle: 'Cross-team delivery, DORA trends, and operational health.',
        }
      : visibleTab === 'repository'
        ? {
            title: 'Repository Overview',
            subtitle: 'Operational metrics, hotspots, ownership, and team activity.',
          }
        : {
            title: 'Jira Sprint Intelligence',
            subtitle: 'Sprint health, scope changes, and board-level delivery integrity.',
          };

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 bg-surface/85 backdrop-blur-md border-b border-edge">
        <div className={`${isGraphPage ? 'max-w-[1800px]' : 'max-w-7xl'} mx-auto px-6 py-4 space-y-4`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-sky-500 to-violet-600">
                    <Code2 className="w-5 h-5 text-white" />
                  </div>
                  <h1 className="text-xl font-semibold text-white tracking-tight">Codexia</h1>
                </div>
                <div className="h-5 w-px bg-edge" />
                <span className="text-ink-secondary text-sm font-medium">{repoName}</span>
              </div>

              <nav className="flex flex-wrap gap-2">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} onClick={() => setActiveTab(item.id)} className={getTabButtonClass(item.id)}>
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-ink-faint">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Updated {lastRefreshAt.toLocaleTimeString()}</span>
              </div>
              <button
                onClick={refreshAll}
                disabled={repoContext.loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-ink hover:bg-ink/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-surface transition-all duration-200 hover:scale-[1.02]"
              >
                <RefreshCw className={`w-4 h-4 ${repoContext.loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {!isGraphPage && (
            <div className="rounded-2xl border border-edge/70 bg-surface-subtle/70 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">{activeTabDetails.title}</p>
                  <p className="text-sm text-ink-faint">{activeTabDetails.subtitle}</p>
                </div>
                <div className="hidden rounded-full border border-edge bg-surface/40 px-3 py-1 text-xs text-ink-secondary md:block">
                  {repoName}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className={`${isGraphPage ? 'max-w-[1800px]' : 'max-w-7xl'} mx-auto px-6 py-8 animate-fade-in`}>
        {isGraphPage ? (
          <div className="mb-6 rounded-2xl border border-edge/70 bg-surface-subtle/60 px-4 py-3">
            <RepoSelector onRepoSwitched={refreshAll} />
          </div>
        ) : (
          <Card
            title="Repository Context"
            subtitle="Run Codexia as a standalone app and switch local Git repos"
            className="mb-8"
          >
            <RepoSelector onRepoSwitched={refreshAll} />
          </Card>
        )}

        <section
          className={tabPanelClassName}
          style={tabPanelStyle}
        >
          <div key={visibleTab} className="tab-content">
            {visibleTab === 'engineering' ? (
              <EngineeringDashboard refreshKey={refreshKey} />
            ) : visibleTab === 'repository' ? (
              <RepositoryDashboard refreshKey={refreshKey} />
            ) : visibleTab === 'graph' ? (
              <KnowledgeGraphDashboard refreshKey={refreshKey} />
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

      <footer className="border-t border-edge mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-gradient-to-br from-sky-500 to-violet-600">
                <Code2 className="w-3.5 h-3.5 text-ink" />
              </div>
              <span className="text-sm font-medium text-ink-secondary">Codexia</span>
            </div>
            <p className="text-sm text-ink-faint">
              Engineering Intelligence Layer for Teams and Repositories
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
