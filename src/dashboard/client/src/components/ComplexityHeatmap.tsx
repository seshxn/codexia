import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ComplexityData } from '../types';

interface ComplexityHeatmapProps {
  data: ComplexityData;
}

function getComplexityColor(score: number): string {
  if (score <= 5) return '#22c55e'; // green
  if (score <= 10) return '#84cc16'; // lime
  if (score <= 15) return '#eab308'; // yellow
  if (score <= 20) return '#f97316'; // orange
  return '#ef4444'; // red
}

export function ComplexityHeatmap({ data }: ComplexityHeatmapProps) {
  const chartData = data.files
    .slice(0, 15)
    .map((file) => ({
      name: file.file.split('/').pop() || file.file,
      fullPath: file.file,
      score: file.score,
      lines: file.metrics.lines,
      functions: file.metrics.functions,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        No complexity data available
      </div>
    );
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
          <XAxis type="number" domain={[0, 'auto']} stroke="#64748b" />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#64748b"
            tick={{ fontSize: 12 }}
            width={120}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '8px',
            }}
            labelStyle={{ color: '#f8fafc' }}
            content={({ payload }) => {
              if (!payload || !payload[0]) return null;
              const item = payload[0].payload;
              return (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">
                  <p className="font-medium text-white mb-1">{item.fullPath}</p>
                  <p className="text-slate-400">Score: {item.score.toFixed(1)}</p>
                  <p className="text-slate-400">Lines: {item.lines}</p>
                  <p className="text-slate-400">Functions: {item.functions}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="score" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getComplexityColor(entry.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
