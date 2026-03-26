import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = () => {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="w-8 h-8 text-brand animate-spin" />
    </div>
  );
};

export const LoadingCard = () => {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-surface-raised rounded-lg w-1/3 mb-4"></div>
      <div className="space-y-3">
        <div className="h-3 bg-surface-raised rounded-lg"></div>
        <div className="h-3 bg-surface-raised rounded-lg w-5/6"></div>
        <div className="h-3 bg-surface-raised rounded-lg w-4/6"></div>
      </div>
    </div>
  );
};

const GRAPH_STAGES = [
  'Scanning repository files',
  'Building dependency map',
  'Scoring cognitive load',
  'Preparing graph layout',
];

export const KnowledgeGraphLoading = () => {
  const [progress, setProgress] = useState(6);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    // Asymptotically approach 88% — naturally decelerates without reaching 100%
    const id = setInterval(() => setProgress((p) => p + (88 - p) * 0.07), 450);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(
      () => setStageIndex((i) => Math.min(i + 1, GRAPH_STAGES.length - 1)),
      3600,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-3xl border border-edge/80 bg-surface-subtle/70 p-10">
      <div className="mx-auto max-w-xs space-y-5 text-center">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Building knowledge graph</p>
          <p className="h-4 text-xs text-ink-faint transition-opacity duration-500">{GRAPH_STAGES[stageIndex]}</p>
        </div>
        <div className="h-px rounded-full bg-surface-raised overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export const LoadingPage = () => {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-edge" />
          <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-brand animate-spin" />
        </div>
        <p className="text-ink-faint mt-4 text-sm font-medium">Loading dashboard...</p>
      </div>
    </div>
  );
};
