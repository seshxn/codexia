import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { exec, execFile } from 'node:child_process';
import { simpleGit, SimpleGit } from 'simple-git';
import { CodexiaEngine } from '../../cli/engine.js';
import { getAIProvider } from '../../ai/index.js';
import { EngineeringIntelligenceService } from './engineering.js';
import type { GitHubAnalyticsServiceOptions } from './github.js';
import { JiraAnalyticsService, type JiraBoardHistoryReport, type JiraSprintReport } from './jira.js';
import type { JiraAnalyticsServiceOptions } from './jira.js';
import { buildKnowledgeGraphData } from './knowledge-graph.js';
import { RepoSwitchJobManager } from './repo-switch.js';

export interface DashboardServerOptions {
  port: number;
  host?: string;
  open?: boolean;
}

export interface DashboardAnalyticsOptions {
  githubConfig?: GitHubAnalyticsServiceOptions;
  jiraConfig?: JiraAnalyticsServiceOptions;
}

class ResultCache {
  private store = new Map<string, { data: unknown; expiry: number }>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiry) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set(key: string, data: unknown, ttlMs: number): void {
    this.store.set(key, { data, expiry: Date.now() + ttlMs });
  }

  invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

export interface LocalRepoAnalytics {
  getLanguageStats(): Promise<object>;
  getContributors(url?: URL): Promise<object>;
  getRecentCommits(url?: URL): Promise<object>;
  getBranches(): Promise<object>;
  getCommitActivity(): Promise<object>;
  getFileOwnership(url?: URL): Promise<object>;
  getCodeHealth(): Promise<object>;
  getVelocityMetrics(): Promise<object>;
}

export const createLocalRepoAnalytics = (repoRoot: string): LocalRepoAnalytics => {
  const engine = new CodexiaEngine({ repoRoot });
  const server = new DashboardServer(engine, repoRoot);
  let readiness: Promise<void> | null = null;

  const ensureReady = async (): Promise<void> => {
    readiness ??= engine.initialize();
    await readiness;
  };

  return {
    async getLanguageStats(): Promise<object> {
      await ensureReady();
      return server.getLanguageStats();
    },
    async getContributors(url?: URL): Promise<object> {
      await ensureReady();
      return server.getContributors(url);
    },
    async getRecentCommits(url?: URL): Promise<object> {
      await ensureReady();
      return server.getRecentCommits(url);
    },
    async getBranches(): Promise<object> {
      await ensureReady();
      return server.getBranches();
    },
    async getCommitActivity(): Promise<object> {
      await ensureReady();
      return server.getCommitActivity();
    },
    async getFileOwnership(url?: URL): Promise<object> {
      await ensureReady();
      return server.getFileOwnership(url);
    },
    async getCodeHealth(): Promise<object> {
      await ensureReady();
      return server.getCodeHealth();
    },
    async getVelocityMetrics(): Promise<object> {
      await ensureReady();
      return server.getVelocityMetrics();
    },
  };
};

/**
 * Dashboard REST API server
 */
export class DashboardServer {
  // Technical debt calculation weights
  private static readonly DEBT_WEIGHT_HIGH_COMPLEXITY = 30;
  private static readonly DEBT_WEIGHT_LOW_COHESION = 20;
  private static readonly DEBT_WEIGHT_HIGH_COUPLING = 20;
  private static readonly DEBT_WEIGHT_ERROR_SIGNAL = 3;
  private static readonly DEBT_WEIGHT_WARNING_SIGNAL = 1;
  
  // Technical debt component upper bounds (for clamping)
  private static readonly MAX_ERROR_COMPONENT_SCORE = 20;
  private static readonly MAX_WARNING_COMPONENT_SCORE = 10;
  
  // File attention thresholds
  private static readonly ATTENTION_COMPLEXITY_VERY_HIGH = 25;
  private static readonly ATTENTION_COMPLEXITY_HIGH = 20;
  private static readonly ATTENTION_COHESION_LOW = 0.3;
  private static readonly ATTENTION_COUPLING_HIGH = 50;
  private static readonly ATTENTION_LARGE_FILE_LINES = 500;
  
  // Analysis thresholds
  private static readonly COMPLEXITY_THRESHOLD_HIGH = 60;
  private static readonly COHESION_THRESHOLD_LOW = 0.3;
  private static readonly COUPLING_THRESHOLD_HIGH = 50;
  
  private server: http.Server | null = null;
  private engine: CodexiaEngine;
  private staticDir: string;
  private git: SimpleGit;
  private host: string = '127.0.0.1';
  private port: number = 0;
  private authToken: string | null = null;
  private allowedOrigins: Set<string> = new Set();
  private rateLimitWindowMs: number = Number(process.env.CODEXIA_DASHBOARD_RATE_LIMIT_WINDOW_MS || 60000);
  private rateLimitMax: number = Number(process.env.CODEXIA_DASHBOARD_RATE_LIMIT_MAX || 120);
  private rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
  private jira: JiraAnalyticsService;
  private engineering: EngineeringIntelligenceService;
  private currentRepoRoot: string;
  private recentRepoRoots: string[] = [];
  private static readonly MAX_RECENT_REPOS = 10;
  private resultCache = new ResultCache();
  private aiInsightRequests = new Map<string, Promise<object>>();
  private engineeringReportRequests = new Map<string, Promise<object>>();
  private requestSequence = 0;
  private latestRequestSequence = new Map<string, number>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly repoSwitchJobs = new RepoSwitchJobManager();
  private readonly githubConfig?: GitHubAnalyticsServiceOptions;
  private readonly jiraConfig?: JiraAnalyticsServiceOptions;

  constructor(engine: CodexiaEngine, repoRoot?: string, analyticsOptions: DashboardAnalyticsOptions = {}) {
    this.engine = engine;
    // Runtime contract: dist/dashboard/server/index.js serves ../.. /dashboard-client
    this.staticDir = path.resolve(import.meta.dirname, '../../dashboard-client');
    this.currentRepoRoot = path.resolve(repoRoot || process.cwd());
    this.git = simpleGit(this.currentRepoRoot);
    this.githubConfig = analyticsOptions.githubConfig;
    this.jiraConfig = analyticsOptions.jiraConfig;
    this.jira = new JiraAnalyticsService(this.jiraConfig);
    this.engineering = new EngineeringIntelligenceService({
      repoRoot: this.currentRepoRoot,
      jira: this.jira,
      githubConfig: this.githubConfig,
    });
    this.addRecentRepo(this.currentRepoRoot);
  }

