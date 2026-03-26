import { X } from 'lucide-react';
import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal = ({ isOpen, onClose, title, subtitle, children, size = 'md' }: ModalProps) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsAnimating(false);
      const timer = window.setTimeout(() => {
        setShouldRender(false);
      }, 200);
      return () => window.clearTimeout(timer);
    }

    setShouldRender(true);
    let rafOne = 0;
    let rafTwo = 0;
    rafOne = window.requestAnimationFrame(() => {
      rafTwo = window.requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    });

    document.addEventListener('keydown', handleEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(rafOne);
      window.cancelAnimationFrame(rafTwo);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, handleEscape]);

  if (!isMounted || !shouldRender) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-surface/88 transition-opacity duration-200 ease-out ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <div className="absolute inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className={`relative bg-surface-subtle/95 rounded-2xl border border-edge shadow-2xl shadow-surface/60 w-full ${sizeClasses[size]} max-h-[85vh] flex flex-col transition-[opacity,transform] duration-300 ease-out ${
              isAnimating
                ? 'opacity-100 scale-100 translate-y-0'
                : 'opacity-0 scale-95 translate-y-4'
            }`}
            style={{
              transitionTimingFunction: isAnimating ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'ease-in',
            }}
          >
            <div className="flex items-start justify-between px-6 py-5 border-b border-edge">
              <div>
                <h2 className="text-lg font-semibold text-ink tracking-tight">{title}</h2>
                {subtitle && <p className="text-sm text-ink-faint mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="p-2 -mr-2 hover:bg-surface-raised rounded-xl transition-colors duration-150 text-ink-faint hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Detail row component for modal content
interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  color?: string;
}

export const DetailRow = ({ label, value, color }: DetailRowProps) => {
  return (
    <div className="flex justify-between items-center py-3 border-b border-edge/50 last:border-0">
      <span className="text-ink-faint text-sm">{label}</span>
      <span className={`text-sm font-medium ${color || 'text-ink'}`}>{value}</span>
    </div>
  );
};

// Metric card for modal content
interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan';
  subtitle?: string;
}

export const MetricCard = ({ label, value, icon, color = 'blue', subtitle }: MetricCardProps) => {
  const colorClasses = {
    blue:   'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
    green:  'bg-accent-green/10 text-accent-green border-accent-green/20',
    yellow: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
    red:    'bg-accent-red/10 text-accent-red border-accent-red/20',
    purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
    cyan:   'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
  };

  return (
    <div className={`p-4 rounded-xl border ${colorClasses[color]} transition-[transform,border-color] duration-200 hover:scale-[1.02]`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-ink-faint uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight nums">{value}</p>
      {subtitle && <p className="text-xs text-ink-faint mt-1">{subtitle}</p>}
    </div>
  );
};

// Progress bar component
interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  showValue?: boolean;
}

export const ProgressBar = ({ value, max = 100, color = 'bg-brand', label, showValue = true }: ProgressBarProps) => {
  const percentage = Math.min(100, (value / max) * 100);

  return (
    <div className="space-y-2">
      {(label || showValue) && (
        <div className="flex justify-between text-xs">
          <span className="text-ink-faint">{label}</span>
          {showValue && <span className="text-ink-secondary font-medium">{value.toFixed(0)}%</span>}
        </div>
      )}
      <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} rounded-full transition-[width] duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
