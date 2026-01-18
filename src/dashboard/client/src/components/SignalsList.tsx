import { AlertTriangle, AlertCircle, Info, AlertOctagon } from 'lucide-react';
import type { Signal } from '../types';

interface SignalsListProps {
  signals: Signal[];
  limit?: number;
}

const severityConfig = {
  critical: {
    icon: AlertOctagon,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/30',
  },
  high: {
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    border: 'border-orange-400/30',
  },
  medium: {
    icon: AlertCircle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    border: 'border-yellow-400/30',
  },
  low: {
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/30',
  },
};

export function SignalsList({ signals, limit = 10 }: SignalsListProps) {
  const displayedSignals = signals.slice(0, limit);

  if (displayedSignals.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No signals detected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayedSignals.map((signal, index) => {
        const config = severityConfig[signal.severity];
        const Icon = config.icon;

        return (
          <div
            key={index}
            className={`p-4 rounded-lg border ${config.bg} ${config.border}`}
          >
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 mt-0.5 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium uppercase ${config.color}`}>
                    {signal.severity}
                  </span>
                  <span className="text-xs text-slate-500">•</span>
                  <span className="text-xs text-slate-400">{signal.type}</span>
                </div>
                <p className="text-sm text-white mb-1">{signal.message}</p>
                <p className="text-xs text-slate-400 truncate">
                  {signal.file}
                  {signal.line && `:${signal.line}`}
                </p>
                {signal.suggestion && (
                  <p className="text-xs text-slate-500 mt-2 italic">
                    💡 {signal.suggestion}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {signals.length > limit && (
        <p className="text-center text-sm text-slate-500">
          +{signals.length - limit} more signals
        </p>
      )}
    </div>
  );
}
