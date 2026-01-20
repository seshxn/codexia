import { useState } from 'react';
import { Flame, ChevronDown, ChevronUp } from 'lucide-react';
import type { HotPath } from '../types';

interface HotPathsListProps {
  hotPaths: HotPath[];
  limit?: number;
  onHotPathClick?: (hotPath: HotPath) => void;
}

function getHeatLevel(score: number): {
  color: string;
  bg: string;
  intensity: number;
} {
  if (score >= 0.8) return { color: 'text-red-400', bg: 'bg-red-500', intensity: 4 };
  if (score >= 0.6) return { color: 'text-orange-400', bg: 'bg-orange-500', intensity: 3 };
  if (score >= 0.4) return { color: 'text-amber-400', bg: 'bg-amber-500', intensity: 2 };
  return { color: 'text-sky-400', bg: 'bg-sky-500', intensity: 1 };
}

export function HotPathsList({ hotPaths, limit = 10, onHotPathClick }: HotPathsListProps) {
  const [showAll, setShowAll] = useState(false);
  const displayedPaths = showAll ? hotPaths : hotPaths.slice(0, limit);
  const hasMore = hotPaths.length > limit;

  if (hotPaths.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-neutral-600">
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
              className={`p-4 rounded-xl bg-neutral-900/30 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/30 transition-all duration-200 ${onHotPathClick ? 'cursor-pointer' : ''}`}
              onClick={() => onHotPathClick?.(hotPath)}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg bg-neutral-800/50 ${heat.color}`}>
                  <div className="flex gap-0.5">
                    {Array.from({ length: heat.intensity }).map((_, i) => (
                      <Flame key={i} className="w-3 h-3" />
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate font-mono">{hotPath.path}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500">
                    <span>
                      Changes: <span className="text-neutral-300">{hotPath.metrics.changeFrequency}</span>
                    </span>
                    <span>
                      Complexity: <span className="text-neutral-300">{hotPath.metrics.complexity.toFixed(1)}</span>
                    </span>
                    <span>
                      Coupling: <span className="text-neutral-300">{(hotPath.metrics.couplingFactor * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-lg font-semibold ${heat.color}`}>
                    {(hotPath.score * 100).toFixed(0)}
                  </span>
                  <p className="text-xs text-neutral-600">score</p>
                </div>
              </div>
              <div className="mt-3 h-1 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${heat.bg} rounded-full transition-all duration-700 ease-out`}
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
              Show All ({hotPaths.length} total)
            </>
          )}
        </button>
      )}
    </div>
  );
}
