interface HealthScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function getScoreGradient(score: number): string {
  if (score >= 80) return 'from-emerald-500 to-emerald-400';
  if (score >= 60) return 'from-amber-500 to-amber-400';
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

export function HealthScore({ score, size = 'md', onClick }: HealthScoreProps) {
  const classes = sizeClasses[size];
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div 
      className={`flex flex-col items-center ${onClick ? 'cursor-pointer hover:scale-105 transition-all duration-300' : ''}`}
      onClick={onClick}
    >
      <div className={`relative ${classes.container}`}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="currentColor"
            strokeWidth="6"
            fill="none"
            className="text-neutral-800"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="url(#scoreGradient)"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset,
              transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
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
