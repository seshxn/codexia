import { useState } from 'react';
import { GitCommit, User, ChevronDown, ChevronUp } from 'lucide-react';
import type { Commit } from '../types';

interface RecentCommitsProps {
  commits: Commit[];
  limit?: number;
  onCommitClick?: (commit: Commit) => void;
}

export function RecentCommits({ commits, limit = 20, onCommitClick }: RecentCommitsProps) {
  const [showAll, setShowAll] = useState(false);
  const displayedCommits = showAll ? commits : commits.slice(0, limit);
  const hasMore = commits.length > limit;

  if (!commits || commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600">
        <div className="text-center">
          <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No recent commits</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`space-y-3 ${showAll ? 'max-h-96' : 'max-h-96'} overflow-y-auto pr-2`}>
        {displayedCommits.map((commit) => (
          <div
            key={commit.fullHash}
            onClick={() => onCommitClick?.(commit)}
            className={`flex items-start gap-3 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 transition-colors ${onCommitClick ? 'cursor-pointer hover:bg-neutral-900/50' : ''}`}
          >
            {/* Avatar */}
            <img
              src={commit.avatar}
              alt={commit.author}
              className="w-8 h-8 rounded-full bg-neutral-800 flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(commit.author)}&background=334155&color=f8fafc&size=32`;
              }}
            />

            <div className="flex-1 min-w-0">
              {/* Message */}
              <p className="text-sm text-white truncate" title={commit.message}>
                {commit.message}
              </p>

              {/* Meta info */}
              <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {commit.author}
                </span>
                <span className="font-mono text-neutral-600">{commit.hash}</span>
                <span>{commit.relativeDate}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          {showAll ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show All ({commits.length} commits)
            </>
          )}
        </button>
      )}
    </div>
  );
}
