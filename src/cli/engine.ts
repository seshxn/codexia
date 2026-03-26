import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  GitAnalyzer,
  GraphStore,
  RepoIndexer,
  DependencyGraph,
  SymbolMap,
  SignalsEngine,
  SemanticIndex,
  DocsIndex,
} from '../core/index.js';
import {
  MemoryLoader,
  ImpactAnalyzer,
  ConventionChecker,
  TestSuggester,
  TemporalAnalyzer,
  CognitiveLoadAnalyzer,
  type CognitiveLoadMapResult,
  InvariantEngine,
  HotPathDetector,
  ChangelogGenerator,
  MonorepoAnalyzer,
  MonorepoDetector,
  SmartTestPrioritizer,
  RefactorCartographer,
  type RefactorPlanRequest,
  type RefactorPlanResult,
  DriftRadar,
  type DriftSignal,
} from '../modules/index.js';
import type {
  GitDiff,
  ImpactResult,
  RiskScore,
  ConventionViolation,
  TestSuggestion,
  PrReport,
  AnalysisResult,
  ProjectMemory,
  CommitRecord,
  Symbol,
  Signal,
  FileInfo,
} from '../core/types.js';
import { CodeGraphRegistry } from '../codegraph/registry.js';
import type { IntentLocation, PlanStep, RepoRegistryEntry, RepoStatus, SessionRecord } from '../codegraph/types.js';
import { SessionStore } from '../learning/session-store.js';
import { ExecutionPlanner } from '../learning/planner.js';
import { IntentMapper } from '../learning/intent-map.js';

export interface EngineOptions {
  repoRoot?: string;
  verbose?: boolean;
}

export interface EngineInitializationProgress {
  phase: 'indexing' | 'graph' | 'semantic';
  progress: number;
  message: string;
}

export class CodexiaEngine {
  private repoRoot: string;
  private git: GitAnalyzer;
  private graphStore: GraphStore;
  private semanticIndex: SemanticIndex;
  private indexer: RepoIndexer;
  private depGraph: DependencyGraph;
  private symbolMap: SymbolMap;
  private memory: MemoryLoader;
  private impactAnalyzer: ImpactAnalyzer;
  private conventionChecker: ConventionChecker;
  private testSuggester: TestSuggester;
  private signalsEngine: SignalsEngine;
  private temporalAnalyzer: TemporalAnalyzer;
  private cognitiveLoadAnalyzer: CognitiveLoadAnalyzer;
  private invariantEngine: InvariantEngine;
  private hotPathDetector: HotPathDetector;
  private changelogGenerator: ChangelogGenerator;
  private monorepoDetector: MonorepoDetector;
  private monorepoAnalyzer: MonorepoAnalyzer | null = null;
  private testPrioritizer: SmartTestPrioritizer;
  private driftRadar: DriftRadar;
  private registry: CodeGraphRegistry;
  private sessionStore: SessionStore;
  private planner: ExecutionPlanner;
  private intentMapper: IntentMapper;
  private docsIndex: DocsIndex;
  private currentSessionHead?: string;
  private initialized = false;

  constructor(options: EngineOptions = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    
    // Initialize all components
    this.git = new GitAnalyzer(this.repoRoot);
    this.graphStore = new GraphStore(this.repoRoot);
    this.semanticIndex = new SemanticIndex(this.repoRoot);
    this.indexer = new RepoIndexer(this.repoRoot);
    this.depGraph = new DependencyGraph(this.repoRoot);
    this.symbolMap = new SymbolMap(this.repoRoot);
    this.memory = new MemoryLoader(this.repoRoot);
    this.impactAnalyzer = new ImpactAnalyzer(this.depGraph);
    this.conventionChecker = new ConventionChecker();
    this.testSuggester = new TestSuggester();
    this.signalsEngine = new SignalsEngine();
    
    // New advanced components
    this.temporalAnalyzer = new TemporalAnalyzer(this.repoRoot);
    this.cognitiveLoadAnalyzer = new CognitiveLoadAnalyzer();
    this.invariantEngine = new InvariantEngine(this.repoRoot);
    this.hotPathDetector = new HotPathDetector(this.repoRoot);
    this.changelogGenerator = new ChangelogGenerator(this.repoRoot);
    this.monorepoDetector = new MonorepoDetector(this.repoRoot);
    this.testPrioritizer = new SmartTestPrioritizer();
    this.driftRadar = new DriftRadar();
    this.registry = new CodeGraphRegistry(this.repoRoot);
    this.sessionStore = new SessionStore(this.repoRoot);
    this.planner = new ExecutionPlanner();
    this.intentMapper = new IntentMapper();
    this.docsIndex = new DocsIndex(this.repoRoot);
  }

  /**
   * Initialize the engine by indexing the repository
   */
  async initialize(onProgress?: (update: EngineInitializationProgress) => void): Promise<void> {
    if (this.initialized) return;

    onProgress?.({
      phase: 'indexing',
      progress: 20,
      message: 'Indexing repository files.',
    });
    await this.loadIndex(false);
    onProgress?.({
      phase: 'graph',
      progress: 70,
      message: 'Initializing graph store.',
    });
    await this.graphStore.initialize();
    onProgress?.({
      phase: 'semantic',
      progress: 90,
      message: 'Loading semantic index.',
    });
    await this.semanticIndex.load();
  }

  private async loadIndex(force: boolean): Promise<void> {
    if (force) {
      await this.indexer.reindex();
    } else {
      await this.indexer.index();
    }

    this.depGraph = new DependencyGraph(this.repoRoot);
    this.symbolMap = new SymbolMap(this.repoRoot);

    const files = this.indexer.getFiles();
    this.depGraph.buildFromImports(files);
    this.symbolMap.buildFromFiles(files);

    const projectMemory = await this.memory.loadMemory();
    if (projectMemory?.conventions) {
      this.conventionChecker.loadFromMemory(projectMemory.conventions);
    }
    if (projectMemory?.architecture) {
      this.impactAnalyzer.setArchitecture(projectMemory.architecture);
    }

    this.initialized = true;
  }

  /**
   * Scan and analyze the repository
   */
  async scan(): Promise<AnalysisResult> {
    const start = Date.now();
    
    await this.initialize();
    
    const stats = this.indexer.getStats();
    const hasMemory = await this.memory.hasMemory();

    return {
      success: true,
      duration: Date.now() - start,
      stats,
      hasMemory,
    };
  }

  async analyzeRepository(options: { force?: boolean } = {}): Promise<AnalysisResult> {
    const start = Date.now();

    await this.loadIndex(Boolean(options.force));
    await this.graphStore.rebuild(this.indexer.getFiles(), this.depGraph);
    if (await this.git.isGitRepo()) {
      const commits = await this.git.getRecentCommits(200);
      await this.graphStore.syncTemporalData(this.indexer.getFiles(), commits);
    }
    await this.semanticIndex.build(this.indexer.getFiles());
    const stats = this.indexer.getStats();
    const hasMemory = await this.memory.hasMemory();
    await this.registry.registerRepo(stats);

    return {
      success: true,
      duration: Date.now() - start,
      stats,
      hasMemory,
    };
  }

  async updateRepository(): Promise<AnalysisResult> {
    const start = Date.now();
    await this.graphStore.initialize();
    const incremental = await this.indexer.incrementalUpdate();

    this.depGraph = new DependencyGraph(this.repoRoot);
    this.symbolMap = new SymbolMap(this.repoRoot);
    this.depGraph.buildFromImports(this.indexer.getFiles());
    this.symbolMap.buildFromFiles(this.indexer.getFiles());

    if (incremental.changedFiles.length > 0 || incremental.deletedFiles.length > 0) {
      await this.graphStore.updateFiles(
        this.indexer.getFiles(),
        this.depGraph,
        incremental.changedFiles,
        incremental.deletedFiles
      );
    }

    if (await this.git.isGitRepo()) {
      const commits = await this.git.getRecentCommits(200);
      await this.graphStore.syncTemporalData(this.indexer.getFiles(), commits);
    }
    if (incremental.changedFiles.length > 0 || incremental.deletedFiles.length > 0 || !(await this.semanticIndex.exists())) {
      await this.semanticIndex.build(this.indexer.getFiles());
    }

    this.initialized = true;
    const result = {
      success: true,
      duration: Date.now() - start,
      stats: this.indexer.getStats(),
      hasMemory: await this.memory.hasMemory(),
    };
    const now = new Date().toISOString();
    await this.registry.updateRepoState({
      analyzedAt: now,
      updatedAt: now,
      stats: result.stats,
    });
    return result;
  }

