import { FileCode, GitCommit, Users, TrendingUp, AlertTriangle, Calendar, Shield, Flame } from 'lucide-react';
import { Modal, DetailRow, MetricCard, ProgressBar } from './Modal';
import type { Contributor, Commit, Signal, FileOwnership, HotPath, ComplexityData, SignalsData } from '../types';

// File Details Modal
interface FileDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    file: string;
    score: number;
    metrics: {
      lines: number;
      functions: number;
      imports: number;
      exports: number;
      cyclomaticComplexity: number;
    };
  } | null;
}

export function FileDetailsModal({ isOpen, onClose, file }: FileDetailsModalProps) {
  if (!file) return null;

  const getScoreColor = (score: number) => {
    if (score > 20) return 'text-red-400';
    if (score > 10) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getScoreLabel = (score: number) => {
    if (score > 20) return 'High Complexity';
    if (score > 10) return 'Medium Complexity';
    return 'Low Complexity';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={file.file.split('/').pop() || file.file} subtitle={file.file} size="md">
      <div className="space-y-6">
        {/* Complexity Score */}
        <div className="text-center p-6 rounded-lg bg-neutral-900/50">
          <p className={`text-5xl font-bold ${getScoreColor(file.score)}`}>{file.score.toFixed(1)}</p>
          <p className="text-neutral-500 mt-2">{getScoreLabel(file.score)}</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Lines of Code" value={file.metrics.lines} icon={<FileCode className="w-4 h-4" />} color="blue" />
          <MetricCard label="Functions" value={file.metrics.functions} icon={<TrendingUp className="w-4 h-4" />} color="purple" />
          <MetricCard label="Cyclomatic" value={file.metrics.cyclomaticComplexity} icon={<AlertTriangle className="w-4 h-4" />} color={file.metrics.cyclomaticComplexity > 10 ? 'red' : 'green'} />
          <MetricCard label="Imports" value={file.metrics.imports} icon={<GitCommit className="w-4 h-4" />} color="yellow" />
        </div>

        {/* Recommendations */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <h4 className="text-sm font-medium text-white mb-3">Recommendations</h4>
          <ul className="space-y-2 text-sm text-neutral-500">
            {file.metrics.cyclomaticComplexity > 10 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                Consider breaking down complex functions
              </li>
            )}
            {file.metrics.lines > 300 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                File is getting large, consider splitting
              </li>
            )}
            {file.metrics.functions > 15 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                Many functions - might need refactoring
              </li>
            )}
            {file.metrics.cyclomaticComplexity <= 10 && file.metrics.lines <= 300 && (
              <li className="flex items-start gap-2 text-green-400">
                <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
                This file is well-structured!
              </li>
            )}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

// Contributor Details Modal
interface ContributorDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contributor: Contributor | null;
}

