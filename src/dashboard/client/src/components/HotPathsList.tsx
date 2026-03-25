import { useState } from 'react';
import { Flame, ChevronDown, ChevronUp } from 'lucide-react';
import type { HotPath } from '../types';

interface HotPathsListProps {
  hotPaths: HotPath[];
  limit?: number;
  onHotPathClick?: (hotPath: HotPath) => void;
}

const getHeatLevel = (score: number): {
  color: string;
  bg: string;
  intensity: number;
} => {
  if (score >= 0.8) return { color: 'text-red-400', bg: 'bg-red-500', intensity: 4 };
  if (score >= 0.6) return { color: 'text-orange-400', bg: 'bg-orange-500', intensity: 3 };
  if (score >= 0.4) return { color: 'text-amber-400', bg: 'bg-amber-500', intensity: 2 };
  return { color: 'text-accent-blue', bg: 'bg-accent-blue', intensity: 1 };
};

export const HotPathsList = ({ hotPaths, limit = 10, onHotPathClick }: HotPathsListProps) => {
  const [showAll, setShowAll] = useState(false);
  const displayedPaths = showAll ? hotPaths : hotPaths.slice(0, limit);
  const hasMore = hotPaths.length > limit;

  if (hotPaths.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-ink-faint">
        <div className="text-center">
          <Flame className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No hot paths detected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={`space-y-2 ${showAll ? 'max-h-96 overflow-y-auto pr-2' : ''}`}>
        {displayedPaths.map((hotPath, index) => {
          const heat = getHeatLevel(hotPath.score);

          return (
            <div
              key={index}
              className={`p-4 rounded-xl bg-surface-subtle/30 border border-edge hover:border-edge hover:bg-surface-ui/30 transition-colors duration-200 ${onHotPathClick ? 'cursor-pointer' : ''}`}
              onClick={() => onHotPathClick?.(hotPath)}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg bg-surface-ui/50 ${heat.color}`}>
                  <div className="flex gap-0.5">
                    {Array.from({ length: heat.intensity }).map((_, i) => (
                      <Flame key={i} className="w-3 h-3" />
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink truncate font-mono">{hotPath.path}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-ink-faint">
                    <span>
                      Changes: <span className="text-ink-secondary">{hotPath.metrics.changeFrequency}</span>
                    </span>
                    <span>
                      Complexity: <span className="text-ink-secondary">{hotPath.metrics.complexity.toFixed(1)}</span>
                    </span>
                    <span>
                      Coupling: <span className="text-ink-secondary">{(hotPath.metrics.couplingFactor * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-semibold ${heat.color}`}>
                    {(hotPath.score * 100).toFixed(0)}
                  </span>
                  <p className="text-xs text-ink-faint">score</p>
                </div>
              </div>
              <div className="mt-3 h-1 bg-surface-ui rounded-full overflow-hidden">
                <div
                  className={`h-full ${heat.bg} rounded-full transition-[width] duration-700 ease-out`}
                  style={{ width: `${hotPath.score * 100}%` }}
                />
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
              Show All ({hotPaths.length} total)
            </>
          )}
        </button>
      )}
    </div>
  );
};