  /**
   * Start the dashboard server
   */
  async start(options: DashboardServerOptions): Promise<void> {
    const { port, open = false, host } = options;
    this.host = host || process.env.CODEXIA_DASHBOARD_HOST || '127.0.0.1';
    this.port = port;
    this.authToken = process.env.CODEXIA_DASHBOARD_TOKEN || null;
    this.allowedOrigins = this.buildAllowedOrigins(this.host, this.port);

    // Initialize engine if not already done
    await this.engine.initialize();

    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(port, this.host, () => {
        const displayHost = this.host === '0.0.0.0' ? 'localhost' : this.host;
        console.log(`\n🚀 Codexia Dashboard running at http://${displayHost}:${port}\n`);

        if (open) {
          this.openBrowser(`http://${displayHost}:${port}`);
        }

        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    this.applySecurityHeaders(res);
    this.applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith('/api/')) {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }
      if (this.isRateLimited(req)) {
        this.logSecurityEvent('dashboard.rate_limit', req, { path: pathname });
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too Many Requests' }));
        return;
      }
      if (!this.isAuthorized(req)) {
        this.logSecurityEvent('dashboard.unauthorized', req, { path: pathname });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      await this.handleApiRoute(pathname, url, res);
      return;
    }

    // Static file serving
    await this.serveStatic(pathname, res);
  }

  /**
   * Parse pagination query params (limit and offset)
   */
  private getPaginationParams(url: URL, defaultLimit = 50): { limit: number; offset: number; showAll: boolean } {
    const showAll = url.searchParams.get('all') === 'true';
    const limit = showAll ? Infinity : parseInt(url.searchParams.get('limit') || String(defaultLimit), 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    return { limit, offset, showAll };
  }

  /**
   * Handle API routes
   */
  private async handleApiRoute(pathname: string, url: URL, res: http.ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    try {
      let data: unknown;

      switch (pathname) {
        case '/api/overview':
          data = await this.getOverview();
          break;
        case '/api/complexity':
          data = await this.getComplexity(url);
          break;
        case '/api/cognitive-load':
          data = await this.getCognitiveLoad(url);
          break;
        case '/api/graph':
          data = await this.getGraph(url);
          break;
        case '/api/graph/file':
          data = await this.getGraphFile(url);
          break;
        case '/api/signals':
          data = await this.getSignals(url);
          break;
        case '/api/hotpaths':
          data = await this.getHotPaths(url);
          break;
        case '/api/temporal':
          data = await this.getTemporal(url);
          break;
        case '/api/languages':
          data = await this.getLanguageStats();
          break;
        case '/api/contributors':
          data = await this.getContributors(url);
          break;
        case '/api/commits':
          data = await this.getRecentCommits(url);
          break;
        case '/api/branches':
          data = await this.getBranches();
          break;
        case '/api/activity':
          data = await this.getCommitActivity();
          break;
        case '/api/ownership':
          data = await this.getFileOwnership(url);
          break;
        case '/api/code-health':
          data = await this.getCodeHealth();
          break;
        case '/api/velocity':
          data = await this.getVelocityMetrics();
          break;
        case '/api/drift':
          data = await this.getDrift(url);
          break;
        case '/api/repo/context':
          data = this.getRepoContext();
          break;
        case '/api/repo/recent':
          data = this.getRecentRepos();
          break;
        case '/api/repo/select':
          data = await this.selectRepo(url);
          break;
        case '/api/repo/switch-status':
          data = this.getRepoSwitchStatus(url);
          break;
        case '/api/repo/pick':
          data = await this.pickRepoPath();
          break;
        case '/api/jira/config':
          data = this.getJiraConfig();
          break;
        case '/api/jira/boards':
          data = await this.getJiraBoards(url);
          break;
        case '/api/jira/sprints':
          data = await this.getJiraSprints(url);
          break;
        case '/api/jira/sprint-report':
          data = await this.getJiraSprintReport(url);
          break;
        case '/api/jira/board-report':
          data = await this.getJiraBoardReport(url);
          break;
        case '/api/jira/flow-report':
          data = await this.getJiraFlowReport(url);
          break;
        case '/api/ai/jira-insights':
          data = await this.getJiraInsights(url);
          break;
        case '/api/engineering/config':
          data = await this.getEngineeringConfig();
          break;
        case '/api/engineering/overview':
          data = await this.getEngineeringOverview(url);
          break;
        case '/api/engineering/teams':
          data = await this.getEngineeringTeams();
          break;
        case '/api/engineering/team-report':
          data = await this.getEngineeringTeamReport(url);
          break;
        case '/api/engineering/repo-report':
          data = await this.getEngineeringRepoReport(url);
          break;
        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (error) {
      console.error('API error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = errorMessage.includes('(429)')
        ? 429
        : errorMessage.startsWith('BadRequest:') || errorMessage.includes('not configured')
        ? 400
        : 500;
      res.writeHead(statusCode);
      res.end(JSON.stringify({ error: errorMessage }));
    }
  }

  /**
   * Get repository overview data
   */
  private async getOverview(): Promise<object> {
    const stats = this.engine.getStats();
    const files = this.engine.getFiles();
    const signals = await this.engine.getSignals({ include: ['all'] });

    // Count languages
    const languages: Record<string, number> = {};
    for (const file of files.values()) {
      const lang = file.language || 'other';
      languages[lang] = (languages[lang] || 0) + 1;
    }

    // Calculate health score based on signals
    // Signal severity is 'info' | 'warning' | 'error'
    const errorCount = signals.filter(s => s.severity === 'error').length;
    const warningCount = signals.filter(s => s.severity === 'warning').length;
    const healthScore = Math.max(0, Math.min(100, 100 - (errorCount * 15) - (warningCount * 5)));

    return {
      name: path.basename(this.currentRepoRoot),
      repoRoot: this.currentRepoRoot,
      totalFiles: stats.files || files.size,
      totalSymbols: stats.symbols || 0,
      totalDependencies: stats.exports || 0,
      languages,
      healthScore,
      lastIndexed: new Date().toISOString(),
    };
  }

  /**
   * Get complexity metrics for all files
   */
  private async getComplexity(url?: URL): Promise<object> {
    const { limit, offset } = url ? this.getPaginationParams(url, 100) : { limit: 100, offset: 0 };
    const complexityData = await this.engine.getComplexity({});
    
    // Convert to expected format
    // DetailedMetrics has: linesOfCode, logicalLines, commentLines, blankLines, etc.
    const allFiles = Array.from(complexityData.entries())
      .map(([filePath, data]) => ({
        file: filePath,
        metrics: {
          lines: data.metrics?.linesOfCode || 0,
          functions: data.symbols?.length || 0,
          imports: 0, // Not tracked in DetailedMetrics
          exports: 0, // Not tracked in DetailedMetrics
          cyclomaticComplexity: data.score?.cyclomatic || 0,
        },
        score: data.score?.overall || 0,
      }))
      .sort((a, b) => b.score - a.score);

    const totalScore = allFiles.reduce((sum, f) => sum + f.score, 0);
    const files = limit === Infinity ? allFiles : allFiles.slice(offset, offset + limit);
    
    return {
      files,
      totalFiles: allFiles.length,
      averageScore: allFiles.length > 0 ? totalScore / allFiles.length : 0,
      highComplexityCount: allFiles.filter(f => f.score > 15).length,
    };
  }

  /**
   * Get holistic cognitive load insights.
   */
  private async getCognitiveLoad(url?: URL): Promise<object> {
    const { limit, offset } = url ? this.getPaginationParams(url, 80) : { limit: 80, offset: 0 };
    const report = await this.engine.getCognitiveLoadMap({});
    const allFiles = report.files;
    const files = limit === Infinity ? allFiles : allFiles.slice(offset, offset + limit);
    const visiblePaths = new Set(files.map((file) => file.path));

    return {
      generatedAt: report.generatedAt,
      summary: {
        ...report.summary,
        totalFiles: allFiles.length,
        visibleFiles: files.length,
      },
      files,
      modules: report.modules.filter((module) => module.topRiskFiles.some((filePath) => visiblePaths.has(filePath))),
      functions: report.functions.filter((entry) => visiblePaths.has(entry.path)).slice(0, 200),
      implicitCoupling: report.implicitCoupling.filter((pair) => visiblePaths.has(pair.from) || visiblePaths.has(pair.to)),
      documentationGaps: report.documentationGaps.filter((gap) => visiblePaths.has(gap.path)),
      onboardingDifficulty: report.onboardingDifficulty.filter((item) => visiblePaths.has(item.path)),
    };
  }

  /**
   * Get dependency graph data
   */
  private async getGraph(url: URL): Promise<object> {
    const depth = this.normalizeDepth(url.searchParams.get('depth'));
    const focus = this.normalizeFocus(url.searchParams.get('focus'));
    const repoRoot = this.currentRepoRoot;
    const repoFiles = new Map(this.engine.getFiles());
    const cacheKey = `graph::${repoRoot}::${depth}::${focus ?? ''}`;
    const cached = this.resultCache.get<object>(cacheKey);
    if (cached !== undefined) return cached;

    const graphDataPromise = this.engine.getGraphData({ depth, focus });
    // When a focus is set, restrict the file set to only those referenced by
    // the filtered edges so that node construction respects the focus/depth.
    let files = repoFiles;
    // getCognitiveLoadMap runs git log and can be slow on large repos.
    // Time-box it to 15s; if it exceeds that, render the graph without
    // temporal heat (nodes will simply have no cognitive-load coloring).
    const COGNITIVE_LOAD_TIMEOUT_MS = 15_000;
    const cognitiveLoadPromise = Promise.race([
      this.engine
        .getCognitiveLoadMap({ maxTemporalFiles: 120 })
        .then((result) => new Map(result.files.map((entry) => [entry.path, entry.score]))),
      new Promise<Map<string, number>>((resolve) =>
        setTimeout(() => resolve(new Map()), COGNITIVE_LOAD_TIMEOUT_MS),
      ),
    ]);
    const graphData = await graphDataPromise;
    if (focus) {
      const relevantPaths = new Set<string>([focus]);
      for (const edge of graphData.edges) {
        relevantPaths.add(edge.from);
        relevantPaths.add(edge.to);
      }
      files = new Map([...files].filter(([p]) => relevantPaths.has(p)));
    }
    const cognitiveLoadByFile = await cognitiveLoadPromise;
    const result = await buildKnowledgeGraphData(repoRoot, files, graphData.edges, {
      cognitiveLoadByFile,
    });
    this.resultCache.set(cacheKey, result, this.CACHE_TTL_MS);
    return result;
  }

  /**
   * Get a code snippet for a graph node file path.
   */
  private async getGraphFile(url: URL): Promise<object> {
    const relativePath = this.normalizeFocus(url.searchParams.get('path'));
    if (!relativePath) {
      throw new Error('BadRequest: Missing or invalid path query parameter.');
    }

    const file = this.engine.getFiles().get(relativePath);
    if (!file) {
      throw new Error(`BadRequest: File not found in repository index: ${relativePath}`);
    }

    const absolutePath = path.resolve(this.currentRepoRoot, relativePath);
    if (!absolutePath.startsWith(this.currentRepoRoot + path.sep)) {
      throw new Error('BadRequest: Invalid path.');
    }

    const lineParam = this.parsePositiveInt(url.searchParams.get('line'));
    const context = Math.max(12, Math.min(80, this.parsePositiveInt(url.searchParams.get('context')) || 28));
    const rawContent = await fs.readFile(absolutePath, 'utf-8');
    const lines = rawContent.split('\n');

    const anchorLine = lineParam ? Math.min(lineParam, lines.length) : undefined;
    const startLine = anchorLine ? Math.max(1, anchorLine - context) : 1;
    const endLine = anchorLine
      ? Math.min(lines.length, anchorLine + context)
      : Math.min(lines.length, context * 2);

    return {
      path: relativePath,
      language: file.language,
      focusLine: anchorLine,
      startLine,
      endLine,
      totalLines: lines.length,
      truncated: startLine > 1 || endLine < lines.length,
      snippet: lines.slice(startLine - 1, endLine).join('\n'),
    };
  }

  /**
   * Get code quality signals
   */
  private async getSignals(url?: URL): Promise<object> {
    const { limit, offset } = url ? this.getPaginationParams(url, 100) : { limit: 100, offset: 0 };
    const rawSignals = await this.engine.getSignals({ include: ['all'] });
    
    // Map to expected format
    // Signal type has: type (SignalType), severity ('info'|'warning'|'error'), message, evidence[], filePath?, line?
    const allSignals = rawSignals.map(s => ({
      type: s.type || 'unknown',
      severity: this.mapSeverity(s.severity),
      file: s.filePath || '',
      line: s.line,
      message: s.message || '',
      suggestion: s.evidence?.[0]?.description,
    }));

    // Group by type and severity
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    
    for (const signal of allSignals) {
      byType[signal.type] = (byType[signal.type] || 0) + 1;
      bySeverity[signal.severity] = (bySeverity[signal.severity] || 0) + 1;
    }

    const signals = limit === Infinity ? allSignals : allSignals.slice(offset, offset + limit);

    return { signals, totalSignals: allSignals.length, byType, bySeverity };
  }

  /**
   * Map various severity strings to standardized values
   */
  private mapSeverity(severity: string | undefined): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity?.toLowerCase()) {
      case 'critical':
      case 'error':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
      case 'warning':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Get hot paths data
   */
  private async getHotPaths(url?: URL): Promise<object> {
    const { limit, offset } = url ? this.getPaginationParams(url, 50) : { limit: 50, offset: 0 };
    const hotPathsData = await this.engine.getHotPaths();
    
    // Map to expected format
    const allPaths = (hotPathsData.paths || []).map((p: any) => ({
      path: p.path || p.file || '',
      score: p.score || p.risk === 'high' ? 0.8 : p.risk === 'medium' ? 0.5 : 0.3,
      metrics: {
        changeFrequency: p.changes || p.commits || 0,
        complexity: p.complexity || 0,
        couplingFactor: p.coupling || p.dependencies || 0,
      },
    }));

    const hotPaths = limit === Infinity ? allPaths : allPaths.slice(offset, offset + limit);

    return {
      hotPaths,
      totalPaths: allPaths.length,
      threshold: 0.5,
    };
  }

  /**
   * Get temporal analysis data
   */
  private async getTemporal(url?: URL): Promise<object> {
    const { limit } = url ? this.getPaginationParams(url, 50) : { limit: 50 };
    const temporal = await this.engine.getTemporal();
    
    // Map to expected format
    const allChanges = (temporal.hotspots || []).map((h: any) => ({
      file: h.file || h.path || '',
      changeCount: h.changes || h.commits || 0,
      lastModified: h.lastModified || new Date().toISOString(),
    }));
    
    const recentChanges = limit === Infinity ? allChanges : allChanges.slice(0, limit);

    const allAuthorStats = Object.entries(temporal.ownership || {}).map(([author, data]: [string, any]) => ({
      author,
      commits: data.commits || 0,
      filesChanged: data.files || data.filesOwned || 0,
    }));
    
    const authorStats = limit === Infinity ? allAuthorStats : allAuthorStats.slice(0, limit);

    // Generate activity by day from churn rates or create mock data
    const activityByDay: Record<string, number> = {};
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      activityByDay[dateStr] = Math.floor(Math.random() * 10) + 1; // Placeholder
    }

    return {
      recentChanges,
      authorStats,
      activityByDay,
      totalChanges: allChanges.length,
      totalAuthors: allAuthorStats.length,
    };
  }

  /**
   * Get language statistics
   */
  async getLanguageStats(): Promise<object> {
    const files = this.engine.getFiles();
    const langCounts: Record<string, number> = {};
    const langLines: Record<string, number> = {};

    for (const file of files.values()) {
      const lang = file.language || 'unknown';
      langCounts[lang] = (langCounts[lang] || 0) + 1;
      langLines[lang] = (langLines[lang] || 0) + file.lines;
    }

    return {
      counts: langCounts,
      lines: langLines,
      total: files.size,
    };
  }

  /**
   * Get contributors/authors with their stats
   */
  async getContributors(url?: URL): Promise<object> {
    const { limit } = url ? this.getPaginationParams(url, 50) : { limit: 50 };
    const cacheKey = `contributors::${this.currentRepoRoot}::${limit}`;
    const cached = this.resultCache.get<object>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      // Get all commits with author info
      const log = await this.git.log({ maxCount: 1000 });
      
      const contributorMap = new Map<string, {
        name: string;
        email: string;
        commits: number;
        additions: number;
        deletions: number;
        firstCommit: Date;
        lastCommit: Date;
        recentCommits: number; // Last 30 days
      }>();

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      for (const commit of log.all) {
        const key = commit.author_email;
        const commitDate = new Date(commit.date);
        const isRecent = commitDate > thirtyDaysAgo;
        
        const existing = contributorMap.get(key);
        if (existing) {
          existing.commits++;
          if (isRecent) existing.recentCommits++;
          if (commitDate > existing.lastCommit) existing.lastCommit = commitDate;
          if (commitDate < existing.firstCommit) existing.firstCommit = commitDate;
        } else {
          contributorMap.set(key, {
            name: commit.author_name,
            email: commit.author_email,
            commits: 1,
            additions: 0,
            deletions: 0,
            firstCommit: commitDate,
            lastCommit: commitDate,
            recentCommits: isRecent ? 1 : 0,
          });
        }
      }

      // Get stats for contributors
      const allContributors = Array.from(contributorMap.values())
        .sort((a, b) => b.commits - a.commits)
        .map((c, index) => ({
          rank: index + 1,
          name: c.name,
          email: c.email,
          avatar: `https://www.gravatar.com/avatar/${this.md5(c.email.toLowerCase().trim())}?d=identicon&s=80`,
          commits: c.commits,
          additions: c.additions,
          deletions: c.deletions,
          firstCommit: c.firstCommit.toISOString(),
          lastCommit: c.lastCommit.toISOString(),
          recentCommits: c.recentCommits,
          isActive: c.recentCommits > 0,
        }));
      
      const contributors = limit === Infinity ? allContributors : allContributors.slice(0, limit);

      const result = {
        contributors,
        totalContributors: contributorMap.size,
        activeContributors: allContributors.filter(c => c.isActive).length,
      };
      this.resultCache.set(cacheKey, result, this.CACHE_TTL_MS);
      return result;
    } catch (error) {
      console.error('Error getting contributors:', error);
      return { contributors: [], totalContributors: 0, activeContributors: 0 };
    }
  }

  /**
   * Get recent commits
   */
  async getRecentCommits(url?: URL): Promise<object> {
    const { limit } = url ? this.getPaginationParams(url, 100) : { limit: 100 };
    try {
      const maxCount = limit === Infinity ? 500 : Math.min(limit, 500);
      const log = await this.git.log({ maxCount });
      
      const commits = log.all.map(commit => ({
        hash: commit.hash.substring(0, 7),
        fullHash: commit.hash,
        message: commit.message.split('\n')[0], // First line only
        author: commit.author_name,
        email: commit.author_email,
        avatar: `https://www.gravatar.com/avatar/${this.md5(commit.author_email.toLowerCase().trim())}?d=identicon&s=40`,
        date: new Date(commit.date).toISOString(),
        relativeDate: this.getRelativeTime(new Date(commit.date)),
      }));

      return { commits, totalCommits: log.total || commits.length };
    } catch (error) {
      console.error('Error getting commits:', error);
      return { commits: [], totalCommits: 0 };
    }
  }

  /**
   * Get branch information
   */
  async getBranches(): Promise<object> {
    try {
      const branches = await this.git.branchLocal();
      const currentBranch = branches.current;
      
      const branchList = await Promise.all(
        branches.all.map(async (branch) => {
          try {
            const log = await this.git.log({ maxCount: 1, [branch]: null } as any);
            const lastCommit = log.all[0];
            const lastActivity = lastCommit ? new Date(lastCommit.date) : new Date();
            const daysSinceActivity = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
            
            return {
              name: branch,
              isCurrent: branch === currentBranch,
              lastActivity: lastActivity.toISOString(),
              lastCommitMessage: lastCommit?.message.split('\n')[0] || '',
              lastCommitAuthor: lastCommit?.author_name || '',
              daysSinceActivity,
              isStale: daysSinceActivity > 30,
            };
          } catch {
            return {
              name: branch,
              isCurrent: branch === currentBranch,
              lastActivity: new Date().toISOString(),
              lastCommitMessage: '',
              lastCommitAuthor: '',
              daysSinceActivity: 0,
              isStale: false,
            };
          }
        })
      );

      return {
        current: currentBranch,
        branches: branchList.sort((a, b) => {
          if (a.isCurrent) return -1;
          if (b.isCurrent) return 1;
          return a.daysSinceActivity - b.daysSinceActivity;
        }),
        totalBranches: branches.all.length,
        staleBranches: branchList.filter(b => b.isStale).length,
      };
    } catch (error) {
      console.error('Error getting branches:', error);
      return { current: 'main', branches: [], totalBranches: 0, staleBranches: 0 };
    }
  }

  /**
   * Get commit activity over time (for heatmap/calendar)
   */
  async getCommitActivity(): Promise<object> {
    const cacheKey = `commit-activity::${this.currentRepoRoot}`;
    const cached = this.resultCache.get<object>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const log = await this.git.log({
        '--since': oneYearAgo.toISOString(),
        maxCount: 5000,
      });

      // Group by date and hour
      const byDate: Record<string, number> = {};
      const byHour: Record<number, number> = {};
      const byDayOfWeek: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

      for (const commit of log.all) {
        const date = new Date(commit.date);
        const dateStr = date.toISOString().split('T')[0];
        const hour = date.getHours();
        const dayOfWeek = date.getDay();

        byDate[dateStr] = (byDate[dateStr] || 0) + 1;
        byHour[hour] = (byHour[hour] || 0) + 1;
        byDayOfWeek[dayOfWeek]++;
      }

      // Convert to array format for charts
      const activityByDate = Object.entries(byDate)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const activityByHour = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        label: `${hour.toString().padStart(2, '0')}:00`,
        count: byHour[hour] || 0,
      }));

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const activityByDayOfWeek = dayNames.map((name, index) => ({
        day: name,
        index,
        count: byDayOfWeek[index],
      }));

      // Find peak coding times
      const peakHour = activityByHour.reduce((max, curr) => curr.count > max.count ? curr : max);
      const peakDay = activityByDayOfWeek.reduce((max, curr) => curr.count > max.count ? curr : max);

      const result = {
        activityByDate,
        activityByHour,
        activityByDayOfWeek,
        totalCommits: log.all.length,
        peakHour: peakHour.label,
        peakDay: peakDay.day,
        averagePerDay: (log.all.length / 365).toFixed(1),
      };
      this.resultCache.set(cacheKey, result, this.CACHE_TTL_MS);
      return result;
    } catch (error) {
      console.error('Error getting activity:', error);
      return {
        activityByDate: [],
        activityByHour: [],
        activityByDayOfWeek: [],
        totalCommits: 0,
        peakHour: '09:00',
        peakDay: 'Mon',
        averagePerDay: '0',
      };
    }
  }

  /**
   * Get file ownership data (who owns what)
   */
  async getFileOwnership(url?: URL): Promise<object> {
    const { limit } = url ? this.getPaginationParams(url, 200) : { limit: 200 };
    const cacheKey = `ownership::${this.currentRepoRoot}::${limit}`;
    const cached = this.resultCache.get<object>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const files = this.engine.getFiles();
      const ownershipData: Array<{
        file: string;
        primaryOwner: string;
        ownerEmail: string;
        ownership: number;
        contributors: number;
        lastModified: string;
        busFactor: number;
      }> = [];

      // Analyze all files (increased from 100)
      const filePaths = Array.from(files.keys());

      type FileOwnershipEntry = {
        file: string;
        primaryOwner: string;
        ownerEmail: string;
        ownership: number;
        contributors: number;
        lastModified: string;
        busFactor: number;
      } | null;

      const fileOwnershipResults = await processInBatches<string, FileOwnershipEntry>(filePaths, 20, async (filePath) => {
        try {
          const log = await this.git.log({ file: filePath, maxCount: 100 });

          if (log.all.length === 0) return null;

          // Count commits per author
          const authorCommits = new Map<string, { name: string; email: string; count: number }>();
          for (const commit of log.all) {
            const key = commit.author_email;
            const existing = authorCommits.get(key);
            if (existing) {
              existing.count++;
            } else {
              authorCommits.set(key, {
                name: commit.author_name,
                email: commit.author_email,
                count: 1,
              });
            }
          }

          // Find primary owner
          const sorted = Array.from(authorCommits.values()).sort((a, b) => b.count - a.count);
          const primaryOwner = sorted[0];
          const totalCommits = log.all.length;
          const ownership = primaryOwner ? Math.round((primaryOwner.count / totalCommits) * 100) : 0;

          // Bus factor: number of people needed to cover 50% of commits
          let busFactor = 0;
          let covered = 0;
          for (const author of sorted) {
            busFactor++;
            covered += author.count;
            if (covered >= totalCommits * 0.5) break;
          }

          return {
            file: filePath,
            primaryOwner: primaryOwner?.name || 'Unknown',
            ownerEmail: primaryOwner?.email || '',
            ownership,
            contributors: authorCommits.size,
            lastModified: new Date(log.all[0].date).toISOString(),
            busFactor,
          };
        } catch {
          // Skip files with errors
          return null;
        }
      });

      for (const entry of fileOwnershipResults) {
        if (entry !== null) ownershipData.push(entry);
      }

      // Find high-risk files (single owner with 80%+ ownership)
      const allHighRiskFiles = ownershipData.filter(f => f.ownership >= 80 && f.busFactor === 1);
      
      // Aggregate by owner
      const ownerSummary = new Map<string, { name: string; filesOwned: number; totalOwnership: number }>();
      for (const file of ownershipData) {
        const existing = ownerSummary.get(file.ownerEmail);
        if (existing) {
          existing.filesOwned++;
          existing.totalOwnership += file.ownership;
        } else {
          ownerSummary.set(file.ownerEmail, {
            name: file.primaryOwner,
            filesOwned: 1,
            totalOwnership: file.ownership,
          });
        }
      }

      const allOwnersByFiles = Array.from(ownerSummary.entries())
        .map(([email, data]) => ({
          name: data.name,
          email,
          filesOwned: data.filesOwned,
          avgOwnership: Math.round(data.totalOwnership / data.filesOwned),
        }))
        .sort((a, b) => b.filesOwned - a.filesOwned);

      const filesResult = limit === Infinity ? ownershipData : ownershipData.slice(0, limit);
      const highRiskFiles = limit === Infinity ? allHighRiskFiles : allHighRiskFiles.slice(0, limit);
      const ownersByFiles = limit === Infinity ? allOwnersByFiles : allOwnersByFiles.slice(0, Math.min(limit, 20));

      const result = {
        files: filesResult,
        highRiskFiles,
        ownersByFiles,
        totalFiles: ownershipData.length,
        totalHighRiskFiles: allHighRiskFiles.length,
        averageBusFactor: ownershipData.length > 0
          ? (ownershipData.reduce((sum, f) => sum + f.busFactor, 0) / ownershipData.length).toFixed(1)
          : '0',
      };
      this.resultCache.set(cacheKey, result, this.CACHE_TTL_MS);
      return result;
    } catch (error) {
      console.error('Error getting ownership:', error);
      return { files: [], highRiskFiles: [], ownersByFiles: [], totalFiles: 0, totalHighRiskFiles: 0, averageBusFactor: '0' };
    }
  }

  /**
   * Get code health metrics (maintainability, technical debt, etc.)
   */
  async getCodeHealth(): Promise<object> {
    try {
      const complexityData = await this.engine.getComplexity({});
      const signals = await this.engine.getSignals({ include: ['all'] });
      
      // Calculate aggregate metrics
      const allFiles = Array.from(complexityData.values());
      const totalFiles = allFiles.length;
      
      // Maintainability metrics
      const maintainabilityScores = allFiles
        .filter(f => f.score?.maintainabilityIndex !== undefined)
        .map(f => f.score.maintainabilityIndex);
      const avgMaintainability = maintainabilityScores.length > 0
        ? maintainabilityScores.reduce((a, b) => a + b, 0) / maintainabilityScores.length
        : 0;
      
      // Complexity distribution (adjusted thresholds for real-world codebases)
      const complexityBuckets = {
        low: allFiles.filter(f => (f.score?.overall || 0) <= 20).length,
        moderate: allFiles.filter(f => (f.score?.overall || 0) > 20 && (f.score?.overall || 0) <= 50).length,
        high: allFiles.filter(f => (f.score?.overall || 0) > 50 && (f.score?.overall || 0) <= 80).length,
        critical: allFiles.filter(f => (f.score?.overall || 0) > 80).length,
      };
      
      // Technical debt indicators (adjusted thresholds)
      const highComplexityFiles = allFiles.filter(f => (f.score?.overall || 0) > DashboardServer.COMPLEXITY_THRESHOLD_HIGH);
      const lowCohesionFiles = allFiles.filter(f => (f.score?.cohesion || 0) < DashboardServer.COHESION_THRESHOLD_LOW);
      const highCouplingFiles = allFiles.filter(f => (f.score?.coupling || 0) > DashboardServer.COUPLING_THRESHOLD_HIGH);
      
      // Signal-based debt
      const errorSignals = signals.filter(s => s.severity === 'error');
      const warningSignals = signals.filter(s => s.severity === 'warning');
      
      // Calculate technical debt score (0-100, lower is better)
      // Bound individual components so the overall score remains meaningful on a 0-100 scale
      const errorComponent = Math.min(DashboardServer.MAX_ERROR_COMPONENT_SCORE, errorSignals.length * DashboardServer.DEBT_WEIGHT_ERROR_SIGNAL);
      const warningComponent = Math.min(DashboardServer.MAX_WARNING_COMPONENT_SCORE, warningSignals.length * DashboardServer.DEBT_WEIGHT_WARNING_SIGNAL);
      const debtScore = Math.min(100, 
        (highComplexityFiles.length / Math.max(1, totalFiles)) * DashboardServer.DEBT_WEIGHT_HIGH_COMPLEXITY +
        (lowCohesionFiles.length / Math.max(1, totalFiles)) * DashboardServer.DEBT_WEIGHT_LOW_COHESION +
        (highCouplingFiles.length / Math.max(1, totalFiles)) * DashboardServer.DEBT_WEIGHT_HIGH_COUPLING +
        errorComponent +
        warningComponent
      );
      
      // Calculate lines of code
      const totalLines = allFiles.reduce((sum, f) => sum + (f.metrics?.linesOfCode || 0), 0);
      const avgLinesPerFile = totalFiles > 0 ? Math.round(totalLines / totalFiles) : 0;
      
      // Get top files needing attention
      const filesNeedingAttention = allFiles
        .map(f => {
          const file =
            (f as any).path ??
            (f as any).file ??
            (f as any).filePath ??
            'unknown';
          const reason = this.getAttentionReason(f);
          return {
            file,
            score: f.score?.overall || 0,
            maintainability: f.score?.maintainabilityIndex || 0,
            lines: f.metrics?.linesOfCode || 0,
            reason,
          };
        })
        .filter(f => f.reason)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      
      return {
        maintainability: {
          average: Math.round(avgMaintainability),
          grade: this.getMaintainabilityGrade(avgMaintainability),
        },
        complexity: {
          distribution: complexityBuckets,
          averageScore: totalFiles > 0 
            ? (allFiles.reduce((sum, f) => sum + (f.score?.overall || 0), 0) / totalFiles).toFixed(1)
            : '0',
        },
        technicalDebt: {
          score: Math.round(debtScore),
          grade: this.getDebtGrade(debtScore),
          indicators: {
            highComplexity: highComplexityFiles.length,
            lowCohesion: lowCohesionFiles.length,
            highCoupling: highCouplingFiles.length,
            errors: errorSignals.length,
            warnings: warningSignals.length,
          },
        },
        codebase: {
          totalFiles,
          totalLines,
          avgLinesPerFile,
        },
        filesNeedingAttention,
      };
    } catch (error) {
      console.error('Error getting code health:', error);
      return {
        maintainability: { average: 0, grade: 'N/A' },
        complexity: { distribution: { low: 0, moderate: 0, high: 0, critical: 0 }, averageScore: '0' },
        technicalDebt: { score: 0, grade: 'N/A', indicators: {} },
        codebase: { totalFiles: 0, totalLines: 0, avgLinesPerFile: 0 },
        filesNeedingAttention: [],
      };
    }
  }

  /**
   * Get velocity metrics from git history
   */
  async getVelocityMetrics(): Promise<object> {
    const cacheKey = `velocity::${this.currentRepoRoot}`;
    const cached = this.resultCache.get<object>(cacheKey);
    if (cached !== undefined) return cached;
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const log = await this.git.log({ '--since': thirtyDaysAgo.toISOString(), maxCount: 1000 });
      
      // Calculate commits per week
      const weeklyCommits: Record<string, number> = {};
      const dailyCommits: Record<string, number> = {};
      const authorActivity: Record<string, { commits: number; lastWeek: number }> = {};
      
      for (const commit of log.all) {
        const date = new Date(commit.date);
        const weekKey = this.getWeekKey(date);
        const dayKey = date.toISOString().split('T')[0];
        
        weeklyCommits[weekKey] = (weeklyCommits[weekKey] || 0) + 1;
        dailyCommits[dayKey] = (dailyCommits[dayKey] || 0) + 1;
        
        const isLastWeek = date > sevenDaysAgo;
        const author = commit.author_email;
        if (!authorActivity[author]) {
          authorActivity[author] = { commits: 0, lastWeek: 0 };
        }
        authorActivity[author].commits++;
        if (isLastWeek) authorActivity[author].lastWeek++;
      }
      
      // Calculate trends
      const weeks = Object.keys(weeklyCommits).sort();
      const recentWeeks = weeks.slice(-4);
      const avgCommitsPerWeek = recentWeeks.length > 0
        ? recentWeeks.reduce((sum, w) => sum + weeklyCommits[w], 0) / recentWeeks.length
        : 0;
      
      // Velocity trend (comparing last 2 weeks to previous 2 weeks)
      const lastTwoWeeks = weeks.slice(-2).reduce((sum, w) => sum + weeklyCommits[w], 0);
      const prevTwoWeeks = weeks.slice(-4, -2).reduce((sum, w) => sum + weeklyCommits[w], 0);
      let velocityTrend = '0';
      if (prevTwoWeeks > 0) {
        const rawTrend = ((lastTwoWeeks - prevTwoWeeks) / prevTwoWeeks * 100);
        // Cap at ±999% for display purposes
        const cappedTrend = Math.max(-999, Math.min(999, rawTrend));
        velocityTrend = cappedTrend.toFixed(0);
      } else if (lastTwoWeeks > 0) {
        velocityTrend = 'new';
      }
      
      // Active contributors
      const activeContributors = Object.values(authorActivity).filter(a => a.lastWeek > 0).length;
      const totalContributors = Object.keys(authorActivity).length;
      
      // Commit frequency by day
      const days = Object.keys(dailyCommits).sort().slice(-14);
      const commitsByDay = days.map(d => ({ date: d, count: dailyCommits[d] || 0 }));
      
      const result = {
        summary: {
          totalCommits30d: log.all.length,
          avgCommitsPerWeek: Math.round(avgCommitsPerWeek),
          velocityTrend: velocityTrend === 'new' ? 'New' : `${Number(velocityTrend) >= 0 ? '+' : ''}${velocityTrend}%`,
          activeContributors,
          totalContributors,
        },
        weeklyTrend: recentWeeks.map(w => ({ week: w, commits: weeklyCommits[w] })),
        dailyActivity: commitsByDay,
        topContributors: Object.entries(authorActivity)
          .sort((a, b) => b[1].commits - a[1].commits)
          .slice(0, 5)
          .map(([email, data]) => ({ email, ...data })),
      };
      this.resultCache.set(cacheKey, result, this.CACHE_TTL_MS);
      return result;
    } catch (error) {
      console.error('Error getting velocity metrics:', error);
      return {
        summary: { totalCommits30d: 0, avgCommitsPerWeek: 0, velocityTrend: '0%', activeContributors: 0, totalContributors: 0 },
        weeklyTrend: [],
        dailyActivity: [],
        topContributors: [],
      };
    }
  }

  /**
   * Get architecture drift metrics and trajectory.
   */
  private async getDrift(url?: URL): Promise<object> {
    const commits = url ? this.parsePositiveInt(url.searchParams.get('commits')) || 20 : 20;
    const safeCommits = Math.max(1, Math.min(200, commits));
    const cacheKey = `drift::${this.currentRepoRoot}::${safeCommits}`;
    const cached = this.resultCache.get<object>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const drift = await this.engine.analyzeDrift({ commits: safeCommits });
      this.resultCache.set(cacheKey, drift, this.CACHE_TTL_MS);
      return drift;
    } catch (error) {
      console.error('Error getting drift metrics:', error);
      return {
        generatedAt: new Date().toISOString(),
        composite: { score: 0 },
        components: {
          boundary: { score: 0, weightedPoints: 0, violationCount: 0 },
          naming: { score: 0, weightedPoints: 0, violationCount: 0 },
          structural: { score: 0, weightedPoints: 0, violationCount: 0 },
          dependency: { score: 0, weightedPoints: 0, violationCount: 0 },
        },
        heatmap: { layers: [] },
        trajectory: {
          points: [],
          velocity: {
            delta: 0,
            slopePerCommit: 0,
            direction: 'stable',
          },
        },
        emergentConventions: [],
      };
    }
  }

  /**
   * Helper to compute ISO week year and week number for a given date.
   * Uses ISO-8601 definition: weeks start on Monday and week 1 is the week
   * with the year's first Thursday.
   */
  private getISOWeekYearAndWeek(date: Date): { year: number; week: number } {
    // Work in UTC to avoid timezone-related off-by-one errors
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

    // ISO weekday (1 = Monday, 7 = Sunday)
    const dayOfWeek = utcDate.getUTCDay() || 7;

    // Shift to Thursday of this week to determine the ISO week year
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayOfWeek);
    const isoYear = utcDate.getUTCFullYear();

    // First day of the ISO year (Jan 1st)
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));

    // Calculate ISO week number: count weeks starting from Jan 1
    const diffInDays = Math.floor((utcDate.getTime() - yearStart.getTime()) / 86400000);
    const isoWeek = Math.floor(diffInDays / 7) + 1;

    return { year: isoYear, week: isoWeek };
  }

  /**
   * Helper to get week key (YYYY-WW format)
   */
  private getWeekKey(date: Date): string {
    const { year, week } = this.getISOWeekYearAndWeek(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  /**
   * Get reason why file needs attention.
   *
   * These thresholds are tuned for the dashboard "needs attention" summary
   * and intentionally differ from analysis thresholds used elsewhere. They
   * should be kept in sync with any other dashboard-specific heuristics.
   */
  private getAttentionReason(file: any): string | null {
    const reasons: string[] = [];
    if ((file.score?.overall || 0) > DashboardServer.ATTENTION_COMPLEXITY_VERY_HIGH) {
      reasons.push('Very high complexity');
    } else if ((file.score?.overall || 0) > DashboardServer.ATTENTION_COMPLEXITY_HIGH) {
      reasons.push('High complexity');
    }
    if ((file.score?.cohesion || 1) < DashboardServer.ATTENTION_COHESION_LOW) {
      reasons.push('Low cohesion');
    }
    if ((file.score?.coupling || 0) > DashboardServer.ATTENTION_COUPLING_HIGH) {
      reasons.push('High coupling');
    }
    if ((file.metrics?.linesOfCode || 0) > DashboardServer.ATTENTION_LARGE_FILE_LINES) {
      reasons.push('Large file');
    }
    return reasons.length > 0 ? reasons.join(', ') : null;
  }

  /**
   * Get maintainability grade
   */
  private getMaintainabilityGrade(score: number): string {
    if (score >= 80) return 'A';
    if (score >= 60) return 'B';
    if (score >= 40) return 'C';
    if (score >= 20) return 'D';
    return 'F';
  }

  /**
   * Get technical debt grade
   */
  private getDebtGrade(score: number): string {
    if (score <= 10) return 'A';
    if (score <= 25) return 'B';
    if (score <= 50) return 'C';
    if (score <= 75) return 'D';
    return 'F';
  }

  /**
   * Simple MD5 hash for gravatar (simplified implementation)
   */
  private md5(str: string): string {
    // Use a simple hash for gravatar - in production you'd use crypto
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(32, '0');
  }

  /**
   * Get relative time string
   */
  private getRelativeTime(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
    return `${Math.floor(seconds / 2592000)} months ago`;
  }

  /**
   * Serve static files
   */
  private async serveStatic(pathname: string, res: http.ServerResponse): Promise<void> {
    // Default to index.html
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.resolve(this.staticDir, `.${filePath}`);

    // Security: prevent directory traversal
    if (!filePath.startsWith(this.staticDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const content = await fs.readFile(filePath);
      const contentType = this.getContentType(filePath);
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      // File not found - serve index.html for SPA routing
      try {
        const indexPath = path.join(this.staticDir, 'index.html');
        const content = await fs.readFile(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    }
  }

  /**
   * Get content type for file extension
   */
  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * Open browser to URL
   */
  private openBrowser(url: string): void {
    const platform = process.platform;

    let command: string;
    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, (error: Error | null) => {
      if (error) {
        console.log(`Open ${url} in your browser to view the dashboard.`);
      }
    });
  }

  private buildAllowedOrigins(host: string, port: number): Set<string> {
    const origins = new Set<string>();
    const envOrigins = process.env.CODEXIA_DASHBOARD_ALLOWED_ORIGINS;
    if (envOrigins) {
      for (const origin of envOrigins.split(',').map(o => o.trim()).filter(Boolean)) {
        origins.add(origin);
      }
      return origins;
    }

    const hostLabel = host === '0.0.0.0' ? 'localhost' : host;
    origins.add(`http://${hostLabel}:${port}`);
    origins.add(`http://localhost:${port}`);
    origins.add(`http://127.0.0.1:${port}`);
    return origins;
  }

  private applySecurityHeaders(res: http.ServerResponse): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: https://www.gravatar.com https://secure.gravatar.com https://*.gravatar.com https://avatars.githubusercontent.com https://ui-avatars.com; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'"
    );
  }

  private applyCors(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin;
    if (!origin) {
      return;
    }

    if (this.allowedOrigins.has('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (this.allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      return;
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Codexia-Token');
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    if (!this.authToken) {
      return true;
    }

    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers['x-codexia-token'];
    const token = typeof tokenHeader === 'string' ? tokenHeader : null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length) === this.authToken;
    }

    if (token) {
      return token === this.authToken;
    }

    return false;
  }

  private isRateLimited(req: http.IncomingMessage): boolean {
    const now = Date.now();
    for (const [k, v] of this.rateLimitBuckets) {
      if (v.resetAt < now) this.rateLimitBuckets.delete(k);
    }
    const key = this.getClientKey(req);
    const bucket = this.rateLimitBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      this.rateLimitBuckets.set(key, { count: 1, resetAt: now + this.rateLimitWindowMs });
      return false;
    }

    bucket.count += 1;
    return bucket.count > this.rateLimitMax;
  }

  private getClientKey(req: http.IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    return ip || 'unknown';
  }

  private logSecurityEvent(event: string, req: http.IncomingMessage, context?: Record<string, unknown>): void {
    const entry = {
      event,
      time: new Date().toISOString(),
      ip: this.getClientKey(req),
      method: req.method,
      path: req.url,
      ...context,
    };
    console.warn(`[security] ${JSON.stringify(entry)}`);
  }

  private normalizeDepth(value: string | null): number {
    const parsed = Number.parseInt(value || '3', 10);
    if (Number.isNaN(parsed)) {
      return 3;
    }
    return Math.max(1, Math.min(10, parsed));
  }

  private normalizeFocus(value: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 500) {
      return undefined;
    }

    if (path.isAbsolute(trimmed) || trimmed.includes('..') || trimmed.includes('\0')) {
      return undefined;
    }

    return trimmed;
  }

  private getJiraConfig(): object {
    return this.jira.getConfig();
  }

  private async getJiraBoards(url: URL): Promise<object> {
    const projectKey = this.normalizeProjectKey(url.searchParams.get('projectKey'));
    const limit = this.parsePositiveInt(url.searchParams.get('limit')) || 50;
    return this.jira.getBoards(projectKey, limit);
  }

  private async getJiraSprints(url: URL): Promise<object> {
    const boardId = this.parsePositiveInt(url.searchParams.get('boardId'));
    if (!boardId) {
      throw new Error('BadRequest: Missing or invalid boardId query parameter.');
    }

    const state = url.searchParams.get('state') || 'active,closed,future';
    const limit = this.parsePositiveInt(url.searchParams.get('limit')) || 50;
    return this.jira.getSprints(boardId, state, limit);
  }

  private async getJiraSprintReport(url: URL): Promise<object> {
    const boardId = this.parsePositiveInt(url.searchParams.get('boardId'));
    const sprintId = this.parsePositiveInt(url.searchParams.get('sprintId'));

    if (!boardId || !sprintId) {
      throw new Error('BadRequest: Missing or invalid boardId/sprintId query parameters.');
    }

    return this.jira.getSprintReport(boardId, sprintId);
  }

  private async getJiraBoardReport(url: URL): Promise<object> {
    const boardId = this.parsePositiveInt(url.searchParams.get('boardId'));
    if (!boardId) {
      throw new Error('BadRequest: Missing or invalid boardId query parameter.');
    }

    const maxSprints = this.parsePositiveInt(url.searchParams.get('maxSprints')) || 12;
    return this.jira.getBoardHistoryReport(boardId, maxSprints);
  }

  private async getJiraFlowReport(url: URL): Promise<object> {
    const lookbackDays = this.parsePositiveInt(url.searchParams.get('lookbackDays')) || 90;
    const boardIds = url.searchParams.getAll('boardId').map((value) => Number.parseInt(value, 10)).filter((value) => Number.isFinite(value) && value > 0);
    const projectKeys = url.searchParams
      .getAll('projectKey')
      .map((value) => this.normalizeProjectKey(value) || '')
      .filter(Boolean);

    return this.jira.getFlowSnapshot({
      boardIds,
      projectKeys,
      lookbackDays,
    });
  }

  private async getEngineeringConfig(): Promise<object> {
    return this.engineering.getConfig();
  }

  private async getEngineeringOverview(url: URL): Promise<object> {
    const lookbackDays = this.parsePositiveInt(url.searchParams.get('lookbackDays')) || 90;
    const refresh = this.shouldBypassCache(url);
    const cacheKey = this.buildEngineeringCacheKey('overview', lookbackDays);
    return this.getCachedOrInFlight({
      cacheKey,
      refresh,
      inflight: this.engineeringReportRequests,
      loader: () => this.engineering.getOverview(lookbackDays),
    });
  }

  private async getEngineeringTeams(): Promise<object> {
    const teams = await this.engineering.getTeams();
    return {
      teams,
      total: teams.length,
    };
  }

  private async getEngineeringTeamReport(url: URL): Promise<object> {
    const teamName = url.searchParams.get('team');
    const normalizedTeamName = teamName?.trim();
    if (!normalizedTeamName) {
      throw new Error('BadRequest: Missing team query parameter.');
    }

    const lookbackDays = this.parsePositiveInt(url.searchParams.get('lookbackDays')) || 90;
    const refresh = this.shouldBypassCache(url);
    const cacheKey = this.buildEngineeringCacheKey('team-report', lookbackDays, normalizedTeamName);
    return this.getCachedOrInFlight({
      cacheKey,
      refresh,
      inflight: this.engineeringReportRequests,
      loader: () => this.engineering.getTeamReport(normalizedTeamName, lookbackDays),
    });
  }

  private async getEngineeringRepoReport(url: URL): Promise<object> {
    const repo = url.searchParams.get('repo');
    const normalizedRepo = repo?.trim();
    if (!normalizedRepo) {
      throw new Error('BadRequest: Missing repo query parameter.');
    }

    const lookbackDays = this.parsePositiveInt(url.searchParams.get('lookbackDays')) || 90;
    const refresh = this.shouldBypassCache(url);
    const cacheKey = this.buildEngineeringCacheKey('repo-report', lookbackDays, normalizedRepo);
    return this.getCachedOrInFlight({
      cacheKey,
      refresh,
      inflight: this.engineeringReportRequests,
      loader: () => this.engineering.getRepoReport(normalizedRepo, lookbackDays),
    });
  }

  private async getJiraInsights(url: URL): Promise<object> {
    const boardId = this.parsePositiveInt(url.searchParams.get('boardId'));
    if (!boardId) {
      throw new Error('BadRequest: Missing or invalid boardId query parameter.');
    }

    const scopeParam = (url.searchParams.get('scope') || 'sprint').toLowerCase();
    const scope: 'sprint' | 'board' = scopeParam === 'board' ? 'board' : 'sprint';
    const maxSprints = this.parsePositiveInt(url.searchParams.get('maxSprints')) || 12;
    const sprintId = this.parsePositiveInt(url.searchParams.get('sprintId'));

    if (scope === 'sprint' && !sprintId) {
      throw new Error('BadRequest: Missing or invalid sprintId query parameter for sprint scope.');
    }

    const provider = getAIProvider();
    if (!provider) {
      throw new Error('BadRequest: AI is not configured. Set CODEXIA_AI_PROVIDER and provider credentials.');
    }

    const refresh = this.shouldBypassCache(url);
    const model = process.env.CODEXIA_AI_MODEL || 'default';
    const cacheKey = this.buildJiraInsightsCacheKey({
      boardId,
      maxSprints,
      model,
      providerName: provider.name,
      scope,
      sprintId: sprintId ?? undefined,
    });

    return this.getCachedOrInFlight({
      cacheKey,
      refresh,
      inflight: this.aiInsightRequests,
      loader: async () => {
        const prompt = scope === 'board'
          ? this.buildBoardInsightPrompt(await this.jira.getBoardHistoryReport(boardId, maxSprints))
          : this.buildSprintInsightPrompt(await this.jira.getSprintReport(boardId, sprintId!));

        const raw = await provider.complete(prompt, {
          temperature: 0.2,
          maxTokens: 1400,
        });

        const parsed = this.parseJiraInsightResponse(raw);

        return {
          scope,
          provider: provider.name,
          model,
          generatedAt: new Date().toISOString(),
          ...parsed,
          raw,
        };
      },
    });
  }

  private buildSprintInsightPrompt(report: JiraSprintReport): string {
    const reportJson = JSON.stringify(report, null, 2);

    return `You are a senior agile delivery analyst.

Analyze this Jira sprint report and produce practical insights.

Focus on:
1) Delivery confidence and whether the sprint is truly on track
2) Scope manipulation or estimate gaming signals
3) The highest-risk integrity findings
4) Concrete next actions for the team and scrum master

Return strict JSON only with this schema:
{
  "overview": "string",
  "positives": ["string"],
  "risks": ["string"],
  "integrityFindings": ["string"],
  "recommendations": ["string"],
  "questions": ["string"]
}

Rules:
- Keep each array between 2 and 6 bullets.
- Be evidence-based and reference metrics implicitly.
- Do not include markdown, headings, or code fences.

Sprint report:
${reportJson}`;
  }

  private buildBoardInsightPrompt(report: JiraBoardHistoryReport): string {
    const reportJson = JSON.stringify(report, null, 2);

    return `You are a senior agile governance analyst.

Analyze this Jira board history report across multiple sprints.

Focus on:
1) Repeating delivery patterns
2) Whether scope creep/churn indicates planning issues or gaming
3) Integrity trends and risk concentration
4) What leadership should do next sprint

Return strict JSON only with this schema:
{
  "overview": "string",
  "positives": ["string"],
  "risks": ["string"],
  "integrityFindings": ["string"],
  "recommendations": ["string"],
  "questions": ["string"]
}

Rules:
- Keep each array between 2 and 6 bullets.
- Be specific and data-driven.
- Do not include markdown, headings, or code fences.

Board report:
${reportJson}`;
  }

  private parseJiraInsightResponse(raw: string): {
    overview: string;
    positives: string[];
    risks: string[];
    integrityFindings: string[];
    recommendations: string[];
    questions: string[];
  } {
    const defaultResult = {
      overview: raw.trim() || 'AI response was empty.',
      positives: [] as string[],
      risks: [] as string[],
      integrityFindings: [] as string[],
      recommendations: [] as string[],
      questions: [] as string[],
    };

    const normalized = raw.trim();
    if (!normalized) {
      return defaultResult;
    }

    const jsonText = this.extractJsonFromText(normalized);
    if (!jsonText) {
      return defaultResult;
    }

    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      return {
        overview: typeof parsed.overview === 'string' && parsed.overview.trim() ? parsed.overview.trim() : defaultResult.overview,
        positives: this.normalizeInsightItems(parsed.positives),
        risks: this.normalizeInsightItems(parsed.risks),
        integrityFindings: this.normalizeInsightItems(parsed.integrityFindings),
        recommendations: this.normalizeInsightItems(parsed.recommendations),
        questions: this.normalizeInsightItems(parsed.questions),
      };
    } catch {
      return defaultResult;
    }
  }

  private shouldBypassCache(url: URL): boolean {
    return url.searchParams.get('refresh') === 'true';
  }

  private buildEngineeringCacheKey(
    kind: 'overview' | 'team-report' | 'repo-report',
    lookbackDays: number,
    value?: string,
  ): string {
    const normalizedValue = value?.trim() || '';
    return [
      'engineering',
      kind,
      this.currentRepoRoot,
      String(lookbackDays),
      normalizedValue,
    ].join('::');
  }

  private buildJiraInsightsCacheKey(args: {
    boardId: number;
    maxSprints: number;
    model: string;
    providerName: string;
    scope: 'sprint' | 'board';
    sprintId?: number;
  }): string {
    return [
      'ai',
      'jira-insights',
      this.currentRepoRoot,
      args.providerName,
      args.model,
      args.scope,
      String(args.boardId),
      String(args.maxSprints),
      String(args.sprintId || ''),
    ].join('::');
  }

  private async getCachedOrInFlight<T>({
    cacheKey,
    refresh = false,
    inflight,
    loader,
  }: {
    cacheKey: string;
    refresh?: boolean;
    inflight: Map<string, Promise<T>>;
    loader: () => Promise<T>;
  }): Promise<T> {
    const normalRequestKey = this.getRequestKey(cacheKey, false);
    const refreshRequestKey = this.getRequestKey(cacheKey, true);

    if (!refresh) {
      const cached = this.resultCache.get<T>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      const pending = inflight.get(normalRequestKey) || inflight.get(refreshRequestKey);
      if (pending) {
        return pending;
      }
    } else {
      const pending = inflight.get(refreshRequestKey);
      if (pending) {
        return pending;
      }
    }

    const requestKey = refresh ? refreshRequestKey : normalRequestKey;
    const sequence = ++this.requestSequence;
    this.latestRequestSequence.set(cacheKey, sequence);
    const request = (async () => {
      const result = await loader();
      if (this.latestRequestSequence.get(cacheKey) === sequence) {
        this.resultCache.set(cacheKey, result, this.CACHE_TTL_MS);
      }
      return result;
    })();

    inflight.set(requestKey, request);

    try {
      return await request;
    } finally {
      inflight.delete(requestKey);
    }
  }

  private getRequestKey(cacheKey: string, refresh: boolean): string {
    return `${cacheKey}::${refresh ? 'refresh' : 'normal'}`;
  }

  private extractJsonFromText(text: string): string | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) {
      return fenced[1].trim();
    }

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    return text.slice(start, end + 1).trim();
  }

  private normalizeInsightItems(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 6);
  }

  private parsePositiveInt(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private normalizeProjectKey(value: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    const cleaned = value.trim();
    if (!cleaned || cleaned.length > 50 || /[^A-Za-z0-9_-]/.test(cleaned)) {
      return undefined;
    }

    return cleaned;
  }

  private getRepoContext(): object {
    return {
      repoRoot: this.currentRepoRoot,
      repoName: path.basename(this.currentRepoRoot),
    };
  }

  private getRecentRepos(): object {
    return {
      repos: this.recentRepoRoots.map((repoPath) => ({
        path: repoPath,
        name: path.basename(repoPath),
        current: repoPath === this.currentRepoRoot,
      })),
    };
  }

  private async selectRepo(url: URL): Promise<object> {
    const repoPath = url.searchParams.get('repoPath');
    if (!repoPath) {
      throw new Error('BadRequest: Missing repoPath query parameter.');
    }

    return {
      jobId: this.startRepoSwitch(repoPath),
      message: `Started repository switch for ${repoPath}.`,
    };
  }

  private getRepoSwitchStatus(url: URL): object {
    const jobId = url.searchParams.get('jobId');
    if (!jobId) {
      throw new Error('BadRequest: Missing jobId query parameter.');
    }

    const snapshot = this.repoSwitchJobs.get(jobId);
    if (!snapshot) {
      throw new Error(`BadRequest: Unknown repo switch job "${jobId}".`);
    }

    return snapshot;
  }

  private async pickRepoPath(): Promise<object> {
    const pickedPath = await this.openDirectoryPicker();
    if (!pickedPath) {
      return { cancelled: true };
    }

    return {
      cancelled: false,
      repoPath: pickedPath,
      repoName: path.basename(pickedPath),
    };
  }

  private startRepoSwitch(repoPathInput: string): string {
    const { jobId } = this.repoSwitchJobs.start(repoPathInput, async (job) => {
      const resolved = await this.validateRepositoryPath(repoPathInput);
      job.update({
        phase: 'validating',
        progress: 15,
        message: 'Repository validated.',
      });

      if (resolved === this.currentRepoRoot) {
        job.update({
          phase: 'finalizing',
          progress: 95,
          message: 'Repository is already active.',
        });
        return {
          repoRoot: this.currentRepoRoot,
          repoName: path.basename(this.currentRepoRoot),
        };
      }

      const newGit = simpleGit(resolved);
      const newEngine = new CodexiaEngine({ repoRoot: resolved });
      await newEngine.initialize((progress) => {
        job.update({
          phase: progress.phase,
          progress: progress.progress,
          message: progress.message,
        });
      });

      job.update({
        phase: 'finalizing',
        progress: 95,
        message: 'Applying repository context.',
      });

      this.engine = newEngine;
      this.git = newGit;
      this.currentRepoRoot = resolved;
      this.engineering = new EngineeringIntelligenceService({
        repoRoot: this.currentRepoRoot,
        jira: this.jira,
        githubConfig: this.githubConfig,
      });
      this.addRecentRepo(resolved);
      this.resultCache.invalidate('');

      return {
        repoRoot: this.currentRepoRoot,
        repoName: path.basename(this.currentRepoRoot),
      };
    });

    return jobId;
  }

  private async validateRepositoryPath(repoPathInput: string): Promise<string> {
    const sanitizedInput = repoPathInput.trim();
    if (!sanitizedInput || sanitizedInput.length > 2000) {
      throw new Error('BadRequest: Invalid repository path.');
    }

    const resolved = path.resolve(sanitizedInput);

    let stat: import('node:fs').Stats;
    try {
      stat = await fs.stat(resolved);
    } catch {
      throw new Error('BadRequest: Repository path does not exist.');
    }

    if (!stat.isDirectory()) {
      throw new Error('BadRequest: Repository path must be a directory.');
    }

    const gitDir = path.join(resolved, '.git');
    let hasGitMarker = false;
    try {
      await fs.access(gitDir);
      hasGitMarker = true;
    } catch {
      hasGitMarker = false;
    }

    const newGit = simpleGit(resolved);
    let isRepo = false;
    try {
      isRepo = await newGit.checkIsRepo();
    } catch {
      isRepo = false;
    }

    if (!hasGitMarker && !isRepo) {
      throw new Error('BadRequest: Selected path is not a Git repository.');
    }

    return resolved;
  }

  private addRecentRepo(repoPath: string): void {
    this.recentRepoRoots = [
      repoPath,
      ...this.recentRepoRoots.filter((existing) => existing !== repoPath),
    ].slice(0, DashboardServer.MAX_RECENT_REPOS);
  }

  private async openDirectoryPicker(): Promise<string | null> {
    if (process.platform === 'darwin') {
      return this.openDirectoryPickerMac();
    }

    if (process.platform === 'win32') {
      return this.openDirectoryPickerWindows();
    }

    return this.openDirectoryPickerLinux();
  }

  private async openDirectoryPickerMac(): Promise<string | null> {
    try {
      const output = await this.execFileText('osascript', [
        '-e',
        'set chosenFolder to choose folder with prompt "Select a Git repository folder"',
        '-e',
        'POSIX path of chosenFolder',
      ]);
      const selected = output.trim();
      return selected || null;
    } catch (error) {
      if (this.isPickerCancelError(error)) {
        return null;
      }
      throw new Error(`BadRequest: Failed to open macOS folder picker (${this.getExecErrorMessage(error)}).`);
    }
  }

  private async openDirectoryPickerWindows(): Promise<string | null> {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
      '$dialog.Description = "Select a Git repository folder"',
      '$result = $dialog.ShowDialog()',
      'if ($result -eq [System.Windows.Forms.DialogResult]::OK) {',
      '  Write-Output $dialog.SelectedPath',
      '}',
    ].join('; ');

    try {
      const output = await this.execFileText('powershell', [
        '-NoProfile',
        '-Command',
        script,
      ]);
      const selected = output.trim();
      return selected || null;
    } catch (error) {
      if (this.isPickerCancelError(error)) {
        return null;
      }
      throw new Error(`BadRequest: Failed to open Windows folder picker (${this.getExecErrorMessage(error)}).`);
    }
  }

  private async openDirectoryPickerLinux(): Promise<string | null> {
    const home = process.env.HOME || '/';
    const pickers: Array<{ cmd: string; args: string[] }> = [
      { cmd: 'zenity', args: ['--file-selection', '--directory', '--title=Select a Git repository folder'] },
      { cmd: 'kdialog', args: ['--getexistingdirectory', home, '--title', 'Select a Git repository folder'] },
    ];

    let missingTools = 0;
    for (const picker of pickers) {
      try {
        const output = await this.execFileText(picker.cmd, picker.args);
        const selected = output.trim();
        return selected || null;
      } catch (error) {
        const message = this.getExecErrorMessage(error);
        if (message.includes('ENOENT')) {
          missingTools += 1;
          continue;
        }
        if (this.isPickerCancelError(error)) {
          return null;
        }
        throw new Error(`BadRequest: Failed to open Linux folder picker (${message}).`);
      }
    }

    if (missingTools === pickers.length) {
      throw new Error('BadRequest: No native folder picker found. Install zenity or kdialog, or enter the path manually.');
    }

    return null;
  }

  private execFileText(file: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(file, args, { encoding: 'utf8' }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout || '');
      });
    });
  }

  private isPickerCancelError(error: unknown): boolean {
    const anyError = error as { code?: number | string; message?: string; stderr?: string };
    const code = anyError?.code;
    const message = (anyError?.message || '').toLowerCase();
    const stderr = (anyError?.stderr || '').toLowerCase();

    if (message.includes('user canceled') || message.includes('user cancelled')) {
      return true;
    }

    if (stderr.includes('user canceled') || stderr.includes('user cancelled')) {
      return true;
    }

    return code === 1;
  }

  private getExecErrorMessage(error: unknown): string {
    const anyError = error as { message?: string; stderr?: string };
    return (anyError?.stderr || anyError?.message || 'Unknown error').trim();
  }
}

export const startDashboard = async (
  engine: CodexiaEngine,
  port: number,
  open = false,
  host?: string,
  repoRoot?: string,
  analyticsOptions: DashboardAnalyticsOptions = {},
): Promise<DashboardServer> => {
  const server = new DashboardServer(engine, repoRoot, analyticsOptions);
  await server.start({ port, open, host });
  return server;
};
