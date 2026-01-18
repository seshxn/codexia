import { AlertTriangle, Shield, Users, FileWarning } from 'lucide-react';
import type { OwnershipData } from '../types';

interface OwnershipPanelProps {
  data: OwnershipData;
  onFileClick?: (file: OwnershipData['files'][0]) => void;
}

export function OwnershipPanel({ data, onFileClick }: OwnershipPanelProps) {
  if (!data || !data.files) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600">
        <div className="text-center">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No ownership data available</p>
        </div>
      </div>
    );
  }

  const getBusFactorColor = (busFactor: number) => {
    if (busFactor === 1) return 'text-red-400 bg-red-400/20';
    if (busFactor <= 2) return 'text-amber-400 bg-amber-400/20';
    return 'text-green-400 bg-green-400/20';
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-neutral-500">Avg Bus Factor</span>
          </div>
          <p className="text-3xl font-bold text-white">{data.averageBusFactor}</p>
          <p className="text-xs text-neutral-600 mt-1">people to cover 50% of code</p>
        </div>
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-sm text-red-400">High Risk Files</span>
          </div>
          <p className="text-3xl font-bold text-red-400">{data.highRiskFiles.length}</p>
          <p className="text-xs text-neutral-600 mt-1">single owner, 80%+ ownership</p>
        </div>
      </div>

      {/* High Risk Files */}
      {data.highRiskFiles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileWarning className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">Bus Factor Risk</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
            {data.highRiskFiles.map((file) => (
              <div
                key={file.file}
                className={`flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 ${onFileClick ? 'cursor-pointer hover:bg-red-500/20' : ''}`}
                onClick={() => onFileClick?.(file)}
              >
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{file.file}</p>
                  <p className="text-xs text-neutral-500">
                    {file.primaryOwner} owns {file.ownership}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top File Owners */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-neutral-500" />
          <span className="text-sm text-neutral-300">Code Owners by Files</span>
        </div>
        <div className="space-y-2">
          {data.ownersByFiles.slice(0, 5).map((owner, index) => (
            <div
              key={owner.email}
              className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800"
            >
              <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-300">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{owner.name}</p>
                <p className="text-xs text-neutral-500">
                  {owner.filesOwned} files · {owner.avgOwnership}% avg ownership
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* File Ownership Table */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-neutral-500" />
          <span className="text-sm text-neutral-300">File Ownership</span>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
          {data.files.slice(0, 15).map((file) => (
            <div
              key={file.file}
              className={`flex items-center gap-2 p-2 rounded bg-slate-900/30 text-xs ${onFileClick ? 'cursor-pointer hover:bg-neutral-900/50' : ''}`}
              onClick={() => onFileClick?.(file)}
            >
              <span className={`px-1.5 py-0.5 rounded ${getBusFactorColor(file.busFactor)}`}>
                BF:{file.busFactor}
              </span>
              <span className="text-neutral-500 flex-shrink-0 w-12">{file.ownership}%</span>
              <span className="text-white truncate flex-1">{file.file}</span>
              <span className="text-neutral-600 flex-shrink-0">{file.primaryOwner}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