  async getRepoStatus(): Promise<RepoStatus> {
    const sessionCount = await this.sessionStore.getSessionCount();
    return this.registry.getStatus(sessionCount);
  }

  async listRegisteredRepos(): Promise<RepoRegistryEntry[]> {
    return this.registry.listRepos();
  }

  async cleanRepository(): Promise<void> {
    await this.indexer.clearCache();
    await this.registry.unregisterRepo();
    try {
      await fs.unlink(path.join(this.repoRoot, '.codexia', 'index-cache.json'));
    } catch {
      // Ignore missing cache file.
    }
  }

  /**
   * Analyze impact of changes
   */
  async analyzeImpact(options: {
    base?: string;
    head?: string;
    staged?: boolean;
  } = {}): Promise<ImpactResult> {
    await this.initialize();

    let diff: GitDiff;

    if (options.staged) {
      diff = await this.git.getStagedDiff();
    } else {
      diff = await this.git.getDiff(options.base || 'HEAD', options.head || '');
    }

    const files = this.indexer.getFiles();
    const symbols = new Map<string, Symbol[]>();
    
    for (const [filePath, fileInfo] of files) {
      symbols.set(filePath, fileInfo.symbols);
    }

    return this.impactAnalyzer.analyze(diff, files, symbols);
  }

  /**
   * Check conventions
   */
  async checkConventions(options: {
    base?: string;
    staged?: boolean;
  } = {}): Promise<ConventionViolation[]> {
    await this.initialize();

    let diff: GitDiff;

    if (options.staged) {
      diff = await this.git.getStagedDiff();
    } else {
      diff = await this.git.getDiff(options.base || 'HEAD');
    }

    const files = this.indexer.getFiles();
    return this.conventionChecker.check(diff, files);
  }

  /**
   * Suggest tests
   */
  async suggestTests(options: {
    base?: string;
    staged?: boolean;
  } = {}): Promise<TestSuggestion[]> {
    await this.initialize();

    let diff: GitDiff;

    if (options.staged) {
      diff = await this.git.getStagedDiff();
    } else {
      diff = await this.git.getDiff(options.base || 'HEAD');
    }

    const files = this.indexer.getFiles();
    const existingTests = this.testSuggester.findExistingTests(files);

    return this.testSuggester.suggest(diff, files, existingTests);
  }

  /**
   * Analyze code signals (orphans, god classes, cycles)
   */
  async analyzeSignals(options: {
    checkOrphans?: boolean;
    checkGodClasses?: boolean;
    checkCycles?: boolean;
  } = {}): Promise<Signal[]> {
    await this.initialize();

    const signals: Signal[] = [];
    const files = this.indexer.getFiles();

    // Check for god classes
    if (options.checkGodClasses !== false) {
      for (const [filePath, fileInfo] of files) {
        const signal = this.signalsEngine.detectGodClass(
          filePath,
          fileInfo.lines,
          fileInfo.symbols.length
        );
        if (signal) {
          signals.push(signal);
        }
      }
    }

    // Check for circular dependencies
    if (options.checkCycles !== false) {
      const cycles = this.depGraph.detectCycles();
      for (const cycle of cycles) {
        signals.push(this.signalsEngine.detectCircularDependency(cycle));
      }
    }

    // Check for orphan code (exported but never imported)
    if (options.checkOrphans !== false) {
      for (const [, fileInfo] of files) {
        for (const symbol of fileInfo.symbols) {
          if (symbol.exported) {
            const importCount = this.depGraph.getImportCount(symbol.name, symbol.filePath);
            const signal = this.signalsEngine.detectOrphanCode(symbol, importCount);
            if (signal) {
              signals.push(signal);
            }
          }
        }
      }
    }

    return signals;
  }

  /**
   * Generate PR report
   */
  async generatePrReport(options: {
    base?: string;
    head?: string;
  } = {}): Promise<PrReport> {
    await this.initialize();

    // Determine base ref - fall back to HEAD if HEAD~1 doesn't exist (single commit repo)
    let baseRef = options.base;
    if (!baseRef) {
      const hasParent = await this.git.hasRef('HEAD~1');
      baseRef = hasParent ? 'HEAD~1' : 'HEAD';
    }

    const diff = await this.git.getDiff(
      baseRef,
      options.head || 'HEAD'
    );

    const impact = await this.analyzeImpact({ base: options.base, head: options.head });
    const conventions = await this.checkConventions({ base: options.base });
    const tests = await this.suggestTests({ base: options.base });

    const riskLevel = this.calculateRiskLevel(impact.riskScore);

    return {
      summary: {
        title: `PR Analysis`,
        filesChanged: diff.stats.files,
        additions: diff.stats.additions,
        deletions: diff.stats.deletions,
        authors: [],
      },
      impact,
      conventions,
      tests,
      risks: {
        level: riskLevel,
        score: impact.riskScore.overall,
        factors: impact.riskScore.factors,
        recommendations: this.generateRecommendations(impact, conventions, tests),
      },
    };
  }

  /**
   * Get diff information
   */
  async getDiff(base?: string, head?: string): Promise<GitDiff> {
    return this.git.getDiff(base || 'HEAD', head || '');
  }

  /**
   * Get staged diff
   */
  async getStagedDiff(): Promise<GitDiff> {
    return this.git.getStagedDiff();
  }

  /**
   * Check if memory exists
   */
  async hasMemory(): Promise<boolean> {
    return this.memory.hasMemory();
  }

  /**
   * Get project memory
   */
  async getMemory(): Promise<ProjectMemory | null> {
    return this.memory.loadMemory();
  }

  async queryGraph(query: string, limit: number = 10): Promise<Array<Record<string, unknown>>> {
    await this.initialize();

    const fusedResults = new Map<string, Record<string, unknown>>();
    const addResult = (key: string, result: Record<string, unknown>, rank: number, source: 'lexical' | 'semantic'): void => {
      const current = fusedResults.get(key) || { ...result, score: 0, sources: [] as string[] };
      current.score = Number(current.score) + 1 / (50 + rank + 1);
      const sources = current.sources as string[];
      if (!sources.includes(source)) {
        sources.push(source);
      }
      fusedResults.set(key, current);
    };

    try {
      const persisted = await this.graphStore.queryText(query, limit * 3);
      for (const [index, row] of persisted.entries()) {
        const normalized = {
          ...row,
          id: String(row.type === 'file' ? row.path : `${row.path}:${row.name || row.type}`),
        };
        addResult(String(normalized.id), normalized, index, 'lexical');
      }
    } catch {
      // Fall back to in-memory query if the persisted graph is unavailable.
    }

    const semanticResults = await this.semanticIndex.search(query, limit * 3);
    for (const [index, result] of semanticResults.entries()) {
      addResult(result.id, {
        type: result.type,
        id: result.id,
        path: result.path,
        name: result.name,
        kind: result.kind,
        excerpt: result.excerpt,
        lexicalScore: result.lexicalScore,
        semanticScore: result.semanticScore,
      }, index, 'semantic');
    }

    if (fusedResults.size > 0) {
      return Array.from(fusedResults.values())
        .sort((left, right) => Number(right.score) - Number(left.score))
        .slice(0, limit)
        .map((result) => ({
          ...result,
          score: Number(Number(result.score).toFixed(4)),
        }));
    }

    const q = query.trim().toLowerCase();
    const results: Array<Record<string, unknown>> = [];

    for (const [filePath, fileInfo] of this.indexer.getFiles()) {
      const fileScore = this.computeTextScore(q, [filePath, fileInfo.language]);
      if (fileScore > 0) {
        results.push({
          type: 'file',
          id: filePath,
          path: filePath,
          language: fileInfo.language,
          score: fileScore,
        });
      }

      for (const symbol of fileInfo.symbols) {
        const symbolScore = this.computeTextScore(q, [symbol.name, symbol.kind, symbol.filePath]);
        if (symbolScore > 0) {
          results.push({
            type: 'symbol',
            id: `${symbol.filePath}:${symbol.name}:${symbol.line}`,
            name: symbol.name,
            kind: symbol.kind,
            file: symbol.filePath,
            line: symbol.line,
            score: symbolScore + (symbol.exported ? 0.15 : 0),
          });
        }
      }
    }

    return results
      .sort((a, b) => Number(b.score) - Number(a.score))
      .slice(0, limit);
  }

