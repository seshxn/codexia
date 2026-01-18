interface HealthScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function getScoreGradient(score: number): string {
  if (score >= 80) return 'from-green-500 to-green-400';
  if (score >= 60) return 'from-yellow-500 to-yellow-400';
  if (score >= 40) return 'from-orange-500 to-orange-400';
  return 'from-red-500 to-red-400';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Attention';
}

const sizeClasses = {
  sm: { container: 'w-24 h-24', text: 'text-2xl', label: 'text-xs' },
  md: { container: 'w-32 h-32', text: 'text-3xl', label: 'text-sm' },
  lg: { container: 'w-40 h-40', text: 'text-4xl', label: 'text-base' },
};

export function HealthScore({ score, size = 'md' }: HealthScoreProps) {
  const classes = sizeClasses[size];
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${classes.container}`}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-slate-700"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="url(#scoreGradient)"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset,
              transition: 'stroke-dashoffset 0.5s ease-in-out',
            }}
          />
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" className={`${getScoreGradient(score).split(' ')[0].replace('from-', 'stop-')}`} />
              <stop offset="100%" className={`${getScoreGradient(score).split(' ')[1].replace('to-', 'stop-')}`} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${classes.text} font-bold ${getScoreColor(score)}`}>
            {Math.round(score)}
          </span>
        </div>
      </div>
      <span className={`${classes.label} font-medium mt-2 ${getScoreColor(score)}`}>
        {getScoreLabel(score)}
      </span>
    </div>
  );
}
