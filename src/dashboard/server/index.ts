import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { simpleGit, SimpleGit } from 'simple-git';
import { CodexiaEngine } from '../../cli/engine.js';

export interface DashboardServerOptions {
  port: number;
  open?: boolean;
}

/**
 * Dashboard REST API server
 */
export class DashboardServer {
  private server: http.Server | null = null;
  private engine: CodexiaEngine;
  private staticDir: string;
  private git: SimpleGit;

  constructor(engine: CodexiaEngine) {
    this.engine = engine;
    // Static files are built by Vite to src/dashboard/dist
    // Navigate from dist/dashboard/server -> project root -> src/dashboard/dist
    this.staticDir = path.join(import.meta.dirname, '../../../src/dashboard/dist');
    this.git = simpleGit(process.cwd());
  }

  /**
   * Start the dashboard server
   */
  async start(options: DashboardServerOptions): Promise<void> {
    const { port, open = false } = options;

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
      this.server!.listen(port, () => {
        console.log(`\n🚀 Codexia Dashboard running at http://localhost:${port}\n`);
        
        if (open) {
          this.openBrowser(`http://localhost:${port}`);
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

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith('/api/')) {
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
        case '/api/graph':
          data = await this.getGraph(url);
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
        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (error) {
      console.error('API error:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
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
      name: path.basename(process.cwd()),
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
   * Get dependency graph data
   */
  private async getGraph(url: URL): Promise<object> {
    const depth = parseInt(url.searchParams.get('depth') || '3', 10);
    const focus = url.searchParams.get('focus') || undefined;

    const graphData = await this.engine.getGraphData({ depth, focus });
    
    // Transform for visualization
    const nodes = graphData.nodes.map(n => ({
      id: n.path,
      label: path.basename(n.path),
      depth: n.depth,
      imports: n.imports.length,
      importedBy: n.importedBy.length,
    }));

    const edges = graphData.edges.map(e => ({
      source: e.from,
      target: e.to,
      kind: e.kind,
    }));

    return { nodes, edges };
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
  private async getLanguageStats(): Promise<object> {
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
  private async getContributors(url?: URL): Promise<object> {
    const { limit } = url ? this.getPaginationParams(url, 50) : { limit: 50 };
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

      return {
        contributors,
        totalContributors: contributorMap.size,
        activeContributors: allContributors.filter(c => c.isActive).length,
      };
    } catch (error) {
      console.error('Error getting contributors:', error);
      return { contributors: [], totalContributors: 0, activeContributors: 0 };
    }
  }

  /**
   * Get recent commits
   */
  private async getRecentCommits(url?: URL): Promise<object> {
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
  private async getBranches(): Promise<object> {
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
  private async getCommitActivity(): Promise<object> {
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

      return {
        activityByDate,
        activityByHour,
        activityByDayOfWeek,
        totalCommits: log.all.length,
        peakHour: peakHour.label,
        peakDay: peakDay.day,
        averagePerDay: (log.all.length / 365).toFixed(1),
      };
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
  private async getFileOwnership(url?: URL): Promise<object> {
    const { limit } = url ? this.getPaginationParams(url, 200) : { limit: 200 };
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

      for (const filePath of filePaths) {
        try {
          const log = await this.git.log({ file: filePath, maxCount: 100 });
          
          if (log.all.length === 0) continue;

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

          ownershipData.push({
            file: filePath,
            primaryOwner: primaryOwner?.name || 'Unknown',
            ownerEmail: primaryOwner?.email || '',
            ownership,
            contributors: authorCommits.size,
            lastModified: new Date(log.all[0].date).toISOString(),
            busFactor,
          });
        } catch {
          // Skip files with errors
        }
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

      return {
        files: filesResult,
        highRiskFiles,
        ownersByFiles,
        totalFiles: ownershipData.length,
        totalHighRiskFiles: allHighRiskFiles.length,
        averageBusFactor: ownershipData.length > 0 
          ? (ownershipData.reduce((sum, f) => sum + f.busFactor, 0) / ownershipData.length).toFixed(1)
          : '0',
      };
    } catch (error) {
      console.error('Error getting ownership:', error);
      return { files: [], highRiskFiles: [], ownersByFiles: [], totalFiles: 0, totalHighRiskFiles: 0, averageBusFactor: '0' };
    }
  }

  /**
   * Get code health metrics (maintainability, technical debt, etc.)
   */
  private async getCodeHealth(): Promise<object> {
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
      const highComplexityFiles = allFiles.filter(f => (f.score?.overall || 0) > 60);
      const lowCohesionFiles = allFiles.filter(f => (f.score?.cohesion || 0) < 0.3);
      const highCouplingFiles = allFiles.filter(f => (f.score?.coupling || 0) > 50);
      
      // Signal-based debt
      const errorSignals = signals.filter(s => s.severity === 'error');
      const warningSignals = signals.filter(s => s.severity === 'warning');
      
      // Calculate technical debt score (0-100, lower is better)
      const debtScore = Math.min(100, 
        (highComplexityFiles.length / Math.max(1, totalFiles)) * 30 +
        (lowCohesionFiles.length / Math.max(1, totalFiles)) * 20 +
        (highCouplingFiles.length / Math.max(1, totalFiles)) * 20 +
        (errorSignals.length * 3) +
        (warningSignals.length * 1)
      );
      
      // Calculate lines of code
      const totalLines = allFiles.reduce((sum, f) => sum + (f.metrics?.linesOfCode || 0), 0);
      const avgLinesPerFile = totalFiles > 0 ? Math.round(totalLines / totalFiles) : 0;
      
      // Get top files needing attention
      const filesNeedingAttention = allFiles
        .map(f => ({
          file: f.path,
          score: f.score?.overall || 0,
          maintainability: f.score?.maintainabilityIndex || 0,
          lines: f.metrics?.linesOfCode || 0,
          reason: this.getAttentionReason(f),
        }))
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
  private async getVelocityMetrics(): Promise<object> {
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
      
      return {
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
   * Helper to get week key (YYYY-WW format)
   */
  private getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const onejan = new Date(year, 0, 1);
    const week = Math.ceil((((date.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  /**
   * Get reason why file needs attention
   */
  private getAttentionReason(file: any): string | null {
    const reasons: string[] = [];
    if ((file.score?.overall || 0) > 25) reasons.push('Very high complexity');
    else if ((file.score?.overall || 0) > 20) reasons.push('High complexity');
    if ((file.score?.cohesion || 1) < 0.3) reasons.push('Low cohesion');
    if ((file.score?.coupling || 0) > 50) reasons.push('High coupling');
    if ((file.metrics?.linesOfCode || 0) > 500) reasons.push('Large file');
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
    filePath = path.join(this.staticDir, filePath);

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
}

/**
 * Start the dashboard server
 */
export async function startDashboard(engine: CodexiaEngine, port: number, open = false): Promise<DashboardServer> {
  const server = new DashboardServer(engine);
  await server.start({ port, open });
  return server;
}
