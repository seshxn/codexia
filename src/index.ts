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
  DriftRadar,
  CodexiaWatcher,
  startWatchMode,
  ChangelogGenerator,
  generateChangelog,
  MonorepoDetector,
  MonorepoAnalyzer,
  analyzeMonorepo,
  SmartTestPrioritizer,
  RefactorCartographer,
} from './modules/index.js';

// MCP Server for AI integration
export * from './mcp/index.js';

// AI Integration
export * from './ai/index.js';

// Language Providers
export * from './core/language-providers/index.js';

// CLI Engine
export { CodexiaEngine, type EngineOptions } from './cli/engine.js';

// CodeGraph compatibility layer
export { CodeGraphRegistry } from './codegraph/registry.js';
export type {
  CodeGraphStats,
  RepoRegistryEntry,
  RepoStatus,
  SessionRecord,
  PlanStep,
  IntentLocation,
} from './codegraph/types.js';
export { SessionStore } from './learning/session-store.js';
export { ExecutionPlanner } from './learning/planner.js';
export { IntentMapper } from './learning/intent-map.js';
