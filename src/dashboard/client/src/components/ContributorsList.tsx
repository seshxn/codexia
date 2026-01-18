import { Trophy, GitCommit, TrendingUp, User } from 'lucide-react';
import type { Contributor } from '../types';

interface ContributorsListProps {
  contributors: Contributor[];
  totalContributors: number;
  activeContributors: number;
  onContributorClick?: (contributor: Contributor) => void;
}

export function ContributorsList({ contributors, totalContributors, activeContributors, onContributorClick }: ContributorsListProps) {
  if (!contributors || contributors.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600">
        <div className="text-center">
          <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No contributor data available</p>
        </div>
      </div>
    );
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { color: 'text-amber-400', bg: 'bg-amber-400/10 border border-amber-400/20', icon: '🥇' };
    if (rank === 2) return { color: 'text-neutral-300', bg: 'bg-neutral-300/10 border border-neutral-300/20', icon: '🥈' };
    if (rank === 3) return { color: 'text-orange-500', bg: 'bg-orange-500/10 border border-orange-500/20', icon: '🥉' };
    return { color: 'text-neutral-500', bg: 'bg-neutral-800 border border-neutral-700', icon: `#${rank}` };
  };

  return (
    <div className="space-y-4">
      {/* Stats header */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-neutral-500">
            <span className="text-white font-semibold">{totalContributors}</span> total contributors
          </span>
          <span className="text-neutral-500">
            <span className="text-emerald-400 font-semibold">{activeContributors}</span> active (30d)
          </span>
        </div>
        <Trophy className="w-5 h-5 text-amber-400" />
      </div>

      {/* Leaderboard */}
      <div className="space-y-2">
        {contributors.slice(0, 10).map((contributor) => {
          const badge = getRankBadge(contributor.rank);
          return (
            <div
              key={contributor.email}
              onClick={() => onContributorClick?.(contributor)}
              className={`flex items-center gap-3 p-3 rounded-xl bg-neutral-900/30 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all duration-200 ${onContributorClick ? 'cursor-pointer' : ''}`}
            >
              {/* Rank */}
              <div className={`w-8 h-8 rounded-full ${badge.bg} flex items-center justify-center text-xs font-bold ${badge.color}`}>
                {badge.icon}
              </div>

              {/* Avatar */}
              <img
                src={contributor.avatar}
                alt={contributor.name}
                className="w-10 h-10 rounded-full bg-neutral-800 ring-2 ring-neutral-700"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.name)}&background=171717&color=fafafa`;
                }}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">{contributor.name}</span>
                  {contributor.isActive && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <GitCommit className="w-3 h-3" />
                    {contributor.commits} commits
                  </span>
                  {contributor.recentCommits > 0 && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <TrendingUp className="w-3 h-3" />
                      {contributor.recentCommits} this month
                    </span>
                  )}
                </div>
              </div>

              {/* Commit count */}
              <div className="text-right">
                <span className="text-lg font-semibold text-white">{contributor.commits}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
