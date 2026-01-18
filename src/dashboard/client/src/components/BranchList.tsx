import { GitBranch, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import type { Branch } from '../types';

interface BranchListProps {
  branches: Branch[];
  current: string;
  staleBranches: number;
}

export function BranchList({ branches, current, staleBranches }: BranchListProps) {
  if (!branches || branches.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600">
        <div className="text-center">
          <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No branch data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-neutral-500">
            <span className="text-white font-semibold">{branches.length}</span> branches
          </span>
          {staleBranches > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              {staleBranches} stale
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-green-400 text-xs">
          <CheckCircle className="w-4 h-4" />
          {current}
        </span>
      </div>

      {/* Branch list */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
        {branches.map((branch) => (
          <div
            key={branch.name}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              branch.isCurrent
                ? 'bg-green-500/10 border-green-500/30'
                : branch.isStale
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700'
            }`}
          >
            <GitBranch className={`w-4 h-4 flex-shrink-0 ${
              branch.isCurrent ? 'text-green-400' : branch.isStale ? 'text-amber-400' : 'text-neutral-500'
            }`} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium truncate ${
                  branch.isCurrent ? 'text-green-400' : 'text-white'
                }`}>
                  {branch.name}
                </span>
                {branch.isCurrent && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-green-500/20 text-green-400">current</span>
                )}
                {branch.isStale && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">stale</span>
                )}
              </div>
              {branch.lastCommitMessage && (
                <p className="text-xs text-neutral-500 truncate mt-0.5">
                  {branch.lastCommitMessage}
                </p>
              )}
            </div>

            <div className="text-right flex-shrink-0">
              <div className="flex items-center gap-1 text-xs text-neutral-600">
                <Clock className="w-3 h-3" />
                {branch.daysSinceActivity === 0 ? 'today' : `${branch.daysSinceActivity}d ago`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
