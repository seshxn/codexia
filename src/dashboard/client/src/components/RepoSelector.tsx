import { useCallback, useEffect, useState } from 'react';
import { fetchRecentRepos, fetchRepoContext, fetchRepositorySwitchStatus, pickRepositoryPath, selectRepository } from '../api';
import type { RepoContextData, RepoRecentData, RepoSwitchStatusData } from '../types';

interface RepoSelectorProps {
  onRepoSwitched: () => void;
}

export const RepoSelector = ({ onRepoSwitched }: RepoSelectorProps) => {
  const [context, setContext] = useState<RepoContextData | null>(null);
  const [recent, setRecent] = useState<RepoRecentData['repos']>([]);
  const [repoInput, setRepoInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [switchStatus, setSwitchStatus] = useState<RepoSwitchStatusData | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRepoContext = useCallback(async () => {
    const [repoContext, recentRepos] = await Promise.all([
      fetchRepoContext(),
      fetchRecentRepos(),
    ]);

    setContext(repoContext);
    setRepoInput(repoContext.repoRoot);
    setRecent(recentRepos.repos);
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await loadRepoContext();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load repository context.');
    } finally {
      setLoading(false);
    }
  }, [loadRepoContext]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const switchRepo = useCallback(async (targetPath?: string) => {
    const nextPath = (targetPath || repoInput).trim();
    if (!nextPath) {
      setError('Enter a repository path.');
      return;
    }

    setSwitching(true);
    setError(null);

    try {
      const job = await selectRepository(nextPath);
      let latestStatus: RepoSwitchStatusData | null = null;

      while (!latestStatus || (latestStatus.status !== 'completed' && latestStatus.status !== 'failed')) {
        latestStatus = await fetchRepositorySwitchStatus(job.jobId);
        setSwitchStatus(latestStatus);

        if (latestStatus.status === 'completed') {
          setContext({
            repoRoot: latestStatus.repoRoot || nextPath,
            repoName: latestStatus.repoName || context?.repoName || 'Repository',
          });
          setRepoInput(latestStatus.repoRoot || nextPath);

          const recentRepos = await fetchRecentRepos();
          setRecent(recentRepos.repos);
          onRepoSwitched();
          break;
        }

        if (latestStatus.status === 'failed') {
          throw new Error(latestStatus.error || latestStatus.message || 'Failed to switch repository.');
        }

        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : 'Failed to switch repository.');
    } finally {
      setSwitching(false);
      setSwitchStatus(null);
    }
  }, [context?.repoName, onRepoSwitched, repoInput]);

  const pickAndSwitchRepo = useCallback(async () => {
    setPicking(true);
    setError(null);
    try {
      const picked = await pickRepositoryPath();
      if (picked.cancelled || !picked.repoPath) {
        return;
      }
      setRepoInput(picked.repoPath);
      await switchRepo(picked.repoPath);
    } catch (pickError) {
      const rawMessage = pickError instanceof Error ? pickError.message : 'Failed to open folder picker.';
      if (rawMessage.toLowerCase() === 'not found' || rawMessage.includes('404')) {
        setError('Folder picker endpoint is unavailable in this running build. Rebuild and restart the dashboard server.');
        return;
      }
      setError(rawMessage);
    } finally {
      setPicking(false);
    }
  }, [switchRepo]);

  if (loading) {
    return <p className="text-sm text-ink-faint">Loading repository context...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Current Repository</p>
        <p className="mt-1 text-sm text-ink font-mono break-all">{context?.repoRoot || 'Unknown'}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <label htmlFor="repo-path-input" className="sr-only">Repository path</label>
        <input
          id="repo-path-input"
          value={repoInput}
          onChange={(event) => setRepoInput(event.target.value)}
          className="lg:col-span-2 rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-transparent"
          placeholder="/absolute/path/to/repository"
        />
        <button
          onClick={() => void pickAndSwitchRepo()}
          disabled={switching || picking}
          aria-label={picking ? 'Opening folder picker…' : 'Browse for repository'}
          className="rounded-lg border border-edge bg-surface-raised px-4 py-2 text-sm font-medium text-ink hover:bg-surface-ui disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {picking ? 'Opening...' : 'Browse...'}
        </button>
        <button
          onClick={() => void switchRepo()}
          disabled={switching || picking}
          aria-label={switching ? 'Switching repository…' : 'Switch to this repository'}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface hover:bg-ink/80 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {switching ? 'Switching...' : 'Switch Repo'}
        </button>
      </div>

      {recent.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Recent Repositories</p>
          <div className="mt-2 flex flex-wrap gap-2" role="list" aria-label="Recent repositories">
            {recent.map((repo) => (
              <button
                key={repo.path}
                role="listitem"
                onClick={() => void switchRepo(repo.path)}
                disabled={switching || picking || repo.current}
                aria-current={repo.current ? 'true' : undefined}
                className="rounded-full border border-edge bg-surface-raised px-3 py-2 text-xs text-ink-secondary hover:text-ink hover:border-edge-moderate disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand min-h-[44px] sm:min-h-0 sm:py-1.5"
              >
                {repo.current ? `${repo.name} (current)` : repo.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {switchStatus && (
        <div className="rounded-xl border border-edge bg-surface-subtle/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Switching repository</p>
              <p className="text-xs text-ink-faint">{switchStatus.message}</p>
            </div>
            <div className="text-sm font-medium text-ink">{Math.max(0, Math.min(100, switchStatus.progress))}%</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(6, Math.min(100, switchStatus.progress))}%` }}
            />
          </div>
          <p className="mt-2 text-xs uppercase tracking-wide text-ink-faint">{switchStatus.phase}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
};