  async semanticSearch(query: string, limit: number = 10): Promise<Array<Record<string, unknown>>> {
    await this.initialize();
    const results = await this.semanticIndex.search(query, limit);
    return results.map((result) => ({
      ...result,
      source: 'semantic-index',
    }));
  }

  async embedGraph(): Promise<Record<string, unknown>> {
    await this.initialize();
    const stats = await this.semanticIndex.build(this.indexer.getFiles());
    return {
      status: 'success',
      ...stats,
    };
  }

  async getCodeContext(options: {
    symbol?: string;
    file?: string;
    includeHistory?: boolean;
  }): Promise<Record<string, unknown>> {
    await this.initialize();

    const context: Record<string, unknown> = {};
    const files = this.indexer.getFiles();
    let targetFile: string | undefined = options.file;

    if (options.file) {
      try {
        const rows = await this.graphStore.getFileContext(options.file);
        if (rows.length > 0) {
          context.file = {
            path: options.file,
            language: rows[0].language,
            symbols: rows.map((row) => ({
              name: row.symbol,
              kind: row.kind,
              line: row.line,
            })),
            imports: (await this.graphStore.getDependencies(options.file)).map((row) => row.path),
            importedBy: (await this.graphStore.getDependents(options.file)).map((row) => row.path),
          };
        }
      } catch {
        const fileInfo = files.get(options.file);
        if (fileInfo) {
          context.file = this.buildFileContext(options.file, fileInfo);
        }
      }
    }

    if (options.symbol) {
      try {
        const rows = await this.graphStore.getSymbolContext(options.symbol);
        if (rows.length > 0) {
          const filePath = rows[0].file_path;
          context.symbol = {
            name: options.symbol,
            entityType: rows[0].entity_type,
            filePath,
            callers: rows.map((row) => row.caller).filter((value): value is string => typeof value === 'string' && value.length > 0),
            callees: rows.map((row) => row.callee).filter((value): value is string => typeof value === 'string' && value.length > 0),
            container: rows.find((row) => typeof row.class_name === 'string' && row.class_name.length > 0)?.class_name || rows.find((row) => typeof row.parent_class === 'string' && row.parent_class.length > 0)?.parent_class || null,
            baseClasses: rows.map((row) => row.base_class).filter((value): value is string => typeof value === 'string' && value.length > 0),
            implements: rows.map((row) => row.implemented_type).filter((value): value is string => typeof value === 'string' && value.length > 0),
          };
          targetFile = targetFile || (typeof filePath === 'string' ? filePath : undefined);
        } else {
          const matches = this.symbolMap.findByName(options.symbol);
          context.symbol = matches.map((match) => ({
            ...match,
            dependents: this.depGraph.getDependents(match.filePath),
            dependencies: this.depGraph.getDependencies(match.filePath),
          }));
          targetFile = targetFile || matches[0]?.filePath;
        }
      } catch {
        const matches = this.symbolMap.findByName(options.symbol);
        context.symbol = matches.map((match) => ({
          ...match,
          dependents: this.depGraph.getDependents(match.filePath),
          dependencies: this.depGraph.getDependencies(match.filePath),
        }));
        targetFile = targetFile || matches[0]?.filePath;
      }
    }

    if (options.includeHistory && targetFile) {
      try {
        context.history = await this.temporalAnalyzer.analyzeFile(targetFile);
        context.coChanges = await this.getCoChanges(targetFile, 0.2);
      } catch {
        context.history = null;
      }
    }

    return context;
  }

  async getReviewContext(options: {
    files?: string[];
    staged?: boolean;
    depth?: number;
  } = {}): Promise<Record<string, unknown>> {
    await this.initialize();

    const diff = options.staged ? await this.git.getStagedDiff() : await this.git.getDiff('HEAD', '');
    const changedFiles = (options.files && options.files.length > 0 ? options.files : diff.files.map((file) => file.path))
      .filter((file, index, all) => all.indexOf(file) === index);

    if (changedFiles.length === 0) {
      return {
        summary: 'No changed files were detected.',
        changedFiles: [],
        impactedFiles: [],
        impact: {
          changedNodes: [],
          impactedNodes: [],
          depthGroups: [],
        },
        snippets: [],
        guidance: ['Run the tool against staged or working tree changes to generate review context.'],
      };
    }

    const changeMap = new Map(diff.files.map((file) => [file.path, file]));
    const detected = await this.detectChanges({ staged: options.staged });
    const detectedFiles = Array.isArray(detected.files) ? detected.files as Array<Record<string, unknown>> : [];
    const detectedByPath = new Map<string, Record<string, unknown>>(
      detectedFiles
        .map((entry) => (typeof entry.path === 'string' ? [entry.path, entry] : null))
        .filter((entry): entry is [string, Record<string, unknown>] => Array.isArray(entry))
    );

    const depthGroups = await this.getBlastRadius(changedFiles, options.depth || 2);
    const impactedFiles = Array.from(new Set(
      depthGroups
        .filter((group) => group.depth > 0)
        .flatMap((group) => group.files)
        .filter((file) => !changedFiles.includes(file))
    ));

    const changedNodes = changedFiles.flatMap((file) => {
      const entry = detectedByPath.get(file);
      const impactedSymbols = Array.isArray(entry?.impactedSymbols) ? entry.impactedSymbols as Array<Record<string, unknown>> : [];
      return impactedSymbols.map((symbol) => ({
        file,
        ...symbol,
      }));
    });

    const impactedNodes = impactedFiles.slice(0, 12).flatMap((file) => {
      const fileInfo = this.indexer.getFiles().get(file);
      return (fileInfo?.symbols || []).slice(0, 5).map((symbol) => ({
        file,
        name: symbol.name,
        kind: symbol.kind,
        line: symbol.line,
      }));
    });

    const snippets: Array<Record<string, unknown>> = [];
    for (const file of changedFiles) {
      const diffFile = changeMap.get(file);
      if (!diffFile) {
        continue;
      }
      snippets.push(...await this.buildReviewSnippets(file, diffFile.hunks));
    }

    const guidance = await this.generateReviewGuidance(changedFiles, impactedFiles, changedNodes);

    return {
      summary: `Review ${changedFiles.length} changed file(s) with ${impactedFiles.length} impacted file(s) in the blast radius.`,
      changedFiles,
      impactedFiles,
      impact: {
        changedNodes,
        impactedNodes,
        depthGroups,
      },
      snippets: snippets.slice(0, 16),
      guidance,
    };
  }

  async detectChanges(options: { staged?: boolean } = {}): Promise<Record<string, unknown>> {
    await this.initialize();

    const diff = options.staged ? await this.git.getStagedDiff() : await this.git.getDiff('HEAD', '');
    const files = this.indexer.getFiles();

    return {
      stats: diff.stats,
      files: diff.files.map((file) => {
        const fileInfo = files.get(file.path);
        const changedLines = file.hunks.flatMap((hunk) =>
          Array.from({ length: Math.max(hunk.newLines, 1) }, (_, index) => hunk.newStart + index)
        );
        const impactedSymbols = (fileInfo?.symbols || [])
          .filter((symbol) => changedLines.length === 0 || changedLines.some((line) => Math.abs(symbol.line - line) <= 3))
          .map((symbol) => ({
            name: symbol.name,
            kind: symbol.kind,
            line: symbol.line,
          }));

        return {
          path: file.path,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          impactedSymbols,
          dependents: this.depGraph.getDependents(file.path),
        };
      }),
    };
  }

  async getDocsSection(sectionName: string): Promise<Record<string, unknown>> {
    const section = await this.docsIndex.getSection(sectionName);
    return {
      ...section,
    };
  }

