import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, Calendar, TrendingUp } from 'lucide-react';
import type { ActivityData } from '../types';

interface CommitActivityProps {
  data: ActivityData;
}

export function CommitActivity({ data }: CommitActivityProps) {
  if (!data || !data.activityByHour) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600">
        <div className="text-center">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No activity data available</p>
        </div>
      </div>
    );
  }

  // Color for bars based on count
  const getBarColor = (count: number, max: number) => {
    const ratio = count / max;
    if (ratio > 0.8) return '#22c55e'; // green
    if (ratio > 0.5) return '#3b82f6'; // blue
    if (ratio > 0.2) return '#6366f1'; // indigo
    return '#475569'; // slate
  };

  const maxHourCount = Math.max(...data.activityByHour.map(h => h.count), 1);
  const maxDayCount = Math.max(...data.activityByDayOfWeek.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 rounded-lg bg-neutral-900/50">
          <p className="text-2xl font-bold text-white">{data.totalCommits.toLocaleString()}</p>
          <p className="text-xs text-neutral-500">Total Commits</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-neutral-900/50">
          <p className="text-2xl font-bold text-blue-400">{data.peakHour}</p>
          <p className="text-xs text-neutral-500">Peak Hour</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-neutral-900/50">
          <p className="text-2xl font-bold text-green-400">{data.peakDay}</p>
          <p className="text-xs text-neutral-500">Peak Day</p>
        </div>
      </div>

      {/* Activity by Hour */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-neutral-500" />
          <span className="text-sm text-neutral-300">Commits by Hour of Day</span>
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.activityByHour}>
              <XAxis 
                dataKey="label" 
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={(value) => value.split(':')[0]}
                interval={2}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#f8fafc' }}
              />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {data.activityByHour.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.count, maxHourCount)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity by Day of Week */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-neutral-500" />
          <span className="text-sm text-neutral-300">Commits by Day of Week</span>
        </div>
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.activityByDayOfWeek} layout="vertical">
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="day" 
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#f8fafc' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.activityByDayOfWeek.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.count, maxDayCount)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Average per day */}
      <div className="flex items-center justify-center gap-2 text-sm text-neutral-500">
        <TrendingUp className="w-4 h-4" />
        <span>Average: <span className="text-white font-semibold">{data.averagePerDay}</span> commits/day</span>
      </div>
    </div>
  );
}
