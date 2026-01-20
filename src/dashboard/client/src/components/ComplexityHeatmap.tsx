import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ComplexityData } from '../types';

interface ComplexityHeatmapProps {
  data: ComplexityData;
  limit?: number;
  onFileClick?: (file: ComplexityData['files'][0]) => void;
}

function getComplexityColor(score: number): string {
  if (score <= 5) return '#22c55e'; // green
  if (score <= 10) return '#84cc16'; // lime
  if (score <= 15) return '#eab308'; // yellow
  if (score <= 20) return '#f97316'; // orange
  return '#ef4444'; // red
}

export function ComplexityHeatmap({ data, limit = 15, onFileClick }: ComplexityHeatmapProps) {
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
      <div className="flex items-center justify-center h-64 text-neutral-600">
        No complexity data available
      </div>
    );
  }

  const handleClick = (data: any) => {
    if (onFileClick && data?.originalFile) {
      onFileClick(data.originalFile);
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
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#f8fafc' }}
              content={({ payload }) => {
                if (!payload || !payload[0]) return null;
                const item = payload[0].payload;
                return (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-sm">
                    <p className="font-medium text-white mb-1">{item.fullPath}</p>
                    <p className="text-neutral-500">Score: {item.score.toFixed(1)}</p>
                    <p className="text-neutral-500">Lines: {item.lines}</p>
                    <p className="text-neutral-500">Functions: {item.functions}</p>
                    {onFileClick && <p className="text-blue-400 text-xs mt-2">Click for details</p>}
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
              Show All ({data.files.length} files)
            </>
          )}
        </button>
      )}
    </div>
  );
}
