// ============================================================================
// Git Types
// ============================================================================

export interface GitDiff {
  files: DiffFile[];
  stats: DiffStats;
  base: string;
  head: string;
}

export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  oldPath?: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface DiffStats {
  files: number;
  additions: number;
  deletions: number;
}

export interface FileHistory {
  path: string;
  commits: CommitInfo[];
  authors: AuthorStats[];
  changeFrequency: number;
  lastModified: Date;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: Date;
  files: string[];
}

export interface AuthorStats {
  name: string;
  email: string;
  commits: number;
  additions: number;
  deletions: number;
}

// ============================================================================
// Symbol Types
// ============================================================================

export type SymbolKind = 
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'property'
  | 'variable'
  | 'type'
  | 'enum'
  | 'namespace';

export interface Symbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  column: number;
  exported: boolean;
  documentation?: string;
  references: SymbolReference[];
}

export interface SymbolReference {
  filePath: string;
  line: number;
  column: number;
  kind: 'read' | 'write' | 'call' | 'import' | 'export';
}

export interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  lines: number;
  symbols: Symbol[];
  imports: ImportInfo[];
  exports: ExportInfo[];
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  line: number;
}

export interface ExportInfo {
  name: string;
  kind: SymbolKind;
  isDefault: boolean;
  line: number;
}

// ============================================================================
// Dependency Types
// ============================================================================

export interface DependencyNode {
  path: string;
  imports: string[];
  importedBy: string[];
  depth: number;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
  entryPoints: string[];
  cycles: string[][];
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: 'static' | 'dynamic' | 'type-only';
}

// ============================================================================
// Impact Analysis Types
// ============================================================================

export interface ImpactResult {
  directlyChanged: ChangedSymbol[];
  affectedModules: AffectedModule[];
  riskScore: RiskScore;
  publicApiChanges: ApiChange[];
  boundaryViolations: BoundaryViolation[];
}

export interface ChangedSymbol {
  symbol: Symbol;
  changeType: 'added' | 'modified' | 'deleted';
  diff?: string;
}

export interface AffectedModule {
  path: string;
  reason: string;
  distance: number;
  symbols: string[];
}

export interface RiskScore {
  overall: number; // 0-100
  factors: RiskFactor[];
}

export interface RiskFactor {
  name: string;
  score: number;
  weight: number;
  reason: string;
}

export interface ApiChange {
  symbol: string;
  filePath: string;
  changeType: 'breaking' | 'non-breaking' | 'addition' | 'deprecation';
  description: string;
}

export interface BoundaryViolation {
  from: string;
  to: string;
  rule: string;
  severity: 'error' | 'warning';
}

// ============================================================================
// Convention Types
// ============================================================================

export interface Convention {
  id: string;
  name: string;
  description: string;
  category: ConventionCategory;
  severity: 'error' | 'warning' | 'info';
  check: ConventionCheck;
}

export type ConventionCategory = 
  | 'naming'
  | 'structure'
  | 'imports'
  | 'exports'
  | 'documentation'
  | 'architecture'
  | 'testing';

export interface ConventionCheck {
  type: 'regex' | 'ast' | 'custom';
  pattern?: string;
  message: string;
}

export interface ConventionViolation {
  convention: Convention;
  filePath: string;
  line: number;
  column: number;
  message: string;
  suggestion?: string;
}

// ============================================================================
// Test Suggestion Types
// ============================================================================

export interface TestSuggestion {
  targetFile: string;
  targetSymbol: string;
  testFile: string;
  testType: 'unit' | 'integration' | 'e2e';
  reason: string;
  priority: 'high' | 'medium' | 'low';
  template?: string;
}

export interface TestCoverage {
  filePath: string;
  covered: boolean;
  testFiles: string[];
  symbolCoverage: Map<string, boolean>;
}

// ============================================================================
// Memory Types
// ============================================================================

export interface ProjectMemory {
  architecture: ArchitectureMemory;
  conventions: ConventionMemory;
  invariants: InvariantMemory;
  adrs: AdrMemory[];
}

export interface ArchitectureMemory {
  layers: ArchitectureLayer[];
  boundaries: ArchitectureBoundary[];
  entryPoints: string[];
  criticalPaths: string[];
}

export interface ArchitectureLayer {
  name: string;
  description: string;
  paths: string[];
  allowedDependencies: string[];
}

export interface ArchitectureBoundary {
  from: string;
  to: string;
  allowed: boolean;
  reason: string;
}

export interface ConventionMemory {
  naming: NamingConvention[];
  structure: StructureConvention[];
  patterns: PatternConvention[];
}

export interface NamingConvention {
  target: string;
  pattern: string;
  example: string;
}

export interface StructureConvention {
  description: string;
  rule: string;
}

export interface PatternConvention {
  name: string;
  description: string;
  when: string;
}

export interface InvariantMemory {
  rules: Invariant[];
}

export interface Invariant {
  id: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  check?: string;
}

export interface AdrMemory {
  id: string;
  title: string;
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  date: string;
  context: string;
  decision: string;
  consequences: string[];
}

// ============================================================================
// Analysis Result Types
// ============================================================================

export interface AnalysisResult {
  success: boolean;
  duration: number;
  stats: AnalysisStats;
  hasMemory: boolean;
}

export interface AnalysisStats {
  files: number;
  symbols: number;
  exports: number;
  avgFanOut: number;
}

// ============================================================================
// PR Report Types
// ============================================================================

export interface PrReport {
  summary: PrSummary;
  impact: ImpactResult;
  conventions: ConventionViolation[];
  tests: TestSuggestion[];
  risks: RiskAssessment;
}

export interface PrSummary {
  title: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  authors: string[];
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  factors: RiskFactor[];
  recommendations: string[];
}

// ============================================================================
// Signal Types
// ============================================================================

export interface Signal {
  type: SignalType;
  severity: 'info' | 'warning' | 'error';
  message: string;
  evidence: Evidence[];
  filePath?: string;
  line?: number;
}

export type SignalType =
  | 'high-churn'
  | 'god-class'
  | 'circular-dependency'
  | 'orphan-code'
  | 'missing-tests'
  | 'convention-violation'
  | 'boundary-violation'
  | 'breaking-change';

export interface Evidence {
  type: 'commit' | 'code' | 'metric' | 'rule';
  description: string;
  source: string;
}