export function ContributorDetailsModal({ isOpen, onClose, contributor }: ContributorDetailsModalProps) {
  if (!contributor) return null;

  const daysSinceFirst = Math.floor((Date.now() - new Date(contributor.firstCommit).getTime()) / (1000 * 60 * 60 * 24));
  const daysSinceLast = Math.floor((Date.now() - new Date(contributor.lastCommit).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={contributor.name} subtitle={contributor.email} size="md">
      <div className="space-y-6">
        {/* Profile Header */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-neutral-900/50">
          <img
            src={contributor.avatar}
            alt={contributor.name}
            className="w-16 h-16 rounded-full bg-neutral-800"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.name)}&background=334155&color=f8fafc&size=64`;
            }}
          />
          <div>
            <h3 className="text-xl font-semibold text-white">{contributor.name}</h3>
            <p className="text-neutral-500">{contributor.email}</p>
            {contributor.isActive && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Active Contributor
              </span>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Total Commits" value={contributor.commits} icon={<GitCommit className="w-4 h-4" />} color="blue" />
          <MetricCard label="Recent (30d)" value={contributor.recentCommits} icon={<TrendingUp className="w-4 h-4" />} color="green" />
          <MetricCard label="Rank" value={`#${contributor.rank}`} icon={<Users className="w-4 h-4" />} color="yellow" />
        </div>

        {/* Timeline */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Activity Timeline
          </h4>
          <div className="space-y-3">
            <DetailRow label="First Commit" value={new Date(contributor.firstCommit).toLocaleDateString()} />
            <DetailRow label="Last Commit" value={daysSinceLast === 0 ? 'Today' : `${daysSinceLast} days ago`} />
            <DetailRow label="Contributing For" value={`${daysSinceFirst} days`} />
            <DetailRow 
              label="Commit Frequency" 
              value={`${(contributor.commits / Math.max(daysSinceFirst, 1) * 7).toFixed(1)} / week`} 
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Commit Details Modal
interface CommitDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  commit: Commit | null;
}

export function CommitDetailsModal({ isOpen, onClose, commit }: CommitDetailsModalProps) {
  if (!commit) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Commit Details" subtitle={commit.hash} size="md">
      <div className="space-y-6">
        {/* Commit Message */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <p className="text-white text-lg">{commit.message}</p>
        </div>

        {/* Author */}
        <div className="flex items-center gap-3 p-4 rounded-lg bg-neutral-900/50">
          <img
            src={commit.avatar}
            alt={commit.author}
            className="w-10 h-10 rounded-full bg-neutral-800"
          />
          <div>
            <p className="text-white font-medium">{commit.author}</p>
            <p className="text-sm text-neutral-500">{commit.email}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-neutral-500">{commit.relativeDate}</p>
            <p className="text-xs text-neutral-600">{new Date(commit.date).toLocaleString()}</p>
          </div>
        </div>

        {/* Commit Info */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <h4 className="text-sm font-medium text-white mb-3">Commit Info</h4>
          <DetailRow label="Full Hash" value={<code className="text-xs bg-neutral-800 px-2 py-1 rounded">{commit.fullHash}</code>} />
          <DetailRow label="Short Hash" value={<code className="text-xs bg-neutral-800 px-2 py-1 rounded">{commit.hash}</code>} />
          <DetailRow label="Date" value={new Date(commit.date).toLocaleString()} />
        </div>
      </div>
    </Modal>
  );
}

// Signal Details Modal
interface SignalDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  signal: Signal | null;
}

export function SignalDetailsModal({ isOpen, onClose, signal }: SignalDetailsModalProps) {
  if (!signal) return null;

  const severityConfig = {
    critical: { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30' },
    high: { color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30' },
    medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30' },
    low: { color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30' },
  };

  const config = severityConfig[signal.severity];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Signal Details" subtitle={signal.type} size="md">
      <div className="space-y-6">
        {/* Severity Badge */}
        <div className={`p-4 rounded-lg border ${config.bg} ${config.border}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className={`w-5 h-5 ${config.color}`} />
            <span className={`text-sm font-medium uppercase ${config.color}`}>{signal.severity}</span>
          </div>
          <p className="text-white">{signal.message}</p>
        </div>

        {/* Location */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <FileCode className="w-4 h-4" />
            Location
          </h4>
          <DetailRow label="File" value={signal.file} />
          {signal.line && <DetailRow label="Line" value={signal.line} />}
          <DetailRow label="Type" value={signal.type} />
        </div>

        {/* Suggestion */}
        {signal.suggestion && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
            <h4 className="text-sm font-medium text-green-400 mb-2">Suggestion</h4>
            <p className="text-neutral-300">{signal.suggestion}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Hot Path Details Modal
interface HotPathDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotPath: HotPath | null;
}

export function HotPathDetailsModal({ isOpen, onClose, hotPath }: HotPathDetailsModalProps) {
  if (!hotPath) return null;

  const getHeatColor = (score: number) => {
    if (score >= 0.8) return 'red';
    if (score >= 0.6) return 'orange';
    if (score >= 0.4) return 'yellow';
    return 'blue';
  };

  const getHeatLabel = (score: number) => {
    if (score >= 0.8) return 'Critical Hot Path';
    if (score >= 0.6) return 'High Risk';
    if (score >= 0.4) return 'Moderate';
    return 'Low Risk';
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={hotPath.path.split('/').pop() || hotPath.path} 
      subtitle={hotPath.path} 
      size="md"
    >
      <div className="space-y-6">
        {/* Score Display */}
        <div className="text-center p-6 rounded-lg bg-neutral-900/50">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Flame className={`w-8 h-8 text-${getHeatColor(hotPath.score)}-400`} />
            <p className={`text-5xl font-bold text-${getHeatColor(hotPath.score)}-400`}>
              {(hotPath.score * 100).toFixed(0)}
            </p>
          </div>
          <p className="text-neutral-500">{getHeatLabel(hotPath.score)}</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <MetricCard 
            label="Change Frequency" 
            value={hotPath.metrics.changeFrequency} 
            icon={<TrendingUp className="w-4 h-4" />} 
            color="blue"
            subtitle="commits"
          />
          <MetricCard 
            label="Complexity" 
            value={hotPath.metrics.complexity.toFixed(1)} 
            icon={<AlertTriangle className="w-4 h-4" />} 
            color={hotPath.metrics.complexity > 15 ? 'red' : 'yellow'}
            subtitle="score"
          />
          <MetricCard 
            label="Coupling" 
            value={`${(hotPath.metrics.couplingFactor * 100).toFixed(0)}%`} 
            icon={<GitCommit className="w-4 h-4" />} 
            color="purple"
            subtitle="factor"
          />
        </div>

        {/* Heat Breakdown */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <h4 className="text-sm font-medium text-white mb-3">Risk Factors</h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-500">Change Frequency</span>
                <span className="text-neutral-300">{hotPath.metrics.changeFrequency > 10 ? 'High' : 'Normal'}</span>
              </div>
              <ProgressBar 
                value={Math.min(hotPath.metrics.changeFrequency * 5, 100)} 
                color={hotPath.metrics.changeFrequency > 10 ? 'bg-red-500' : 'bg-blue-500'}
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-500">Complexity Score</span>
                <span className="text-neutral-300">{hotPath.metrics.complexity > 15 ? 'High' : 'Normal'}</span>
              </div>
              <ProgressBar 
                value={Math.min(hotPath.metrics.complexity * 3, 100)} 
                color={hotPath.metrics.complexity > 15 ? 'bg-orange-500' : 'bg-green-500'}
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-500">Coupling Factor</span>
                <span className="text-neutral-300">{hotPath.metrics.couplingFactor > 0.5 ? 'High' : 'Normal'}</span>
              </div>
              <ProgressBar 
                value={hotPath.metrics.couplingFactor * 100} 
                color={hotPath.metrics.couplingFactor > 0.5 ? 'bg-purple-500' : 'bg-slate-500'}
              />
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <h4 className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-2">
            <Flame className="w-4 h-4" />
            Recommendations
          </h4>
          <ul className="space-y-2 text-sm text-neutral-300">
            {hotPath.metrics.changeFrequency > 10 && (
              <li>• Consider stabilizing this frequently changed file</li>
            )}
            {hotPath.metrics.complexity > 15 && (
              <li>• Break down complex logic into smaller functions</li>
            )}
            {hotPath.metrics.couplingFactor > 0.5 && (
              <li>• Reduce coupling by using abstractions or interfaces</li>
            )}
            <li>• Add comprehensive tests to prevent regressions</li>
            <li>• Consider pair programming when modifying this file</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

// File Ownership Details Modal
interface OwnershipDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileOwnership | null;
}

export function OwnershipDetailsModal({ isOpen, onClose, file }: OwnershipDetailsModalProps) {
  if (!file) return null;

  const getBusFactorColor = (bf: number) => {
    if (bf === 1) return 'red';
    if (bf <= 2) return 'yellow';
    return 'green';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={file.file.split('/').pop() || file.file} subtitle={file.file} size="md">
      <div className="space-y-6">
        {/* Ownership Stats */}
        <div className="grid grid-cols-2 gap-4">
          <MetricCard 
            label="Primary Owner" 
            value={file.primaryOwner} 
            icon={<Users className="w-4 h-4" />} 
            color="blue" 
            subtitle={`${file.ownership}% ownership`}
          />
          <MetricCard 
            label="Bus Factor" 
            value={file.busFactor} 
            icon={<AlertTriangle className="w-4 h-4" />} 
            color={getBusFactorColor(file.busFactor)}
            subtitle={file.busFactor === 1 ? 'High Risk!' : 'people to cover 50%'}
          />
        </div>

        {/* Ownership Bar */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <h4 className="text-sm font-medium text-white mb-3">Ownership Distribution</h4>
          <ProgressBar 
            value={file.ownership} 
            color={file.ownership > 80 ? 'bg-red-500' : file.ownership > 50 ? 'bg-yellow-500' : 'bg-green-500'}
            label={file.primaryOwner}
          />
          <div className="mt-2">
            <ProgressBar 
              value={100 - file.ownership} 
              color="bg-slate-600"
              label="Others"
            />
          </div>
        </div>

        {/* Details */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <h4 className="text-sm font-medium text-white mb-3">File Info</h4>
          <DetailRow label="Contributors" value={file.contributors} />
          <DetailRow label="Last Modified" value={new Date(file.lastModified).toLocaleDateString()} />
          <DetailRow 
            label="Risk Level" 
            value={file.busFactor === 1 ? 'High' : file.busFactor <= 2 ? 'Medium' : 'Low'} 
            color={file.busFactor === 1 ? 'text-red-400' : file.busFactor <= 2 ? 'text-yellow-400' : 'text-green-400'}
          />
        </div>

        {/* Risk Warning */}
        {file.busFactor === 1 && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-red-400">Bus Factor Risk</h4>
                <p className="text-sm text-neutral-300 mt-1">
                  This file has only one primary contributor owning {file.ownership}% of the code. 
                  Consider knowledge sharing to reduce risk.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Health Score Details Modal
interface HealthScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  score: number;
  signalsData?: SignalsData | null;
  complexityData?: ComplexityData | null;
}

export function HealthScoreModal({ isOpen, onClose, score, signalsData, complexityData }: HealthScoreModalProps) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return 'text-green-400';
    if (s >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const criticalCount = signalsData?.bySeverity?.critical || 0;
  const highCount = signalsData?.bySeverity?.high || 0;
  const mediumCount = signalsData?.bySeverity?.medium || 0;
  const complexFiles = complexityData?.files?.filter(f => f.score > 15).length || 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Repository Health" subtitle="Score breakdown and recommendations" size="md">
      <div className="space-y-6">
        {/* Score Display */}
        <div className="text-center p-8 rounded-lg bg-neutral-900/50">
          <p className={`text-6xl font-bold ${getScoreColor(score)}`}>{score}</p>
          <p className="text-neutral-500 mt-2">
            {score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Needs Attention' : 'Critical'}
          </p>
        </div>

        {/* Score Factors */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <h4 className="text-sm font-medium text-white mb-3">Score Factors</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Critical Issues</span>
              <span className={`font-medium ${criticalCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {criticalCount > 0 ? `-${criticalCount * 15} pts` : '+0 pts'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">High Issues</span>
              <span className={`font-medium ${highCount > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                {highCount > 0 ? `-${highCount * 10} pts` : '+0 pts'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Medium Issues</span>
              <span className={`font-medium ${mediumCount > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                {mediumCount > 0 ? `-${mediumCount * 5} pts` : '+0 pts'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Complex Files</span>
              <span className={`font-medium ${complexFiles > 0 ? 'text-purple-400' : 'text-green-400'}`}>
                {complexFiles > 0 ? `-${complexFiles * 3} pts` : '+0 pts'}
              </span>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
          <h4 className="text-sm font-medium text-white mb-3">How to Improve</h4>
          <ul className="space-y-2 text-sm text-neutral-500">
            {criticalCount > 0 && (
              <li className="flex items-start gap-2">
                <span className="text-red-400">•</span>
                Fix {criticalCount} critical issues (+{criticalCount * 15} pts)
              </li>
            )}
            {highCount > 0 && (
              <li className="flex items-start gap-2">
                <span className="text-orange-400">•</span>
                Address {highCount} high priority issues (+{highCount * 10} pts)
              </li>
            )}
            {mediumCount > 0 && (
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">•</span>
                Review {mediumCount} medium issues (+{mediumCount * 5} pts)
              </li>
            )}
            {complexFiles > 0 && (
              <li className="flex items-start gap-2">
                <span className="text-purple-400">•</span>
                Reduce complexity in {complexFiles} complex files
              </li>
            )}
            {score >= 80 && (
              <li className="flex items-start gap-2 text-green-400">
                <Shield className="w-4 h-4 flex-shrink-0" />
                Great job! Keep maintaining this quality.
              </li>
            )}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
