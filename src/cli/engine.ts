import {
  GitAnalyzer,
  RepoIndexer,
  DependencyGraph,
  SymbolMap,
  SignalsEngine,
} from '../core/index.js';
import {
  MemoryLoader,
  ImpactAnalyzer,
  ConventionChecker,
  TestSuggester,
  TemporalAnalyzer,
  InvariantEngine,
  HotPathDetector,
  ChangelogGenerator,
  MonorepoAnalyzer,
  MonorepoDetector,
  SmartTestPrioritizer,
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
  Symbol,
  Signal,
} from '../core/types.js';

export interface EngineOptions {
  repoRoot?: string;
  verbose?: boolean;
}

export class CodexiaEngine {
  private repoRoot: string;
  private git: GitAnalyzer;
  private indexer: RepoIndexer;
  private depGraph: DependencyGraph;
  private symbolMap: SymbolMap;
  private memory: MemoryLoader;
  private impactAnalyzer: ImpactAnalyzer;
  private conventionChecker: ConventionChecker;
  private testSuggester: TestSuggester;
  private signalsEngine: SignalsEngine;
  private temporalAnalyzer: TemporalAnalyzer;
  private invariantEngine: InvariantEngine;
  private hotPathDetector: HotPathDetector;
  private changelogGenerator: ChangelogGenerator;
  private monorepoDetector: MonorepoDetector;
  private monorepoAnalyzer: MonorepoAnalyzer | null = null;
  private testPrioritizer: SmartTestPrioritizer;
  private initialized = false;

  constructor(options: EngineOptions = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    
    // Initialize all components
    this.git = new GitAnalyzer(this.repoRoot);
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
    this.invariantEngine = new InvariantEngine(this.repoRoot);
    this.hotPathDetector = new HotPathDetector(this.repoRoot);
    this.changelogGenerator = new ChangelogGenerator(this.repoRoot);
    this.monorepoDetector = new MonorepoDetector(this.repoRoot);
    this.testPrioritizer = new SmartTestPrioritizer();
  }

  /**
   * Initialize the engine by indexing the repository
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Index repository
    await this.indexer.index();

    // Build dependency graph
    const files = this.indexer.getFiles();
    this.depGraph.buildFromImports(files);

    // Build symbol map
    this.symbolMap.buildFromFiles(files);

    // Load memory if available
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
}
