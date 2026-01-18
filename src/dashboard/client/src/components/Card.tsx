import React from 'react';

interface CardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function Card({ title, subtitle, children, className = '', action }: CardProps) {
  return (
    <div className={`bg-neutral-900/50 rounded-2xl border border-neutral-800 overflow-hidden backdrop-blur-sm transition-all duration-300 hover:border-neutral-700 ${className}`}>
      <div className="px-6 py-4 border-b border-neutral-800/50 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight">{title}</h3>
          {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="text-neutral-400">{action}</div>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

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
  blue: 'from-sky-500 to-sky-600',
  green: 'from-emerald-500 to-emerald-600',
  yellow: 'from-amber-500 to-amber-600',
  red: 'from-red-500 to-red-600',
  purple: 'from-violet-500 to-violet-600',
  cyan: 'from-cyan-500 to-cyan-600',
};

const glowClasses = {
  blue: 'shadow-sky-500/20',
  green: 'shadow-emerald-500/20',
  yellow: 'shadow-amber-500/20',
  red: 'shadow-red-500/20',
  purple: 'shadow-violet-500/20',
  cyan: 'shadow-cyan-500/20',
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = 'blue',
}: StatCardProps) {
  return (
    <div className="bg-neutral-900/50 rounded-2xl border border-neutral-800 p-5 backdrop-blur-sm transition-all duration-300 hover:border-neutral-700 hover:bg-neutral-900/70 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">{title}</p>
          <p className="text-3xl font-semibold text-white mt-2 tracking-tight">{value}</p>
          {subtitle && <p className="text-sm text-neutral-600 mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg ${glowClasses[color]} transition-transform duration-300 group-hover:scale-110`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
