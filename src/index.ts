// Core analysis components
export * from './core/index.js';

// Feature modules (excluding types that conflict with core)
export {
  MemoryLoader,
  ImpactAnalyzer,
  ConventionChecker,
  TestSuggester,
  Visualizer,
  ComplexityEngine,
  TemporalAnalyzer,
  InvariantEngine,
  HotPathDetector,
  CodexiaWatcher,
  startWatchMode,
  ChangelogGenerator,
  generateChangelog,
  MonorepoDetector,
  MonorepoAnalyzer,
  analyzeMonorepo,
  SmartTestPrioritizer,
} from './modules/index.js';

// MCP Server for AI integration
export * from './mcp/index.js';

// CLI Engine
export { CodexiaEngine, type EngineOptions } from './cli/engine.js';
