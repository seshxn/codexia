import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { GitCommit, User } from 'lucide-react';
import type { TemporalData } from '../types';

interface ActivityChartProps {
  data: TemporalData;
}

export function ActivityChart({ data }: ActivityChartProps) {
  // Convert activity by day to chart format
  const chartData = Object.entries(data.activityByDay)
    .map(([date, count]) => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      commits: count,
    }))
    .slice(-14); // Last 14 days

  return (
    <div className="space-y-6">
      {/* Activity Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#f8fafc' }}
            />
            <Area
              type="monotone"
              dataKey="commits"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#activityGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Changes */}
      <div>
        <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
          <GitCommit className="w-4 h-4" />
          Recent Changes
        </h4>
        <div className="space-y-2">
          {data.recentChanges.slice(0, 5).map((change, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-900/50"
            >
              <span className="text-sm text-slate-300 truncate flex-1">
                {change.file}
              </span>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-500">
                  {change.changeCount} changes
                </span>
                <span className="text-slate-600">
                  {new Date(change.lastModified).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Contributors */}
      <div>
        <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
          <User className="w-4 h-4" />
          Top Contributors
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {data.authorStats.slice(0, 4).map((author, index) => (
            <div
              key={index}
              className="p-3 rounded-lg bg-slate-900/50 border border-slate-700"
            >
              <p className="text-sm font-medium text-white truncate">
                {author.author}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {author.commits} commits • {author.filesChanged} files
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
