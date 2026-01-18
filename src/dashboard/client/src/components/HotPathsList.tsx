import { Flame } from 'lucide-react';
import type { HotPath } from '../types';

interface HotPathsListProps {
  hotPaths: HotPath[];
  limit?: number;
}

function getHeatLevel(score: number): {
  color: string;
  bg: string;
  intensity: number;
} {
  if (score >= 0.8) return { color: 'text-red-400', bg: 'bg-red-400', intensity: 4 };
  if (score >= 0.6) return { color: 'text-orange-400', bg: 'bg-orange-400', intensity: 3 };
  if (score >= 0.4) return { color: 'text-yellow-400', bg: 'bg-yellow-400', intensity: 2 };
  return { color: 'text-blue-400', bg: 'bg-blue-400', intensity: 1 };
}

export function HotPathsList({ hotPaths, limit = 10 }: HotPathsListProps) {
  const displayedPaths = hotPaths.slice(0, limit);

  if (displayedPaths.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500">
        <div className="text-center">
          <Flame className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No hot paths detected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayedPaths.map((hotPath, index) => {
        const heat = getHeatLevel(hotPath.score);

        return (
          <div
            key={index}
            className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 hover:border-slate-600 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg bg-slate-800 ${heat.color}`}>
                <div className="flex gap-0.5">
                  {Array.from({ length: heat.intensity }).map((_, i) => (
                    <Flame key={i} className="w-3 h-3" />
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{hotPath.path}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                  <span>
                    Changes: <span className="text-slate-300">{hotPath.metrics.changeFrequency}</span>
                  </span>
                  <span>
                    Complexity: <span className="text-slate-300">{hotPath.metrics.complexity.toFixed(1)}</span>
                  </span>
                  <span>
                    Coupling: <span className="text-slate-300">{(hotPath.metrics.couplingFactor * 100).toFixed(0)}%</span>
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-lg font-bold ${heat.color}`}>
                  {(hotPath.score * 100).toFixed(0)}
                </span>
                <p className="text-xs text-slate-500">score</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${heat.bg} rounded-full transition-all duration-500`}
                style={{ width: `${hotPath.score * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