  async getBlastRadius(files: string[], depth: number = 2): Promise<Array<{ depth: number; files: string[] }>> {
    await this.initialize();

    try {
      const persisted = await this.graphStore.getBlastRadius(files, depth);
      if (persisted.length > 0) {
        return persisted;
      }
    } catch {
      // Fall back to in-memory dependency traversal.
    }

    const grouped = new Map<number, Set<string>>();
    for (const file of files) {
      if (!grouped.has(0)) {
        grouped.set(0, new Set());
      }
      grouped.get(0)!.add(file);

      for (let hop = 1; hop <= depth; hop++) {
        const previous = hop === 1 ? [file] : Array.from(grouped.get(hop - 1) || []);
        for (const current of previous) {
          for (const dependent of this.depGraph.getDependents(current)) {
            if (!grouped.has(hop)) {
              grouped.set(hop, new Set());
            }
            grouped.get(hop)!.add(dependent);
          }
        }
      }
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hop, nodes]) => ({
        depth: hop,
        files: Array.from(nodes),
      }));
  }

  async executePseudoCypher(query: string): Promise<Record<string, unknown>> {
    await this.initialize();
    return {
      rows: await this.graphStore.runCypher(query),
    };
  }

  async getCoChanges(file: string, minConfidence: number = 0.3): Promise<Array<{
    file: string;
    confidence: number;
    coCommitCount: number;
  }>> {
    const coChanges = await this.git.getCoChangedFiles(file);
    return coChanges
      .filter((item) => item.coChangeRatio >= minConfidence)
      .slice(0, 20)
      .map((item) => ({
        file: item.path,
        confidence: Number(item.coChangeRatio.toFixed(2)),
        coCommitCount: item.coChangeCount,
      }));
  }

  async getVolatility(files: string[]): Promise<Array<Record<string, unknown>>> {
    await this.initialize();
    const analysis = await this.temporalAnalyzer.analyzeAll(files);

    return Array.from(analysis.files.values()).map((entry) => {
      const volatility = Number(((100 - entry.stabilityScore) / 100).toFixed(2));
      const fragility = Number(
        Math.min(1, volatility * (entry.regressionProne ? 1 : 0.5) + entry.ownershipRisk / 200).toFixed(2)
      );

      return {
        file: entry.path,
        volatility,
        fragility,
        churnRate: entry.churnRate,
        ownershipRisk: entry.ownershipRisk,
        regressionProne: entry.regressionProne,
        lastModified: entry.lastModified,
      };
    });
  }

  async getHistoryDetails(target: string): Promise<Record<string, unknown>> {
    await this.initialize();

    try {
      const rows = await this.graphStore.getHistoryForTarget(target);
      if (rows.length > 0) {
        return {
          target,
          targetType: rows[0].target_type,
          commits: rows.map((row) => ({
            sha: row.sha,
            message: row.message,
            author: row.author,
            date: row.date,
            isRevert: row.is_revert,
            revertsSha: row.reverts_sha || undefined,
            linesAdded: row.lines_added,
            linesRemoved: row.lines_removed,
          })),
        };
      }
    } catch {
      // Fall back to direct git history below.
    }

    const fileHistory = await this.git.getFileHistory(target, 50);
    return {
      target,
      targetType: 'file',
      commits: fileHistory.commits.map((commit) => ({
        sha: commit.hash,
        message: commit.message,
        author: commit.author,
        date: commit.date.toISOString(),
      })),
      authors: fileHistory.authors,
      changeFrequency: fileHistory.changeFrequency,
      lastModified: fileHistory.lastModified.toISOString(),
    };
  }

  async getGraphStats(): Promise<Record<string, unknown>> {
    await this.initialize();

    const status = await this.getRepoStatus();
    const graphStats = await this.graphStore.getStats();
    const semanticStats = this.semanticIndex.getStats();

    return {
      repo: {
        name: status.repoName,
        analyzed: status.analyzed,
        stale: status.isStale,
        lastAnalyzedAt: status.lastAnalyzedAt,
        lastUpdatedAt: status.lastUpdatedAt,
      },
      index: status.stats || this.indexer.getStats(),
      graph: graphStats,
      semantic: semanticStats,
      sessionsRecorded: status.sessionsRecorded,
    };
  }

  async planTask(task: string): Promise<PlanStep[]> {
    const sessions = await this.sessionStore.getSessions();
    const learned = this.planner.buildPlan(task, sessions);
    if (learned.length > 0) {
      return learned;
    }

    const fallback = await this.queryGraph(task, 6);
    return fallback.map((item, index) => ({
      file: String(item.type === 'file' ? item.path : item.file),
      confidence: Number(Math.max(0.2, 1 - index * 0.12).toFixed(2)),
      reason: 'Fallback from structural search because no successful historical sessions matched the task.',
    }));
  }

  async locateIntent(intent: string): Promise<IntentLocation[]> {
    const sessions = await this.sessionStore.getSessions();
    const learned = this.intentMapper.locate(intent, sessions);
    if (learned.length > 0) {
      return learned;
    }

    const fallback = await this.queryGraph(intent, 8);
    return fallback.map((item, index) => ({
      file: String(item.type === 'file' ? item.path : item.file),
      confidence: Number(Math.max(0.15, 0.9 - index * 0.1).toFixed(2)),
      reason: 'Fallback from indexed filenames and symbol names.',
    }));
  }

  async beginLearningSession(taskDescription: string = 'MCP session'): Promise<SessionRecord> {
    const headStart = await this.git.getHeadCommit();
    this.currentSessionHead = headStart;
    return this.sessionStore.startSession(taskDescription, headStart);
  }

  async recordToolActivity(name: string, params: Record<string, unknown>, filesRead: string[] = [], filesEdited: string[] = []): Promise<void> {
    await this.sessionStore.addToolCall({
      tool: name,
      paramsSummary: JSON.stringify(params),
      filesRead,
      filesEdited,
    });
  }

  async finalizeLearningSession(): Promise<SessionRecord | null> {
    const headEnd = await this.git.getHeadCommit();
    const commitMessage = headEnd ? await this.git.getCommitMessage(headEnd) : undefined;
    const outcome: SessionRecord['outcome'] =
      headEnd && this.currentSessionHead && headEnd !== this.currentSessionHead && commitMessage?.toLowerCase().startsWith('revert')
        ? 'failure'
        : headEnd && this.currentSessionHead && headEnd !== this.currentSessionHead
          ? 'success'
          : 'abandoned';

    const changedFiles = await this.git.getChangedFiles();
    this.currentSessionHead = undefined;
    return this.sessionStore.finalizeSession({
      outcome,
      headEnd,
      filesEdited: changedFiles.map((file) => ({
        path: file,
        linesChanged: 1,
      })),
    });
  }

  private calculateRiskLevel(riskScore: RiskScore): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore.overall >= 80) return 'critical';
    if (riskScore.overall >= 60) return 'high';
    if (riskScore.overall >= 30) return 'medium';
    return 'low';
  }

  private generateRecommendations(
    impact: ImpactResult,
    conventions: ConventionViolation[],
    tests: TestSuggestion[]
  ): string[] {
    const recommendations: string[] = [];

    if (impact.publicApiChanges.some(c => c.changeType === 'breaking')) {
      recommendations.push('This PR contains breaking API changes. Consider adding deprecation warnings first.');
    }

    if (impact.boundaryViolations.length > 0) {
      recommendations.push('Architectural boundary violations detected. Review module dependencies.');
    }

    if (conventions.length > 5) {
      recommendations.push('Multiple convention violations found. Consider running the formatter/linter.');
    }

    if (tests.filter(t => t.priority === 'high').length > 0) {
      recommendations.push('New code requires tests. Add unit tests for exported functions and classes.');
    }

    if (impact.affectedModules.length > 10) {
      recommendations.push('This change affects many modules. Consider splitting into smaller PRs.');
    }

    return recommendations;
  }

  // ============================================
  // NEW: Visualization Methods
  // ============================================

  /**
   * Get simple graph data for visualization
   */
  async getSimpleGraphData(file?: string): Promise<any> {
    await this.initialize();
    
    const files = this.indexer.getFiles();
    const edges: Array<{ from: string; to: string }> = [];
    
    for (const [filePath, fileInfo] of files) {
      for (const imp of fileInfo.imports || []) {
        edges.push({ from: filePath, to: imp.source });
      }
    }

    if (file) {
      // Filter to show only connected nodes
      const connected = new Set<string>();
      connected.add(file);
      for (const edge of edges) {
        if (edge.from === file || edge.to === file) {
          connected.add(edge.from);
          connected.add(edge.to);
        }
      }
      return {
        nodes: Array.from(connected).map(f => ({ id: f, label: f.split('/').pop() })),
        edges: edges.filter(e => connected.has(e.from) && connected.has(e.to)),
      };
    }

    return {
      nodes: Array.from(files.keys()).map(f => ({ id: f, label: f.split('/').pop() })),
      edges,
    };
  }

  // ============================================
  // NEW: Complexity Analysis Methods
  // ============================================

  /**
   * Analyze code complexity
   */
  async analyzeComplexity(path?: string, options: {
    threshold?: number;
    includeSymbols?: boolean;
  } = {}): Promise<any> {
    await this.initialize();

    const files = this.indexer.getFiles();
    const results: any[] = [];

    for (const [filePath, fileInfo] of files) {
      if (path && !filePath.includes(path)) continue;

      // Simple complexity calculation based on file info
      const complexity = {
        cyclomatic: Math.max(1, fileInfo.symbols.length),
        cognitive: fileInfo.symbols.filter(s => s.kind === 'function' || s.kind === 'method').length * 2,
        coupling: fileInfo.imports.length,
        maintainability: Math.max(0, 100 - fileInfo.lines / 10 - fileInfo.symbols.length),
        linesOfCode: fileInfo.lines,
        symbols: options.includeSymbols ? fileInfo.symbols.map(s => ({
          name: s.name,
          type: s.kind,
          complexity: 1,
          lines: 1,
        })) : undefined,
      };

      if (!options.threshold || complexity.maintainability <= options.threshold) {
        results.push({
          file: filePath,
          metrics: complexity,
          symbols: complexity.symbols,
        });
      }
    }

    // Calculate summary
    const avgMaintainability = results.length > 0
      ? results.reduce((sum, r) => sum + (r.metrics.maintainability || 0), 0) / results.length
      : 100;

    return {
      files: results,
      summary: {
        totalFiles: results.length,
        averageMaintainability: avgMaintainability,
        filesNeedingAttention: results.filter(r => r.metrics.maintainability < 60).length,
        criticalFiles: results.filter(r => r.metrics.maintainability < 40).length,
      },
      recommendations: this.generateComplexityRecommendations(results),
    };
  }

  private generateComplexityRecommendations(results: any[]): string[] {
    const recs: string[] = [];
    const critical = results.filter(r => r.metrics.maintainability < 40);
    
    if (critical.length > 0) {
      recs.push(`${critical.length} files have critical complexity. Consider refactoring.`);
    }
    
    const highCyclomatic = results.filter(r => r.metrics.cyclomatic > 20);
    if (highCyclomatic.length > 0) {
      recs.push('Some files have high cyclomatic complexity. Extract helper functions.');
    }
    
    const highCoupling = results.filter(r => r.metrics.coupling > 15);
    if (highCoupling.length > 0) {
      recs.push('High coupling detected. Consider dependency injection or facades.');
    }

    return recs;
  }

  // ============================================
  // NEW: Temporal Analysis Methods
  // ============================================

  /**
   * Analyze git history patterns
   */
  async analyzeHistory(options: {
    file?: string;
    since?: string;
    includeChurn?: boolean;
    includeOwnership?: boolean;
    includeCoupling?: boolean;
    includeRegressionRisk?: boolean;
  } = {}): Promise<any> {
    await this.initialize();
    
    const files = this.indexer.getFiles();
    const filePaths = options.file 
      ? [options.file] 
      : Array.from(files.keys()).slice(0, 50); // Limit for performance
    
    // Analyze temporal patterns
    const analysis = await this.temporalAnalyzer.analyzeAll(filePaths);
    
    return {
      files: Object.fromEntries(analysis.files),
      hotspots: analysis.hotspots,
      riskFiles: analysis.riskFiles,
      staleFiles: analysis.staleFiles,
      coChangeClusters: analysis.coChangeClusters,
      summary: {
        filesAnalyzed: analysis.files.size,
        hotspotCount: analysis.hotspots.length,
        riskFileCount: analysis.riskFiles.length,
        staleFileCount: analysis.staleFiles.length,
      },
    };
  }

  // ============================================
  // NEW: Cognitive Load Mapping Methods
  // ============================================

  /**
   * Compute holistic cognitive load scoring with implicit coupling and onboarding difficulty.
   */
  async getCognitiveLoadMap(options: {
    path?: string;
    limit?: number;
    maxTemporalFiles?: number;
  } = {}): Promise<CognitiveLoadMapResult> {
    await this.initialize();

    const files = this.indexer.getFiles();
    const selectedEntries = Array.from(files.entries())
      .filter(([filePath]) => !options.path || filePath.includes(options.path));
    const selectedFiles = new Map(selectedEntries);

    const contents = new Map<string, string>();
    const dependencyInfo = new Map<string, { imports: number; importedBy: number }>();
    const directDependencies = new Map<string, Set<string>>();

    for (const [filePath] of selectedEntries) {
      try {
        const absolutePath = path.join(this.repoRoot, filePath);
        const content = await fs.readFile(absolutePath, 'utf-8');
        contents.set(filePath, content);
      } catch {
        contents.set(filePath, '');
      }

      const node = this.depGraph.getNodes().get(filePath);
      if (node) {
        dependencyInfo.set(filePath, {
          imports: node.imports.length,
          importedBy: node.importedBy.length,
        });
        directDependencies.set(filePath, new Set(node.imports));
      } else {
        directDependencies.set(filePath, new Set());
      }
    }

    const { ComplexityEngine } = await import('../modules/complexity-engine.js');
    const complexityEngine = new ComplexityEngine();
    const complexity = complexityEngine.analyzeAll(selectedFiles, contents, dependencyInfo);

    const complexityRisk = new Map(
      Array.from(complexity.entries()).map(([filePath, entry]) => [filePath, 100 - (entry.score?.overall || 50)])
    );

    const temporalCandidates = [...selectedEntries]
      .sort((left, right) => right[1].lines - left[1].lines)
      .slice(0, Math.max(1, options.maxTemporalFiles || 120))
      .map(([filePath]) => filePath);
    const temporalAnalysis = await this.temporalAnalyzer.analyzeAll(temporalCandidates, complexityRisk);

    const namingViolationsByFile = new Map<string, number>();
    const violations = this.conventionChecker.checkAll(selectedFiles);
    for (const violation of violations) {
      if (violation.convention.category !== 'naming' && !violation.convention.id.includes('naming')) {
        continue;
      }
      namingViolationsByFile.set(
        violation.filePath,
        (namingViolationsByFile.get(violation.filePath) || 0) + 1
      );
    }

    const semanticDispersionByFile = await this.getSemanticDispersionScores(selectedEntries.map(([filePath]) => filePath));

    const result = this.cognitiveLoadAnalyzer.analyze({
      files: selectedFiles,
      complexity,
      temporal: temporalAnalysis.files,
      namingViolationsByFile,
      coChangeClusters: temporalAnalysis.coChangeClusters,
      semanticDispersionByFile,
      directDependencies,
    });

    if (!options.limit || options.limit <= 0) {
      return result;
    }

    const allowed = new Set(result.files.slice(0, options.limit).map((entry) => entry.path));
    const filteredFiles = result.files.filter((entry) => allowed.has(entry.path));
    const filteredModules = result.modules
      .filter((module) => module.topRiskFiles.some((filePath) => allowed.has(filePath)));
    const filteredFunctions = result.functions.filter((entry) => allowed.has(entry.path));
    const filteredCoupling = result.implicitCoupling
      .filter((entry) => allowed.has(entry.from) || allowed.has(entry.to));
    const filteredDocsGaps = result.documentationGaps.filter((entry) => allowed.has(entry.path));
    const filteredOnboarding = result.onboardingDifficulty.filter((entry) => allowed.has(entry.path));

    return {
      ...result,
      files: filteredFiles,
      modules: filteredModules,
      functions: filteredFunctions,
      implicitCoupling: filteredCoupling,
      documentationGaps: filteredDocsGaps,
      onboardingDifficulty: filteredOnboarding,
      summary: {
        filesAnalyzed: filteredFiles.length,
        modulesAnalyzed: filteredModules.length,
        averageScore: filteredFiles.length > 0
          ? Number((filteredFiles.reduce((sum, file) => sum + file.score, 0) / filteredFiles.length).toFixed(1))
          : 0,
        highLoadFiles: filteredFiles.filter((file) => file.score >= 70).length,
        topFiles: filteredFiles.slice(0, 5).map((entry) => entry.path),
        topModules: filteredModules.slice(0, 5).map((entry) => entry.module),
      },
    };
  }

  private async getSemanticDispersionScores(filePaths: string[]): Promise<Map<string, number>> {
    const dispersion = new Map<string, number>();
    const maxFiles = 180;

    for (const filePath of filePaths) {
      dispersion.set(filePath, 0);
    }

    for (const filePath of filePaths.slice(0, maxFiles)) {
      const basename = path.posix.basename(filePath, path.posix.extname(filePath)).replace(/[-_]/g, ' ').trim();
      if (!basename) {
        continue;
      }

      try {
        const hits = await this.semanticIndex.search(basename, 6);
        if (hits.length === 0) {
          continue;
        }

        const uniqueRoots = new Set(
          hits.map((hit) => {
            const root = hit.path.split('/').filter(Boolean)[0];
            return root || '.';
          })
        );
        const selfHits = hits.filter((hit) => hit.path === filePath).length;
        const crossHitsRatio = Math.max(0, hits.length - selfHits) / Math.max(1, hits.length);
        const rootSpread = Math.max(0, uniqueRoots.size - 1) / Math.max(1, uniqueRoots.size);
        const score = Math.max(0, Math.min(1, rootSpread * 0.7 + crossHitsRatio * 0.3));
        dispersion.set(filePath, Number(score.toFixed(3)));
      } catch {
        // Keep default score when semantic index cannot answer this query.
      }
    }

    return dispersion;
  }

  // ============================================
  // NEW: Invariant Checking Methods
  // ============================================

  /**
   * Check architectural invariants
   */
  async checkInvariants(_options: {
    configFile?: string;
    fix?: boolean;
  } = {}): Promise<any> {
    await this.initialize();
    
    // Load invariants from file
    await this.invariantEngine.loadFromFile();
    
    const files = this.indexer.getFiles();
    const result = await this.invariantEngine.check(files);
    
    return {
      passed: result.passed,
      rulesChecked: result.checkedRules,
      passedRules: result.passedRules,
      filesScanned: files.size,
      violations: result.violations.map((v) => ({
        rule: v.rule.id,
        severity: v.rule.severity,
        file: v.filePath,
        line: v.line,
        message: v.message,
        suggestion: v.suggestion,
      })),
    };
  }

  /**
   * Analyze architectural drift against declared project memory.
   */
  async analyzeDrift(options: {
    commits?: number;
  } = {}): Promise<any> {
    await this.initialize();

    const commitsWindow = Math.max(1, Math.min(200, options.commits || 20));
    const files = this.indexer.getFiles();
    const projectMemory = await this.memory.loadMemory();
    const architecture = projectMemory?.architecture || {
      layers: [],
      boundaries: [],
      entryPoints: [],
      criticalPaths: [],
    };

    const localInvariantEngine = new InvariantEngine(this.repoRoot);
    if (projectMemory?.invariants) {
      localInvariantEngine.loadFromMemory(projectMemory.invariants);
    }
    await localInvariantEngine.loadFromFile();
    const invariantResult = await localInvariantEngine.check(files);

    const conventionViolations = this.conventionChecker.checkAll(files);

    const signals: DriftSignal[] = [
      ...invariantResult.violations.map((violation) => ({
        category: this.mapInvariantToDriftCategory(violation.rule.type),
        severity: this.mapInvariantSeverity(violation.rule.severity),
        filePath: violation.filePath,
        source: `invariant:${violation.rule.id}`,
        message: violation.message,
      })),
      ...conventionViolations.map((violation) => ({
        category: this.mapConventionToDriftCategory(violation),
        severity: this.mapConventionSeverity(violation.convention.severity),
        filePath: violation.filePath,
        source: `convention:${violation.convention.id}`,
        message: violation.message,
      })),
    ];

    let recentCommits: CommitRecord[] = [];
    if (await this.git.isGitRepo()) {
      recentCommits = (await this.git.getRecentCommits(commitsWindow)).slice(0, commitsWindow);
    }

    return this.driftRadar.analyze({
      files,
      architecture,
      dependencyNodes: this.depGraph.getNodes(),
      signals,
      recentCommits,
      commitsWindow,
      declaredNamingConventions: projectMemory?.conventions?.naming || [],
    });
  }

  // ============================================
  // NEW: Hot Path Detection Methods
  // ============================================

  /**
   * Analyze hot paths in the codebase
   */
  async analyzeHotPaths(_options: {
    entryPoints?: string[];
    autoDetect?: boolean;
    trace?: string;
    impactFile?: string;
  } = {}): Promise<any> {
    await this.initialize();
    
    const files = this.indexer.getFiles();
    const deps = this.depGraph.getNodes();
    
    // Detect hot paths using the dependency graph
    const hotPaths = this.hotPathDetector.detectPaths(files, deps);
    
    return {
      paths: hotPaths,
      summary: {
        totalPaths: hotPaths.length,
        criticalPaths: hotPaths.filter((p) => p.criticality === 'critical').length,
        highPaths: hotPaths.filter((p) => p.criticality === 'high').length,
        mediumPaths: hotPaths.filter((p) => p.criticality === 'medium').length,
      },
    };
  }

  // ============================================
  // NEW: Changelog Generation Methods
  // ============================================

  /**
   * Get the latest git tag
   */
  async getLatestTag(): Promise<string | null> {
    try {
      // Use simple-git to get tags
      const git = await import('simple-git').then(m => m.simpleGit(this.repoRoot));
      const tags = await git.tags();
      return tags.all[tags.all.length - 1] || null;
    } catch {
      return null;
    }
  }

  /**
   * Generate changelog from git history
   */
  async generateChangelog(options: {
    from: string;
    to?: string;
    includeApiChanges?: boolean;
    includeBreaking?: boolean;
    groupBy?: string;
  }): Promise<any> {
    await this.initialize();
    
    const changelogOptions = {
      from: options.from,
      to: options.to || 'HEAD',
      includeInternal: false,
      groupBy: (options.groupBy as 'type' | 'scope' | 'author') || 'type',
    };
    
    return this.changelogGenerator.generate(changelogOptions);
  }

  // ============================================
  // NEW: Monorepo Analysis Methods
  // ============================================

  /**
   * Analyze monorepo structure
   */
  async analyzeMonorepo(options: {
    scope?: string[];
    includeGraph?: boolean;
    includeShared?: boolean;
    includeCycles?: boolean;
    impactPackage?: string;
  } = {}): Promise<any> {
    // Detect monorepo type
    const detection = await this.monorepoDetector.detect();
    
    // Check if this is a monorepo
    if (detection.type === 'single') {
      return {
        type: null,
        root: this.repoRoot,
        packages: [],
        dependencies: {},
        dependents: {},
        summary: { internalDeps: 0, sharedDeps: 0 },
      };
    }

    // Initialize monorepo analyzer if not already done
    if (!this.monorepoAnalyzer) {
      this.monorepoAnalyzer = new MonorepoAnalyzer(detection);
    }

    const analysis = await this.monorepoAnalyzer.analyze();
    
    return {
      type: detection.type,
      root: this.repoRoot,
      packages: detection.packages,
      dependencies: analysis.crossPackageDependencies.reduce((acc: Record<string, string[]>, edge) => {
        if (!acc[edge.from]) acc[edge.from] = [];
        acc[edge.from].push(edge.to);
        return acc;
      }, {}),
      dependents: analysis.crossPackageDependencies.reduce((acc: Record<string, string[]>, edge) => {
        if (!acc[edge.to]) acc[edge.to] = [];
        acc[edge.to].push(edge.from);
        return acc;
      }, {}),
      sharedDeps: options.includeShared ? analysis.sharedDependencies : undefined,
      cycles: options.includeCycles ? this.detectPackageCycles(analysis.crossPackageDependencies) : undefined,
      summary: {
        internalDeps: analysis.crossPackageDependencies.length,
        sharedDeps: analysis.sharedDependencies.length,
      },
    };
  }

  private detectPackageCycles(edges: Array<{ from: string; to: string }>): string[][] {
    // Simple cycle detection
    const graph = new Map<string, string[]>();
    for (const edge of edges) {
      if (!graph.has(edge.from)) graph.set(edge.from, []);
      graph.get(edge.from)!.push(edge.to);
    }
    
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const path: string[] = [];
    
    const dfs = (node: string) => {
      if (path.includes(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart));
        return;
      }
      if (visited.has(node)) return;
      
      visited.add(node);
      path.push(node);
      
      for (const neighbor of graph.get(node) || []) {
        dfs(neighbor);
      }
      
      path.pop();
    };
    
    for (const node of graph.keys()) {
      dfs(node);
    }
    
    return cycles;
  }

  // ============================================
  // NEW: Smart Test Prioritization Methods
  // ============================================

  /**
   * Get prioritized test list based on changes
   */
  async getPrioritizedTests(options: {
    base?: string;
    staged?: boolean;
    limit?: number;
  } = {}): Promise<any> {
    await this.initialize();

    let diff: GitDiff;
    if (options.staged) {
      diff = await this.git.getStagedDiff();
    } else {
      diff = await this.git.getDiff(options.base || 'HEAD');
    }

    const files = this.indexer.getFiles();
    const impact = await this.impactAnalyzer.analyze(diff, files, new Map());
    
    return this.testPrioritizer.prioritize(diff, files, impact);
  }

  /**
   * Build a simulation-only refactor migration plan.
   */
  async planRefactor(options: RefactorPlanRequest): Promise<RefactorPlanResult> {
    await this.initialize();

    const files = this.indexer.getFiles();
    const rootCandidates = this.resolveRefactorSeedFiles(options, files);
    if (rootCandidates.length === 0) {
      throw new Error('No refactor target resolved from file/targetSymbol inputs.');
    }

    const maxDepth = options.depth ?? 6;
    const neighborhood = this.expandRefactorNeighborhood(rootCandidates, maxDepth);
    const fileContents = await this.readExistingFileContents(Array.from(neighborhood));

    const complexity = await this.buildNeighborhoodComplexity(files, neighborhood, fileContents);
    const coChangeClusters = await this.buildNeighborhoodCoChangeClusters(neighborhood);

    const planner = new RefactorCartographer(
      this.depGraph,
      this.symbolMap,
      new ImpactAnalyzer(this.depGraph),
      this.testPrioritizer
    );

    return planner.plan(options, {
      files,
      fileContents,
      complexity,
      coChangeClusters,
      maxDepth,
    });
  }

  // ============================================
  // Dashboard Support Methods
  // ============================================

  /**
   * Get indexed repository statistics
   */
  getStats(): { files: number; symbols: number; exports: number; avgFanOut: number } {
    return this.indexer.getStats();
  }

  /**
   * Get all indexed files
   */
  getFiles(): Map<string, import('../core/types.js').FileInfo> {
    return this.indexer.getFiles();
  }

  /**
   * Get signals with filtering options
   */
  async getSignals(options: {
    include?: string[];
  } = {}): Promise<Signal[]> {
    await this.initialize();
    return this.analyzeSignals({
      checkOrphans: !options.include || options.include.includes('all') || options.include.includes('orphan-code'),
      checkGodClasses: !options.include || options.include.includes('all') || options.include.includes('god-class'),
      checkCycles: !options.include || options.include.includes('all') || options.include.includes('circular-dependency'),
    });
  }

  /**
   * Get complexity data for all files
   */
  async getComplexity(options: { path?: string }): Promise<Map<string, import('../modules/complexity-engine.js').FileComplexity>> {
    await this.initialize();
    
    const { ComplexityEngine } = await import('../modules/complexity-engine.js');
    const complexityEngine = new ComplexityEngine();
    
    const files = this.indexer.getFiles();
    const contents = new Map<string, string>();
    const dependencyInfo = new Map<string, { imports: number; importedBy: number }>();
    
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    
    for (const [filePath] of files) {
      if (options.path && !filePath.includes(options.path)) continue;
      
      try {
        const absolutePath = path.join(this.repoRoot, filePath);
        const content = await fs.readFile(absolutePath, 'utf-8');
        contents.set(filePath, content);
        
        // Get dependency info from graph
        const node = this.depGraph.getNodes().get(filePath);
        if (node) {
          dependencyInfo.set(filePath, {
            imports: node.imports.length,
            importedBy: node.importedBy.length,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }
    
    return complexityEngine.analyzeAll(files, contents, dependencyInfo);
  }

  private resolveRefactorSeedFiles(
    options: RefactorPlanRequest,
    files: Map<string, FileInfo>
  ): string[] {
    const seeds = new Set<string>();

    if (typeof options.file === 'string' && options.file.length > 0) {
      seeds.add(options.file);
    }
    if (typeof options.destinationFile === 'string' && options.destinationFile.length > 0) {
      seeds.add(options.destinationFile);
    }

    if (typeof options.targetSymbol === 'string' && options.targetSymbol.length > 0) {
      const symbolMatches = this.symbolMap.findByName(options.targetSymbol);
      for (const symbol of symbolMatches) {
        if (!options.file || symbol.filePath === options.file) {
          seeds.add(symbol.filePath);
        }
      }
    }

    return Array.from(seeds).filter((file) => files.has(file));
  }

  private expandRefactorNeighborhood(seedFiles: string[], maxDepth: number): Set<string> {
    const neighborhood = new Set(seedFiles);
    const queue: Array<{ file: string; depth: number }> = seedFiles.map((file) => ({ file, depth: 0 }));

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) {
        continue;
      }

      for (const dependent of this.depGraph.getDependents(current.file)) {
        if (neighborhood.has(dependent)) {
          continue;
        }
        neighborhood.add(dependent);
        queue.push({ file: dependent, depth: current.depth + 1 });
      }

      for (const dependency of this.depGraph.getDependencies(current.file)) {
        if (neighborhood.has(dependency)) {
          continue;
        }
        neighborhood.add(dependency);
        queue.push({ file: dependency, depth: current.depth + 1 });
      }
    }

    return neighborhood;
  }

  private async readExistingFileContents(paths: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const filePath of paths) {
      try {
        const content = await fs.readFile(path.join(this.repoRoot, filePath), 'utf-8');
        result.set(filePath, content);
      } catch {
        // Missing files are valid during simulation (e.g., destination files not yet created).
      }
    }
    return result;
  }

  private async buildNeighborhoodComplexity(
    files: Map<string, FileInfo>,
    neighborhood: Set<string>,
    fileContents: Map<string, string>
  ): Promise<Map<string, import('../modules/complexity-engine.js').FileComplexity>> {
    const { ComplexityEngine } = await import('../modules/complexity-engine.js');
    const complexityEngine = new ComplexityEngine();

    const scopedFiles = new Map<string, FileInfo>();
    const dependencyInfo = new Map<string, { imports: number; importedBy: number }>();
    for (const [filePath, fileInfo] of files) {
      if (!neighborhood.has(filePath)) {
        continue;
      }
      scopedFiles.set(filePath, fileInfo);
      const node = this.depGraph.getNodes().get(filePath);
      if (node) {
        dependencyInfo.set(filePath, {
          imports: node.imports.length,
          importedBy: node.importedBy.length,
        });
      }
    }

    return complexityEngine.analyzeAll(scopedFiles, fileContents, dependencyInfo);
  }

  private async buildNeighborhoodCoChangeClusters(neighborhood: Set<string>): Promise<import('../modules/temporal-analyzer.js').FileCoChange[][] | undefined> {
    const files = Array.from(neighborhood).slice(0, 120);
    if (files.length === 0) {
      return undefined;
    }

    try {
      return await this.temporalAnalyzer.findCoChangeClusters(files);
    } catch {
      return undefined;
    }
  }

  /**
   * Get graph data for visualization (extended version)
   */
  async getGraphData(options: {
    depth?: number;
    focus?: string;
  } = {}): Promise<{ nodes: import('../core/types.js').DependencyNode[]; edges: import('../core/types.js').DependencyEdge[] }> {
    await this.initialize();
    
    const graphObj = this.depGraph.toObject();
    
    if (options.focus) {
      // Filter to show only nodes within depth of focus node
      const maxDepth = options.depth || 3;
      const focusNode = graphObj.nodes.find(n => n.path === options.focus || n.path.endsWith(options.focus!));
      
      if (focusNode) {
        const connectedPaths = new Set<string>([focusNode.path]);
        
        // BFS to find connected nodes up to depth
        const queue: Array<{ path: string; depth: number }> = [{ path: focusNode.path, depth: 0 }];
        const visited = new Set<string>();
        
        while (queue.length > 0) {
          const current = queue.shift()!;
          if (visited.has(current.path) || current.depth > maxDepth) continue;
          visited.add(current.path);
          
          const node = graphObj.nodes.find(n => n.path === current.path);
          if (node) {
            for (const imp of node.imports) {
              connectedPaths.add(imp);
              queue.push({ path: imp, depth: current.depth + 1 });
            }
            for (const by of node.importedBy) {
              connectedPaths.add(by);
              queue.push({ path: by, depth: current.depth + 1 });
            }
          }
        }
        
        return {
          nodes: graphObj.nodes.filter(n => connectedPaths.has(n.path)),
          edges: graphObj.edges.filter(e => connectedPaths.has(e.from) && connectedPaths.has(e.to)),
        };
      }
    }
    
    return graphObj;
  }

  /**
   * Get hot paths analysis
   */
  async getHotPaths(): Promise<{
    paths: Array<{ path: string[]; risk: string; category?: string }>;
    entryPoints: string[];
  }> {
    const result = await this.analyzeHotPaths({ autoDetect: true });
    
    return {
      paths: result.paths.map((p: any) => ({
        path: p.nodes || p.path || [],
        risk: p.criticality || 'medium',
        category: p.category,
      })),
      entryPoints: result.paths
        .filter((p: any) => p.nodes?.[0] || p.path?.[0])
        .map((p: any) => p.nodes?.[0] || p.path?.[0])
        .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i),
    };
  }

  /**
   * Get temporal analysis data
   */
  async getTemporal(): Promise<{
    hotspots: Array<{ file: string; churn: number }>;
    ownership: Record<string, string[]>;
    churnRates: Array<{ file: string; rate: number }>;
    avgStability: number;
    busFactor: number;
    activeContributors: number;
  }> {
    const result = await this.analyzeHistory({
      includeChurn: true,
      includeOwnership: true,
    });
    
    return {
      hotspots: result.hotspots || [],
      ownership: result.files ? Object.fromEntries(
        Object.entries(result.files).map(([file, data]: [string, any]) => [file, data.authors || []])
      ) : {},
      churnRates: result.hotspots?.map((h: any) => ({ file: h.file, rate: h.churn })) || [],
      avgStability: result.summary?.avgStability || 0,
      busFactor: result.summary?.busFactor || 0,
      activeContributors: result.summary?.activeContributors || 0,
    };
  }

  private mapInvariantToDriftCategory(
    type: string
  ): 'boundary' | 'naming' | 'structural' | 'dependency' {
    if (type === 'layer-boundary' || type === 'no-import' || type === 'require-import') {
      return 'boundary';
    }
    if (type === 'naming-pattern') {
      return 'naming';
    }
    if (type === 'max-dependencies') {
      return 'dependency';
    }
    return 'structural';
  }

  private mapInvariantSeverity(
    severity: 'critical' | 'high' | 'medium'
  ): 'critical' | 'high' | 'medium' | 'low' {
    return severity;
  }

  private mapConventionToDriftCategory(
    violation: ConventionViolation
  ): 'boundary' | 'naming' | 'structural' | 'dependency' {
    if (violation.convention.category === 'naming' || violation.convention.id.includes('naming')) {
      return 'naming';
    }
    if (violation.convention.category === 'architecture') {
      return 'boundary';
    }
    if (violation.convention.category === 'imports') {
      return 'dependency';
    }
    return 'structural';
  }

  private mapConventionSeverity(
    severity: 'error' | 'warning' | 'info'
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (severity === 'error') return 'high';
    if (severity === 'warning') return 'medium';
    return 'low';
  }

  private buildFileContext(filePath: string, fileInfo: FileInfo): Record<string, unknown> {
    return {
      path: filePath,
      language: fileInfo.language,
      symbols: fileInfo.symbols.map((symbol) => ({
        name: symbol.name,
        kind: symbol.kind,
        line: symbol.line,
      })),
      imports: this.depGraph.getDependencies(filePath),
      importedBy: this.depGraph.getDependents(filePath),
      exports: fileInfo.exports,
    };
  }

  private async buildReviewSnippets(
    filePath: string,
    hunks: Array<{ newStart: number; newLines: number; content: string }>
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const content = await fs.readFile(path.join(this.repoRoot, filePath), 'utf-8');
      const lines = content.split(/\r?\n/);
      return hunks.slice(0, 4).map((hunk) => {
        const startLine = Math.max(1, hunk.newStart - 2);
        const endLine = Math.min(lines.length, hunk.newStart + Math.max(hunk.newLines, 1) + 2);
        return {
          file: filePath,
          startLine,
          endLine,
          language: this.resolveLanguageForFile(filePath),
          content: lines.slice(startLine - 1, endLine).join('\n'),
          reason: 'Changed hunk',
        };
      });
    } catch {
      return hunks.slice(0, 4).map((hunk) => ({
        file: filePath,
        startLine: hunk.newStart,
        endLine: hunk.newStart + Math.max(hunk.newLines, 1) - 1,
        language: this.resolveLanguageForFile(filePath),
        content: hunk.content,
        reason: 'Changed hunk',
      }));
    }
  }

  private async generateReviewGuidance(
    changedFiles: string[],
    impactedFiles: string[],
    changedNodes: Array<Record<string, unknown>>
  ): Promise<string[]> {
    const guidance: string[] = [];

    if (impactedFiles.length > 5) {
      guidance.push(`Wide blast radius: ${impactedFiles.length} additional files depend on the changed surface.`);
    }

    const changedFileSet = new Set(changedFiles);
    const testFiles = changedFiles.filter((file) => /(?:^|\/)(?:__tests__|tests?)\/|(?:test|spec)\./i.test(file));
    if (testFiles.length === 0) {
      const changedSymbols = changedNodes
        .map((node) => (typeof node.name === 'string' ? node.name : ''))
        .filter((name) => name.length > 0);

      let discoveredTests = 0;
      for (const symbolName of changedSymbols.slice(0, 8)) {
        try {
          const tests = await this.graphStore.getTestsForSymbol(symbolName);
          discoveredTests += tests.length;
        } catch {
          // Ignore graph lookup failures and keep heuristic guidance.
        }
      }

      if (discoveredTests === 0) {
        guidance.push('No test coverage was detected around the changed symbols. Verify impacted behavior manually or add focused tests.');
      }
    }

    const exportedChanges = changedFiles.flatMap((file) => {
      const fileInfo = this.indexer.getFiles().get(file);
      return (fileInfo?.symbols || []).filter((symbol) => symbol.exported);
    });
    if (exportedChanges.length > 0) {
      guidance.push(`Public surface changed in ${new Set(exportedChanges.map((symbol) => symbol.filePath)).size} file(s). Check downstream callers and release notes.`);
    }

    const inheritanceChanges = changedFiles.flatMap((file) => {
      const fileInfo = this.indexer.getFiles().get(file);
      return (fileInfo?.symbols || []).filter((symbol) =>
        (symbol.kind === 'class') && (((symbol.extendsSymbols || []).length > 0) || ((symbol.implementsSymbols || []).length > 0))
      );
    });
    if (inheritanceChanges.length > 0) {
      guidance.push('Inheritance or interface contracts are involved. Validate subclasses, implementations, and dispatch behavior.');
    }

    const crossBoundaryImpact = impactedFiles.filter((file) => !changedFileSet.has(file));
    if (crossBoundaryImpact.length > 0 && guidance.length === 0) {
      guidance.push('Review direct dependents first; the graph shows downstream files affected even when their source did not change.');
    }

    if (guidance.length === 0) {
      guidance.push('Blast radius is narrow. Focus review on the changed hunks and their immediate callers.');
    }

    return guidance;
  }

  private computeTextScore(query: string, fields: string[]): number {
    const haystack = fields.join(' ').toLowerCase();
    if (!query || !haystack) {
      return 0;
    }

    if (haystack === query) {
      return 1;
    }

    if (haystack.includes(query)) {
      return 0.8;
    }

    const queryTokens = query.split(/\s+/).filter(Boolean);
    const hits = queryTokens.filter((token) => haystack.includes(token)).length;
    return hits > 0 ? hits / queryTokens.length : 0;
  }

  private resolveLanguageForFile(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
      case '.mjs':
        return 'javascript';
      case '.py':
        return 'python';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      case '.java':
        return 'java';
      case '.rb':
        return 'ruby';
      default:
        return extension.replace(/^\./, '') || 'text';
    }
  }
}
