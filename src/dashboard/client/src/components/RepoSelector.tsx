import { useCallback, useEffect, useState } from 'react';
import { fetchRecentRepos, fetchRepoContext, pickRepositoryPath, selectRepository } from '../api';
import type { RepoContextData, RepoRecentData } from '../types';

interface RepoSelectorProps {
  onRepoSwitched: () => void;
}

export function RepoSelector({ onRepoSwitched }: RepoSelectorProps) {
  const [context, setContext] = useState<RepoContextData | null>(null);
  const [recent, setRecent] = useState<RepoRecentData['repos']>([]);
  const [repoInput, setRepoInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
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
      const switched = await selectRepository(nextPath);
      setContext({ repoRoot: switched.repoRoot, repoName: switched.repoName });
      setRepoInput(switched.repoRoot);

      const recentRepos = await fetchRecentRepos();
      setRecent(recentRepos.repos);
      onRepoSwitched();
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : 'Failed to switch repository.');
    } finally {
      setSwitching(false);
    }
  }, [onRepoSwitched, repoInput]);

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
    return <p className="text-sm text-neutral-400">Loading repository context...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Current Repository</p>
        <p className="mt-2 text-sm text-white font-mono break-all">{context?.repoRoot || 'Unknown'}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <input
          value={repoInput}
          onChange={(event) => setRepoInput(event.target.value)}
          className="lg:col-span-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          placeholder="/absolute/path/to/repository"
        />
        <button
          onClick={() => void pickAndSwitchRepo()}
          disabled={switching || picking}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {picking ? 'Opening...' : 'Browse...'}
        </button>
        <button
          onClick={() => void switchRepo()}
          disabled={switching || picking}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {switching ? 'Switching...' : 'Switch Repo'}
        </button>
      </div>

      {recent.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Recent Repositories</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recent.map((repo) => (
              <button
                key={repo.path}
                onClick={() => void switchRepo(repo.path)}
                disabled={switching || picking || repo.current}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {repo.current ? `${repo.name} (current)` : repo.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
