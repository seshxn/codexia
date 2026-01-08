import {
  GitAnalyzer,
  RepoIndexer,
  DependencyGraph,
  SymbolMap,
} from '../core/index.js';
import {
  MemoryLoader,
  ImpactAnalyzer,
  ConventionChecker,
  TestSuggester,
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
   * Generate PR report
   */
  async generatePrReport(options: {
    base?: string;
    head?: string;
  } = {}): Promise<PrReport> {
    await this.initialize();

    const diff = await this.git.getDiff(
      options.base || 'HEAD~1',
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
}
