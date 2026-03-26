import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ComplexityData } from '../types';

interface ComplexityHeatmapProps {
  data: ComplexityData;
  limit?: number;
  onFileClick?: (file: ComplexityData['files'][0]) => void;
}

const getComplexityColor = (score: number): string => {
  if (score <= 5) return '#22c55e'; // green
  if (score <= 10) return '#84cc16'; // lime
  if (score <= 15) return '#eab308'; // yellow
  if (score <= 20) return '#f97316'; // orange
  return '#ef4444'; // red
};

export const ComplexityHeatmap = ({ data, limit = 15, onFileClick }: ComplexityHeatmapProps) => {
  const [showAll, setShowAll] = useState(false);
  const displayLimit = showAll ? Math.min(data.files.length, 50) : limit;
  const hasMore = data.files.length > limit;
  
  const chartData = data.files
    .slice(0, displayLimit)
    .map((file) => ({
      name: file.file.split('/').pop() || file.file,
      fullPath: file.file,
      score: file.score,
      lines: file.metrics.lines,
      functions: file.metrics.functions,
      metrics: file.metrics,
      originalFile: file,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-ink-faint">
        No complexity data available
      </div>
    );
  }

  const handleClick = (data: any) => {
    const payload = data?.payload ?? data;
    if (onFileClick && payload?.originalFile) {
      onFileClick(payload.originalFile);
    }
  };

  const chartHeight = showAll ? Math.max(280, displayLimit * 28) : 320;

  return (
    <div className="space-y-2">
      <div className={`${showAll ? 'max-h-[500px] overflow-y-auto' : ''}`}>
        <ResponsiveContainer width="100%" height={chartHeight}>
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
                backgroundColor: 'rgba(10, 10, 10, 0.96)',
                border: '1px solid rgba(64, 64, 64, 0.95)',
                borderRadius: '10px',
                color: '#f5f5f5',
              }}
              labelStyle={{ color: '#f5f5f5', fontWeight: 600 }}
              itemStyle={{ color: '#d4d4d8' }}
              content={({ payload }) => {
                if (!payload || !payload[0]) return null;
                const item = payload[0].payload;
                return (
                  <div className="bg-surface-subtle border border-edge rounded-lg p-3 text-sm shadow-elevated">
                    <p className="font-medium text-ink mb-1">{item.fullPath}</p>
                    <p className="text-ink-secondary">Score: {item.score.toFixed(1)}</p>
                    <p className="text-ink-secondary">Lines: {item.lines}</p>
                    <p className="text-ink-secondary">Functions: {item.functions}</p>
                    {onFileClick && <p className="text-brand text-xs mt-2">Click for details</p>}
                  </div>
                );
              }}
            />
            <Bar 
              dataKey="score" 
              radius={[0, 4, 4, 0]} 
              cursor={onFileClick ? 'pointer' : undefined}
              onClick={handleClick}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getComplexityColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-ink-faint hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {showAll ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show All ({data.files.length} files)
            </>
          )}
        </button>
      )}
    </div>
  );
};
