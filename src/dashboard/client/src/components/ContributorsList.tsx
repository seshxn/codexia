import { useState } from 'react';
import { Trophy, GitCommit, TrendingUp, User, ChevronDown, ChevronUp } from 'lucide-react';
import type { Contributor } from '../types';
import { AvatarImage } from './AvatarImage';

interface ContributorsListProps {
  contributors: Contributor[];
  totalContributors: number;
  activeContributors: number;
  limit?: number;
  onContributorClick?: (contributor: Contributor) => void;
}

export const ContributorsList = ({ contributors, totalContributors, activeContributors, limit = 10, onContributorClick }: ContributorsListProps) => {
  const [showAll, setShowAll] = useState(false);
  const displayedContributors = showAll ? contributors : contributors.slice(0, limit);
  const hasMore = contributors.length > limit;

  if (!contributors || contributors.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-ink-faint">
        <div className="text-center">
          <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No contributor data available</p>
        </div>
      </div>
    );
  }

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { color: 'text-amber-400', bg: 'bg-amber-400/10 border border-amber-400/20', icon: '🥇' };
    if (rank === 2) return { color: 'text-ink-secondary', bg: 'bg-surface-ui/50 border border-edge', icon: '🥈' };
    if (rank === 3) return { color: 'text-orange-500', bg: 'bg-orange-500/10 border border-orange-500/20', icon: '🥉' };
    return { color: 'text-ink-faint', bg: 'bg-surface-ui border border-edge', icon: `#${rank}` };
  };

  return (
    <div className="space-y-4">
      {/* Stats header */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-ink-faint">
            <span className="text-ink font-semibold">{totalContributors}</span> total contributors
          </span>
          <span className="text-ink-faint">
            <span className="text-emerald-400 font-semibold">{activeContributors}</span> active (30d)
          </span>
        </div>
        <Trophy className="w-5 h-5 text-amber-400" />
      </div>

      {/* Leaderboard */}
      <div className={`space-y-2 ${showAll ? 'max-h-96 overflow-y-auto pr-2' : ''}`}>
        {displayedContributors.map((contributor) => {
          const badge = getRankBadge(contributor.rank);
          return (
            <div
              key={contributor.email}
              onClick={() => onContributorClick?.(contributor)}
              className={`flex items-center gap-3 p-3 rounded-xl bg-surface-subtle/30 border border-edge hover:border-edge hover:bg-surface-ui/30 transition-colors duration-200 ${onContributorClick ? 'cursor-pointer' : ''}`}
            >
              {/* Rank */}
              <div className={`w-8 h-8 rounded-full ${badge.bg} flex items-center justify-center text-xs font-bold ${badge.color}`}>
                {badge.icon}
              </div>

              {/* Avatar */}
              <AvatarImage
                src={contributor.avatar}
                name={contributor.name}
                className="w-10 h-10 rounded-full bg-surface-ui ring-2 ring-edge"
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink truncate">{contributor.name}</span>
                  {contributor.isActive && (
                    <span className="px-1.5 py-0.5 text-xs rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-faint mt-0.5">
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
                <span className="text-lg font-semibold text-ink">{contributor.commits}</span>
              </div>
            </div>
          );
        })}
      </div>
      
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-ink-faint hover:text-ink transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show All ({contributors.length} contributors)
            </>
          )}
        </button>
      )}
    </div>
  );
};
