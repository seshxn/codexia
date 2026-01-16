// Core modules
export { MemoryLoader } from './memory-loader.js';
export { ImpactAnalyzer } from './impact-analyzer.js';
export { ConventionChecker } from './convention-checker.js';
export { TestSuggester } from './test-suggester.js';

// Advanced analysis modules
export { Visualizer, type VisualizationFormat, type GraphData, type VisualizationOptions } from './visualizer.js';
export { ComplexityEngine, type ComplexityScore, type FileComplexity, type SymbolComplexity } from './complexity-engine.js';
export { TemporalAnalyzer, type TemporalInsights, type ContributorInsight, type ChangePattern } from './temporal-analyzer.js';
export { InvariantEngine, type InvariantRule, type InvariantViolation, type InvariantCheckResult } from './invariant-engine.js';
export { HotPathDetector, type HotPath, type HotPathNode, type HotPathAnalysis } from './hot-path-detector.js';

// Live analysis
export { CodexiaWatcher, startWatchMode, type WatchEvent, type WatchOptions } from './watcher.js';

// Changelog generation
export { ChangelogGenerator, generateChangelog, type ChangelogEntry, type ChangelogOptions } from './changelog-generator.js';

// Monorepo support
export { MonorepoDetector, MonorepoAnalyzer, analyzeMonorepo, type MonorepoAnalysis } from './monorepo-analyzer.js';

// Smart test prioritization
export { SmartTestPrioritizer, type PrioritizedTest, type TestPrioritizationResult } from './smart-test-prioritizer.js';
