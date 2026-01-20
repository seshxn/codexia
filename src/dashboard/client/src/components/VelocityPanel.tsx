import { TrendingUp, TrendingDown, Users, GitCommit, Activity, Info, Zap } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import type { VelocityData } from '../types';

interface VelocityPanelProps {
  data: VelocityData;
}

export function VelocityPanel({ data }: VelocityPanelProps) {
  const trendValue = parseInt(data.summary.velocityTrend);
  const isPositive = trendValue >= 0;

  // Get trend interpretation
  const getTrendInterpretation = () => {
    if (data.summary.velocityTrend === 'New') return 'New activity period';
    const val = Math.abs(trendValue);
    if (val <= 10) return 'Stable velocity';
    if (val <= 30) return isPositive ? 'Accelerating slightly' : 'Slowing slightly';
    if (val <= 50) return isPositive ? 'Strong acceleration' : 'Notable slowdown';
    return isPositive ? 'Significant increase' : 'Significant decrease';
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50 text-xs text-neutral-400">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <div>
          <span className="text-neutral-300">Velocity metrics</span> track team productivity patterns. 
          Trend compares last 2 weeks vs previous 2 weeks. Aim for consistent, sustainable velocity.
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total Commits */}
        <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-900/30">
          <div className="flex items-center gap-2 mb-1">
            <GitCommit className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-neutral-400">Commits (30d)</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.summary.totalCommits30d}</p>
          <p className="text-[10px] text-neutral-500 mt-1">Total merged commits</p>
        </div>

        {/* Avg Per Week */}
        <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-900/30">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-neutral-400">Avg/Week</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.summary.avgCommitsPerWeek}</p>
          <p className="text-[10px] text-neutral-500 mt-1">Based on last 4 weeks</p>
        </div>

        {/* Velocity Trend */}
        <div className={`p-3 rounded-xl border ${isPositive ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
          <div className="flex items-center gap-2 mb-1">
            {isPositive ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
            <span className="text-xs text-neutral-400">Trend</span>
          </div>
          <p className={`text-xl font-bold truncate ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {data.summary.velocityTrend}
          </p>
          <p className="text-[10px] text-neutral-500 mt-1">{getTrendInterpretation()}</p>
        </div>

        {/* Active Contributors */}
        <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-900/30">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-neutral-400">Active (7d)</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white">{data.summary.activeContributors}</span>
            <span className="text-sm text-neutral-500">/ {data.summary.totalContributors}</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">Contributors with commits</p>
        </div>
      </div>

      {/* Daily Activity Chart */}
      <div>
        <h3 className="text-sm font-medium text-neutral-300 mb-3">Daily Activity (Last 14 Days)</h3>
        <div className="h-48 bg-neutral-900/30 rounded-xl p-4 border border-neutral-800">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.dailyActivity}>
              <defs>
                <linearGradient id="colorCommits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                stroke="#64748b" 
                fontSize={11}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#f8fafc' }}
                formatter={(value: number) => [value, 'Commits']}
                labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              />
              <Area 
                type="monotone" 
                dataKey="count" 
                stroke="#3b82f6" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorCommits)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weekly Trend */}
      <div>
        <h3 className="text-sm font-medium text-neutral-300 mb-3">Weekly Trend</h3>
        <div className="h-32 bg-neutral-900/30 rounded-xl p-4 border border-neutral-800">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.weeklyTrend}>
              <XAxis 
                dataKey="week" 
                stroke="#64748b" 
                fontSize={11}
              />
              <YAxis stroke="#64748b" fontSize={11} hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#f8fafc' }}
                formatter={(value: number) => [value, 'Commits']}
              />
              <Bar dataKey="commits" radius={[4, 4, 0, 0]}>
                {data.weeklyTrend.map((_, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={index === data.weeklyTrend.length - 1 ? '#3b82f6' : '#64748b'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Contributors This Period */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-medium text-neutral-300">Most Active (30d)</h3>
        </div>
        <div className="space-y-2">
          {data.topContributors.map((contributor, index) => (
            <div
              key={contributor.email}
              className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800"
            >
              <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-300">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{contributor.email}</p>
                <p className="text-xs text-neutral-500">
                  {contributor.commits} commits · {contributor.lastWeek} this week
                </p>
              </div>
              {contributor.lastWeek > 0 && (
                <span className="px-2 py-1 text-xs rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Active
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
