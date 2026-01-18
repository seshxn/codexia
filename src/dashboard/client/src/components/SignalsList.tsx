import { AlertTriangle, AlertCircle, Info, AlertOctagon } from 'lucide-react';
import type { Signal } from '../types';

interface SignalsListProps {
  signals: Signal[];
  limit?: number;
  onSignalClick?: (signal: Signal) => void;
}

const severityConfig = {
  critical: {
    icon: AlertOctagon,
    color: 'text-red-400',
    bg: 'bg-red-500/5',
    border: 'border-red-500/20',
  },
  high: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/5',
    border: 'border-orange-500/20',
  },
  medium: {
    icon: AlertCircle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
  },
  low: {
    icon: Info,
    color: 'text-sky-400',
    bg: 'bg-sky-500/5',
    border: 'border-sky-500/20',
  },
};

export function SignalsList({ signals, limit = 10, onSignalClick }: SignalsListProps) {
  const displayedSignals = signals.slice(0, limit);

  if (displayedSignals.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-neutral-600">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No signals detected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayedSignals.map((signal, index) => {
        const config = severityConfig[signal.severity];
        const Icon = config.icon;

        return (
          <div
            key={index}
            onClick={() => onSignalClick?.(signal)}
            className={`p-4 rounded-xl border ${config.bg} ${config.border} transition-all duration-200 ${onSignalClick ? 'cursor-pointer hover:bg-neutral-800/50 hover:border-neutral-700' : ''}`}
          >
            <div className="flex items-start gap-3">
              <Icon className={`w-4 h-4 mt-0.5 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium uppercase tracking-wider ${config.color}`}>
                    {signal.severity}
                  </span>
                  <span className="text-xs text-neutral-700">•</span>
                  <span className="text-xs text-neutral-500">{signal.type}</span>
                </div>
                <p className="text-sm text-white mb-1">{signal.message}</p>
                <p className="text-xs text-neutral-500 truncate font-mono">
                  {signal.file}
                  {signal.line && `:${signal.line}`}
                </p>
                {signal.suggestion && (
                  <p className="text-xs text-neutral-600 mt-2">
                    💡 {signal.suggestion}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {signals.length > limit && (
        <p className="text-center text-sm text-neutral-600 pt-2">
          +{signals.length - limit} more signals
        </p>
      )}
    </div>
  );
}
