import React from 'react';

interface CardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export const Card = ({ title, subtitle, children, className = '', action }: CardProps) => {
  return (
    <div className={`bg-surface-ui/50 rounded-2xl border border-edge overflow-hidden transition-colors duration-200 hover:border-edge-moderate ${className}`}>
      <div className="px-6 py-4 border-b border-edge/50 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink tracking-tight">{title}</h3>
          {subtitle && <p className="text-sm text-ink-faint mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="text-ink-secondary">{action}</div>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan';
}

const colorClasses = {
  blue:   'bg-accent-blue/15 text-accent-blue',
  green:  'bg-brand/15 text-brand',
  yellow: 'bg-accent-yellow/15 text-accent-yellow',
  red:    'bg-accent-red/15 text-accent-red',
  purple: 'bg-accent-purple/15 text-accent-purple',
  cyan:   'bg-accent-cyan/15 text-accent-cyan',
};

export const StatCard = ({
  title,
  value,
  subtitle,
  icon,
  color = 'blue',
}: StatCardProps) => {
  return (
    <div className="bg-surface-ui/50 rounded-2xl border border-edge p-5 transition-colors duration-200 hover:border-edge-moderate hover:bg-surface-ui/70 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink-faint">{title}</p>
          <p className="text-3xl font-semibold text-ink mt-2 tracking-tight nums">{value}</p>
          {subtitle && <p className="text-sm text-ink-faint mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`p-3 rounded-xl ${colorClasses[color]} transition-transform duration-200 group-hover:scale-105`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};
