import type { ActivityData } from '../types';

interface CommitHeatmapProps {
  data: ActivityData;
}

export function CommitHeatmap({ data }: CommitHeatmapProps) {
  if (!data || !data.activityByDate || data.activityByDate.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-neutral-600">
        <p>No activity data available</p>
      </div>
    );
  }

  // Create a map of date to count for quick lookup
  const dateMap = new Map(data.activityByDate.map(d => [d.date, d.count]));
  
  // Get the last 52 weeks of data
  const today = new Date();
  const weeks: Array<Array<{ date: string; count: number; day: number }>> = [];
  
  // Start from 52 weeks ago, aligned to Sunday
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364 - startDate.getDay());
  
  let currentWeek: Array<{ date: string; count: number; day: number }> = [];
  const current = new Date(startDate);
  
  while (current <= today) {
    const dateStr = current.toISOString().split('T')[0];
    currentWeek.push({
      date: dateStr,
      count: dateMap.get(dateStr) || 0,
      day: current.getDay(),
    });
    
    if (current.getDay() === 6) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  // Get max count for color scaling
  const maxCount = Math.max(...data.activityByDate.map(d => d.count), 1);

  // Color function - Vercel-style emerald
  const getColor = (count: number): string => {
    if (count === 0) return 'bg-neutral-800/50';
    const intensity = count / maxCount;
    if (intensity > 0.75) return 'bg-emerald-400';
    if (intensity > 0.5) return 'bg-emerald-500';
    if (intensity > 0.25) return 'bg-emerald-600/80';
    return 'bg-emerald-700/60';
  };

  // Calculate month labels with their positions
  const monthLabels: Array<{ label: string; weekIndex: number }> = [];
  let lastMonth = -1;
  
  weeks.forEach((week, weekIndex) => {
    if (week.length > 0) {
      const date = new Date(week[0].date);
      const month = date.getMonth();
      if (month !== lastMonth) {
        monthLabels.push({
          label: date.toLocaleString('default', { month: 'short' }),
          weekIndex,
        });
        lastMonth = month;
      }
    }
  });

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cellSize = 10; // pixels
  const cellGap = 3;

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-max">
        {/* Month labels row */}
        <div className="flex mb-1" style={{ marginLeft: '32px' }}>
          {weeks.map((_, weekIndex) => {
            const monthLabel = monthLabels.find(m => m.weekIndex === weekIndex);
            return (
              <div 
                key={weekIndex} 
                className="text-xs text-neutral-600 font-medium"
                style={{ width: `${cellSize + cellGap}px` }}
              >
                {monthLabel?.label || ''}
              </div>
            );
          })}
        </div>

        {/* Grid with day labels */}
        <div className="flex">
          {/* Day labels column */}
          <div className="flex flex-col mr-1" style={{ width: '28px' }}>
            {dayLabels.map((label, i) => (
              <div 
                key={i} 
                className="text-xs text-neutral-600 text-right pr-1"
                style={{ height: `${cellSize + cellGap}px`, lineHeight: `${cellSize + cellGap}px` }}
              >
                {i % 2 === 1 ? label : ''}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="flex" style={{ gap: `${cellGap}px` }}>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col" style={{ gap: `${cellGap}px` }}>
                {Array.from({ length: 7 }, (_, dayIndex) => {
                  const day = week.find(d => d.day === dayIndex);
                  return (
                    <div
                      key={dayIndex}
                      className={`rounded-[3px] transition-colors duration-200 hover:ring-1 hover:ring-white/30 ${day ? getColor(day.count) : 'bg-neutral-800/30'}`}
                      style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                      title={day ? `${day.date}: ${day.count} commits` : ''}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-2 text-xs text-neutral-500 mt-3">
          <span>Less</span>
          <div className="flex" style={{ gap: `${cellGap}px` }}>
            <div className="rounded-[3px] bg-neutral-800/50" style={{ width: `${cellSize}px`, height: `${cellSize}px` }} />
            <div className="rounded-[3px] bg-emerald-700/60" style={{ width: `${cellSize}px`, height: `${cellSize}px` }} />
            <div className="rounded-[3px] bg-emerald-600/80" style={{ width: `${cellSize}px`, height: `${cellSize}px` }} />
            <div className="rounded-[3px] bg-emerald-500" style={{ width: `${cellSize}px`, height: `${cellSize}px` }} />
            <div className="rounded-[3px] bg-emerald-400" style={{ width: `${cellSize}px`, height: `${cellSize}px` }} />
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
