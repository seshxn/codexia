import { useState } from 'react';
import { AlertTriangle, Shield, Users, FileWarning, ChevronDown, ChevronUp } from 'lucide-react';
import type { OwnershipData } from '../types';

interface OwnershipPanelProps {
  data: OwnershipData;
  onFileClick?: (file: OwnershipData['files'][0]) => void;
}

export const OwnershipPanel = ({ data, onFileClick }: OwnershipPanelProps) => {
  const [showAllHighRisk, setShowAllHighRisk] = useState(false);
  const [showAllOwners, setShowAllOwners] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);

  if (!data || !data.files) {
    return (
      <div className="flex items-center justify-center h-48 text-ink-faint">
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

  const displayedHighRisk = showAllHighRisk ? data.highRiskFiles : data.highRiskFiles.slice(0, 5);
  const displayedOwners = showAllOwners ? data.ownersByFiles : data.ownersByFiles.slice(0, 5);
  const displayedFiles = showAllFiles ? data.files : data.files.slice(0, 15);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-surface-subtle/50 border border-edge">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-blue-400" />
            <span className="text-sm text-ink-faint">Avg Bus Factor</span>
          </div>
          <p className="text-3xl font-bold text-ink">{data.averageBusFactor}</p>
          <p className="text-xs text-ink-faint mt-1">people to cover 50% of code</p>
        </div>
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-sm text-red-400">High Risk Files</span>
          </div>
          <p className="text-3xl font-bold text-red-400">{data.highRiskFiles.length}</p>
          <p className="text-xs text-ink-faint mt-1">single owner, 80%+ ownership</p>
        </div>
      </div>

      {/* High Risk Files */}
      {data.highRiskFiles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileWarning className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">Bus Factor Risk</span>
          </div>
          <div className={`space-y-2 ${showAllHighRisk ? 'max-h-64 overflow-y-auto' : ''} pr-2`}>
            {displayedHighRisk.map((file) => (
              <div
                key={file.file}
                className={`flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 ${onFileClick ? 'cursor-pointer hover:bg-red-500/20' : ''}`}
                onClick={() => onFileClick?.(file)}
              >
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{file.file}</p>
                  <p className="text-xs text-ink-faint">
                    {file.primaryOwner} owns {file.ownership}%
                  </p>
                </div>
              </div>
            ))}
          </div>
          {data.highRiskFiles.length > 5 && (
            <button
              onClick={() => setShowAllHighRisk(!showAllHighRisk)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-ink-faint hover:text-ink transition-colors"
            >
              {showAllHighRisk ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Show All ({data.highRiskFiles.length} files)
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Top File Owners */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-ink-faint" />
          <span className="text-sm text-ink-secondary">Code Owners by Files</span>
        </div>
        <div className={`space-y-2 ${showAllOwners ? 'max-h-64 overflow-y-auto' : ''} pr-2`}>
          {displayedOwners.map((owner, index) => (
            <div
              key={owner.email}
              className="flex items-center gap-3 p-3 rounded-lg bg-surface-subtle/50 border border-edge"
            >
              <div className="w-6 h-6 rounded-full bg-surface-ui flex items-center justify-center text-xs font-bold text-ink-secondary">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink truncate">{owner.name}</p>
                <p className="text-xs text-ink-faint">
                  {owner.filesOwned} files · {owner.avgOwnership}% avg ownership
                </p>
              </div>
            </div>
          ))}
        </div>
        {data.ownersByFiles.length > 5 && (
          <button
            onClick={() => setShowAllOwners(!showAllOwners)}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-ink-faint hover:text-ink transition-colors"
          >
            {showAllOwners ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show All ({data.ownersByFiles.length} owners)
              </>
            )}
          </button>
        )}
      </div>

      {/* File Ownership Table */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-ink-faint" />
          <span className="text-sm text-ink-secondary">File Ownership</span>
          <span className="text-xs text-ink-faint">({data.files.length} files)</span>
        </div>
        <div className={`space-y-1 ${showAllFiles ? 'max-h-72 overflow-y-auto' : ''} pr-2`}>
          {displayedFiles.map((file) => (
            <div
              key={file.file}
              className={`flex items-center gap-2 p-2 rounded bg-surface-subtle/30 text-xs ${onFileClick ? 'cursor-pointer hover:bg-surface-subtle/50' : ''}`}
              onClick={() => onFileClick?.(file)}
            >
              <span className={`px-1.5 py-0.5 rounded ${getBusFactorColor(file.busFactor)}`}>
                BF:{file.busFactor}
              </span>
              <span className="text-ink-faint flex-shrink-0 w-12">{file.ownership}%</span>
              <span className="text-ink truncate flex-1">{file.file}</span>
              <span className="text-ink-faint flex-shrink-0">{file.primaryOwner}</span>
            </div>
          ))}
        </div>
        {data.files.length > 15 && (
          <button
            onClick={() => setShowAllFiles(!showAllFiles)}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-ink-faint hover:text-ink transition-colors"
          >
            {showAllFiles ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show All ({data.files.length} files)
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
