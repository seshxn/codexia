import { Loader2 } from 'lucide-react';

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
    </div>
  );
}

export function LoadingCard() {
  return (
    <div className="animate-pulse">
      <div className="h-4 bg-neutral-800 rounded-lg w-1/3 mb-4"></div>
      <div className="space-y-3">
        <div className="h-3 bg-neutral-800 rounded-lg"></div>
        <div className="h-3 bg-neutral-800 rounded-lg w-5/6"></div>
        <div className="h-3 bg-neutral-800 rounded-lg w-4/6"></div>
      </div>
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-neutral-800" />
          <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-sky-500 animate-spin" />
        </div>
        <p className="text-neutral-500 mt-4 text-sm font-medium">Loading dashboard...</p>
      </div>
    </div>
  );
}
