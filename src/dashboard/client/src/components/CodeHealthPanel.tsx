import { useState } from 'react';
import { 
  Heart, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp,
  FileWarning,
  Gauge,
  Layers,
  Info,
  X
} from 'lucide-react';
import type { CodeHealthData } from '../types';

interface CodeHealthPanelProps {
  data: CodeHealthData;
}

// Scoring guide based on industry standards
const SCORING_GUIDE = {
  maintainability: {
    title: 'Maintainability Index',
    description: 'Based on Microsoft\'s Maintainability Index formula, measuring code readability, complexity, and size.',
    grades: [
      { grade: 'A', range: '80-100', meaning: 'Highly maintainable, clean code' },
      { grade: 'B', range: '60-79', meaning: 'Good maintainability, minor improvements needed' },
      { grade: 'C', range: '40-59', meaning: 'Moderate maintainability, refactoring recommended' },
      { grade: 'D', range: '20-39', meaning: 'Low maintainability, significant refactoring needed' },
      { grade: 'F', range: '0-19', meaning: 'Poor maintainability, critical attention required' },
    ]
  },
  complexity: {
    title: 'Cyclomatic Complexity',
    description: 'Measures the number of independent paths through code. Based on McCabe\'s complexity metric.',
    thresholds: [
      { level: 'Low', range: '1-20', color: 'emerald', meaning: 'Simple, easy to test and maintain' },
      { level: 'Moderate', range: '21-50', color: 'lime', meaning: 'Acceptable complexity, consider splitting' },
      { level: 'High', range: '51-80', color: 'amber', meaning: 'Complex, harder to test, refactor recommended' },
      { level: 'Critical', range: '80+', color: 'red', meaning: 'Very complex, high risk, needs immediate attention' },
    ]
  },
  techDebt: {
    title: 'Technical Debt Score',
    description: 'Aggregated score based on code smells, coupling, cohesion, and static analysis signals.',
    grades: [
      { grade: 'A', range: '0-20 pts', meaning: 'Minimal debt, well-maintained codebase' },
      { grade: 'B', range: '21-50 pts', meaning: 'Low debt, manageable with regular maintenance' },
      { grade: 'C', range: '51-100 pts', meaning: 'Moderate debt, schedule refactoring sprints' },
      { grade: 'D', range: '101-200 pts', meaning: 'High debt, prioritize debt reduction' },
      { grade: 'F', range: '200+ pts', meaning: 'Critical debt, blocking velocity' },
    ]
  }
};

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-emerald-400';
    case 'B': return 'text-lime-400';
    case 'C': return 'text-amber-400';
    case 'D': return 'text-orange-400';
    case 'F': return 'text-red-400';
    default: return 'text-neutral-400';
  }
}

function getGradeBg(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-emerald-500/10 border-emerald-500/30';
    case 'B': return 'bg-lime-500/10 border-lime-500/30';
    case 'C': return 'bg-amber-500/10 border-amber-500/30';
    case 'D': return 'bg-orange-500/10 border-orange-500/30';
    case 'F': return 'bg-red-500/10 border-red-500/30';
    default: return 'bg-neutral-500/10 border-neutral-500/30';
  }
}

function ScoringGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto animate-scale-in shadow-elevated">
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Scoring Guide</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1 transition-colors hover:bg-neutral-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-6">
          {/* Maintainability */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">{SCORING_GUIDE.maintainability.title}</h3>
            <p className="text-xs text-neutral-400 mb-3">{SCORING_GUIDE.maintainability.description}</p>
            <div className="grid gap-2">
              {SCORING_GUIDE.maintainability.grades.map(g => (
                <div key={g.grade} className="flex items-center gap-3 text-xs">
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center font-bold ${getGradeBg(g.grade)} ${getGradeColor(g.grade)}`}>
                    {g.grade}
                  </span>
                  <span className="text-neutral-500 w-16">{g.range}</span>
                  <span className="text-neutral-300">{g.meaning}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Complexity */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">{SCORING_GUIDE.complexity.title}</h3>
            <p className="text-xs text-neutral-400 mb-3">{SCORING_GUIDE.complexity.description}</p>
            <div className="grid gap-2">
              {SCORING_GUIDE.complexity.thresholds.map(t => (
                <div key={t.level} className="flex items-center gap-3 text-xs">
                  <span className={`w-3 h-3 rounded-full bg-${t.color}-500`} />
                  <span className="text-neutral-300 w-20">{t.level}</span>
                  <span className="text-neutral-500 w-12">{t.range}</span>
                  <span className="text-neutral-400">{t.meaning}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tech Debt */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">{SCORING_GUIDE.techDebt.title}</h3>
            <p className="text-xs text-neutral-400 mb-3">{SCORING_GUIDE.techDebt.description}</p>
            <div className="grid gap-2">
              {SCORING_GUIDE.techDebt.grades.map(g => (
                <div key={g.grade} className="flex items-center gap-3 text-xs">
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center font-bold ${getGradeBg(g.grade)} ${getGradeColor(g.grade)}`}>
                    {g.grade}
                  </span>
                  <span className="text-neutral-500 w-20">{g.range}</span>
                  <span className="text-neutral-300">{g.meaning}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Industry Standards */}
          <div className="pt-4 border-t border-neutral-800">
            <h3 className="text-sm font-semibold text-white mb-2">Based on Industry Standards</h3>
            <ul className="text-xs text-neutral-400 space-y-1.5">
              <li>• <strong className="text-neutral-300">Maintainability Index:</strong> Microsoft Visual Studio metric (1991)</li>
              <li>• <strong className="text-neutral-300">Cyclomatic Complexity:</strong> McCabe complexity (IEEE, 1976)</li>
              <li>• <strong className="text-neutral-300">Coupling/Cohesion:</strong> SOLID principles, Clean Code (Robert C. Martin)</li>
              <li>• <strong className="text-neutral-300">Tech Debt:</strong> SonarQube-inspired weighted scoring</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CodeHealthPanel({ data }: CodeHealthPanelProps) {
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const displayedFiles = showAllFiles 
    ? data.filesNeedingAttention 
    : data.filesNeedingAttention.slice(0, 5);

  const totalComplexity = data.complexity.distribution.low + 
    data.complexity.distribution.moderate + 
    data.complexity.distribution.high + 
    data.complexity.distribution.critical;

  return (
    <div className="space-y-6">
      {showGuide && <ScoringGuideModal onClose={() => setShowGuide(false)} />}
      
      {/* Info Banner */}
      <button 
        onClick={() => setShowGuide(true)}
        className="w-full flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors"
      >
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        <span>View scoring methodology based on industry standards</span>
      </button>

      {/* Top Stats */}
      <div className="grid grid-cols-2 gap-3">
        {/* Maintainability Grade */}
        <div className={`p-3 rounded-xl border ${getGradeBg(data.maintainability.grade)}`}>
          <div className="flex items-center gap-2 mb-1">
            <Heart className={`w-4 h-4 ${getGradeColor(data.maintainability.grade)}`} />
            <span className="text-xs text-neutral-400">Maintainability</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${getGradeColor(data.maintainability.grade)}`}>
              {data.maintainability.grade}
            </span>
            <span className="text-sm text-neutral-500">{data.maintainability.average}/100</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">Microsoft Maintainability Index</p>
        </div>

        {/* Technical Debt */}
        <div className={`p-3 rounded-xl border ${getGradeBg(data.technicalDebt.grade)}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={`w-4 h-4 ${getGradeColor(data.technicalDebt.grade)}`} />
            <span className="text-xs text-neutral-400">Tech Debt</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${getGradeColor(data.technicalDebt.grade)}`}>
              {data.technicalDebt.grade}
            </span>
            <span className="text-sm text-neutral-500">{data.technicalDebt.score}pts</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">Weighted code smell score</p>
        </div>

        {/* Avg Complexity */}
        <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-900/30">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-neutral-400">Avg Complexity</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">
              {data.complexity.averageScore}
            </span>
            <span className="text-xs text-neutral-500">per file</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">McCabe cyclomatic complexity</p>
        </div>

        {/* Codebase Size */}
        <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-900/30">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-neutral-400">Codebase</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">
              {(data.codebase.totalLines / 1000).toFixed(1)}k
            </span>
            <span className="text-xs text-neutral-500">lines</span>
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">{data.codebase.totalFiles} files total</p>
        </div>
      </div>

      {/* Complexity Distribution */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-neutral-300">Complexity Distribution</h3>
          <span className="text-[10px] text-neutral-500">McCabe Cyclomatic</span>
        </div>
        <div className="flex gap-1 h-6 rounded-lg overflow-hidden">
          {totalComplexity > 0 && (
            <>
              <div 
                className="bg-emerald-500 transition-all duration-500"
                style={{ width: `${(data.complexity.distribution.low / totalComplexity) * 100}%` }}
                title={`Low: ${data.complexity.distribution.low} files`}
              />
              <div 
                className="bg-lime-500 transition-all duration-500"
                style={{ width: `${(data.complexity.distribution.moderate / totalComplexity) * 100}%` }}
                title={`Moderate: ${data.complexity.distribution.moderate} files`}
              />
              <div 
                className="bg-amber-500 transition-all duration-500"
                style={{ width: `${(data.complexity.distribution.high / totalComplexity) * 100}%` }}
                title={`High: ${data.complexity.distribution.high} files`}
              />
              <div 
                className="bg-red-500 transition-all duration-500"
                style={{ width: `${(data.complexity.distribution.critical / totalComplexity) * 100}%` }}
                title={`Critical: ${data.complexity.distribution.critical} files`}
              />
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-neutral-400">Low</span>
            <span className="text-neutral-500 text-[10px]">(1-20)</span>
            <span className="text-white ml-auto">{data.complexity.distribution.low}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-lime-500" />
            <span className="text-neutral-400">Moderate</span>
            <span className="text-neutral-500 text-[10px]">(21-50)</span>
            <span className="text-white ml-auto">{data.complexity.distribution.moderate}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-neutral-400">High</span>
            <span className="text-neutral-500 text-[10px]">(51-80)</span>
            <span className="text-white ml-auto">{data.complexity.distribution.high}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-neutral-400">Critical</span>
            <span className="text-neutral-500 text-[10px]">(80+)</span>
            <span className="text-white ml-auto">{data.complexity.distribution.critical}</span>
          </span>
        </div>
      </div>

      {/* Debt Indicators */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-neutral-300">Technical Debt Indicators</h3>
          <span className="text-[10px] text-neutral-500">Clean Code violations</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-center" title="Files with cyclomatic complexity > 60">
            <p className="text-2xl font-bold text-orange-400">{data.technicalDebt.indicators.highComplexity}</p>
            <p className="text-xs text-neutral-500">High Complexity</p>
            <p className="text-[9px] text-neutral-600 mt-0.5">CC &gt; 60</p>
          </div>
          <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-center" title="Modules with poor cohesion (unrelated responsibilities)">
            <p className="text-2xl font-bold text-amber-400">{data.technicalDebt.indicators.lowCohesion}</p>
            <p className="text-xs text-neutral-500">Low Cohesion</p>
            <p className="text-[9px] text-neutral-600 mt-0.5">SRP violations</p>
          </div>
          <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-center" title="Modules with too many dependencies">
            <p className="text-2xl font-bold text-purple-400">{data.technicalDebt.indicators.highCoupling}</p>
            <p className="text-xs text-neutral-500">High Coupling</p>
            <p className="text-[9px] text-neutral-600 mt-0.5">&gt;10 deps</p>
          </div>
          <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-center" title="Critical issues from static analysis">
            <p className="text-2xl font-bold text-red-400">{data.technicalDebt.indicators.errors}</p>
            <p className="text-xs text-neutral-500">Errors</p>
            <p className="text-[9px] text-neutral-600 mt-0.5">Critical</p>
          </div>
          <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-center" title="Non-critical issues that should be addressed">
            <p className="text-2xl font-bold text-yellow-400">{data.technicalDebt.indicators.warnings}</p>
            <p className="text-xs text-neutral-500">Warnings</p>
            <p className="text-[9px] text-neutral-600 mt-0.5">Medium</p>
          </div>
        </div>
      </div>

      {/* Files Needing Attention */}
      {data.filesNeedingAttention.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileWarning className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-medium text-neutral-300">Files Needing Attention</h3>
          </div>
          <div className="space-y-2">
            {displayedFiles.map((file) => (
              <div
                key={file.file}
                className="flex items-center gap-3 p-3 rounded-lg bg-neutral-900/50 border border-neutral-800"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate font-mono">{file.file}</p>
                  <p className="text-xs text-amber-400 mt-0.5">{file.reason}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-semibold text-white">{file.score.toFixed(1)}</p>
                  <p className="text-xs text-neutral-500">{file.lines} lines</p>
                </div>
              </div>
            ))}
          </div>
          {data.filesNeedingAttention.length > 5 && (
            <button
              onClick={() => setShowAllFiles(!showAllFiles)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              {showAllFiles ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Show All ({data.filesNeedingAttention.length} files)
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
