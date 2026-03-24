import { AlertTriangle, Compass, Radar, TrendingDown, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { DriftData } from '../types';
import { CHART_TOOLTIP_PROPS } from './chartTheme';

interface DriftRadarPanelProps {
  data: DriftData;
}

const componentLabel: Record<keyof DriftData['components'], string> = {
  boundary: 'Boundary',
  naming: 'Naming',
  structural: 'Structural',
  dependency: 'Dependency',
};

const scoreClass = (score: number): string => {
  if (score >= 70) return 'text-red-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-emerald-400';
};

const velocityClass = (direction: DriftData['trajectory']['velocity']['direction']): string => {
  if (direction === 'diverging') return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (direction === 'converging') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  return 'text-neutral-300 bg-neutral-800/60 border-neutral-700';
};

export const DriftRadarPanel = ({ data }: DriftRadarPanelProps) => {
  const trajectory = data.trajectory.points.map((point) => ({
    ...point,
    shortDate: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  const sortedLayers = [...data.heatmap.layers].sort((a, b) => b.score - a.score).slice(0, 6);

  const velocityIcon =
    data.trajectory.velocity.direction === 'diverging' ? (
      <TrendingUp className="w-4 h-4" />
    ) : data.trajectory.velocity.direction === 'converging' ? (
      <TrendingDown className="w-4 h-4" />
    ) : (
      <Compass className="w-4 h-4" />
    );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 md:col-span-1">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Composite Drift</p>
          <div className="mt-2 flex items-end gap-2">
            <p className={`text-4xl font-bold ${scoreClass(data.composite.score)}`}>{data.composite.score}</p>
            <p className="text-sm text-neutral-500 mb-1">/100</p>
          </div>
          <p className="mt-2 text-xs text-neutral-400">Higher score means architecture is further from declared intent.</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Drift Velocity</p>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${velocityClass(data.trajectory.velocity.direction)}`}>
              {velocityIcon}
              {data.trajectory.velocity.direction}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Delta</p>
              <p className={`mt-1 text-xl font-semibold ${data.trajectory.velocity.delta > 0 ? 'text-red-400' : data.trajectory.velocity.delta < 0 ? 'text-emerald-400' : 'text-neutral-200'}`}>
                {data.trajectory.velocity.delta > 0 ? '+' : ''}
                {data.trajectory.velocity.delta.toFixed(1)}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-neutral-500">Slope / Commit</p>
              <p className="mt-1 text-xl font-semibold text-neutral-100">{data.trajectory.velocity.slopePerCommit.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Radar className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-medium text-neutral-300">Drift Decomposition</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(Object.keys(data.components) as Array<keyof DriftData['components']>).map((key) => {
            const component = data.components[key];
            return (
              <div key={key} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">{componentLabel[key]}</p>
                  <p className={`text-lg font-semibold ${scoreClass(component.score)}`}>{component.score}</p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-cyan-400"
                    style={{ width: `${Math.min(100, component.score)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">{component.violationCount} signals</p>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-neutral-300 mb-3">Drift Trajectory</h3>
        <div className="h-48 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          {trajectory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trajectory} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
                <XAxis dataKey="shortDate" stroke="#737373" fontSize={11} />
                <YAxis stroke="#737373" fontSize={11} domain={[0, 100]} />
                <Tooltip
                  {...CHART_TOOLTIP_PROPS}
                  formatter={(value: number) => [`${value}`, 'Drift Score']}
                  labelFormatter={(_, payload) => {
                    const entry = payload?.[0]?.payload as { message?: string; shortDate?: string } | undefined;
                    return entry ? `${entry.shortDate} · ${entry.message || ''}` : '';
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-neutral-500">
              No commit trajectory available yet.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-3">Layer Heatmap</p>
          <div className="space-y-2">
            {sortedLayers.length > 0 ? sortedLayers.map((layer) => (
              <div key={layer.layer} className="rounded-lg border border-neutral-800 bg-black/30 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-200">{layer.layer}</span>
                  <span className={`text-sm font-semibold ${scoreClass(layer.score)}`}>{layer.score}</span>
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {layer.violations} signals across {layer.files} files
                </div>
              </div>
            )) : (
              <p className="text-xs text-neutral-500">No architecture layers configured.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-3">Emergent Conventions</p>
          <div className="space-y-2">
            {data.emergentConventions.length > 0 ? data.emergentConventions.slice(0, 5).map((candidate, index) => (
              <div key={`${candidate.pattern}-${index}`} className="rounded-lg border border-neutral-800 bg-black/30 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-200">{candidate.pattern}</span>
                  <span className="text-xs text-neutral-500">{Math.round(candidate.confidence * 100)}%</span>
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {candidate.target} · {candidate.evidenceCount} occurrences
                  {candidate.layer ? ` · ${candidate.layer}` : ''}
                </div>
              </div>
            )) : (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <AlertTriangle className="w-3.5 h-3.5" />
                No stable emergent conventions detected.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
