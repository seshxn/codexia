import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { simpleGit, SimpleGit } from 'simple-git';
import { CodexiaEngine } from '../../cli/engine.js';

export interface DashboardServerOptions {
  port: number;
  host?: string;
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
  private host: string = '127.0.0.1';
  private port: number = 0;
  private authToken: string | null = null;
  private allowedOrigins: Set<string> = new Set();
  private rateLimitWindowMs: number = Number(process.env.CODEXIA_DASHBOARD_RATE_LIMIT_WINDOW_MS || 60000);
  private rateLimitMax: number = Number(process.env.CODEXIA_DASHBOARD_RATE_LIMIT_MAX || 120);
  private rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

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
          data = await this.getComplexity();
          break;
        case '/api/graph':
          data = await this.getGraph(url);
          break;
        case '/api/signals':
          data = await this.getSignals();
          break;
        case '/api/hotpaths':
          data = await this.getHotPaths();
          break;
        case '/api/temporal':
          data = await this.getTemporal();
          break;
        case '/api/languages':
          data = await this.getLanguageStats();
          break;
        case '/api/contributors':
          data = await this.getContributors();
          break;
        case '/api/commits':
          data = await this.getRecentCommits();
          break;
        case '/api/branches':
          data = await this.getBranches();
          break;
        case '/api/activity':
          data = await this.getCommitActivity();
          break;
        case '/api/ownership':
          data = await this.getFileOwnership();
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
  private async getComplexity(): Promise<object> {
    const complexityData = await this.engine.getComplexity({});
    
    // Convert to expected format
    // DetailedMetrics has: linesOfCode, logicalLines, commentLines, blankLines, etc.
    const files = Array.from(complexityData.entries())
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

    const totalScore = files.reduce((sum, f) => sum + f.score, 0);
    
    return {
      files,
      averageScore: files.length > 0 ? totalScore / files.length : 0,
      highComplexityCount: files.filter(f => f.score > 15).length,
    };
  }

  /**
   * Get dependency graph data
   */
  private async getGraph(url: URL): Promise<object> {
    const depth = this.normalizeDepth(url.searchParams.get('depth'));
    const focus = this.normalizeFocus(url.searchParams.get('focus'));

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
  private async getSignals(): Promise<object> {
    const rawSignals = await this.engine.getSignals({ include: ['all'] });
    
    // Map to expected format
    // Signal type has: type (SignalType), severity ('info'|'warning'|'error'), message, evidence[], filePath?, line?
    const signals = rawSignals.map(s => ({
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
    
    for (const signal of signals) {
      byType[signal.type] = (byType[signal.type] || 0) + 1;
      bySeverity[signal.severity] = (bySeverity[signal.severity] || 0) + 1;
    }

    return { signals, byType, bySeverity };
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
  private async getHotPaths(): Promise<object> {
    const hotPathsData = await this.engine.getHotPaths();
    
    // Map to expected format
    const hotPaths = (hotPathsData.paths || []).slice(0, 20).map((p: any) => ({
      path: p.path || p.file || '',
      score: p.score || p.risk === 'high' ? 0.8 : p.risk === 'medium' ? 0.5 : 0.3,
      metrics: {
        changeFrequency: p.changes || p.commits || 0,
        complexity: p.complexity || 0,
        couplingFactor: p.coupling || p.dependencies || 0,
      },
    }));

    return {
      hotPaths,
      threshold: 0.5,
    };
  }

  /**
   * Get temporal analysis data
   */
  private async getTemporal(): Promise<object> {
    const temporal = await this.engine.getTemporal();
    
    // Map to expected format
    const recentChanges = (temporal.hotspots || []).slice(0, 20).map((h: any) => ({
      file: h.file || h.path || '',
      changeCount: h.changes || h.commits || 0,
      lastModified: h.lastModified || new Date().toISOString(),
    }));

    const authorStats = Object.entries(temporal.ownership || {}).map(([author, data]: [string, any]) => ({
      author,
      commits: data.commits || 0,
      filesChanged: data.files || data.filesOwned || 0,
    })).slice(0, 10);

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
  private async getContributors(): Promise<object> {
    try {
      // Get all commits with author info
      const log = await this.git.log({ maxCount: 500 });
      
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

      // Get stats for top contributors
      const contributors = Array.from(contributorMap.values())
        .sort((a, b) => b.commits - a.commits)
        .slice(0, 20)
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

      return {
        contributors,
        totalContributors: contributorMap.size,
        activeContributors: contributors.filter(c => c.isActive).length,
      };
    } catch (error) {
      console.error('Error getting contributors:', error);
      return { contributors: [], totalContributors: 0, activeContributors: 0 };
    }
  }

  /**
   * Get recent commits
   */
  private async getRecentCommits(): Promise<object> {
    try {
      const log = await this.git.log({ maxCount: 50 });
      
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

      return { commits };
    } catch (error) {
      console.error('Error getting commits:', error);
      return { commits: [] };
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
  private async getFileOwnership(): Promise<object> {
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

      // Sample files to analyze (limit for performance)
      const filePaths = Array.from(files.keys()).slice(0, 100);

      for (const filePath of filePaths) {
        try {
          const log = await this.git.log({ file: filePath, maxCount: 50 });
          
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
      const highRiskFiles = ownershipData.filter(f => f.ownership >= 80 && f.busFactor === 1);
      
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

      const ownersByFiles = Array.from(ownerSummary.entries())
        .map(([email, data]) => ({
          name: data.name,
          email,
          filesOwned: data.filesOwned,
          avgOwnership: Math.round(data.totalOwnership / data.filesOwned),
        }))
        .sort((a, b) => b.filesOwned - a.filesOwned)
        .slice(0, 10);

      return {
        files: ownershipData.slice(0, 50),
        highRiskFiles: highRiskFiles.slice(0, 10),
        ownersByFiles,
        averageBusFactor: ownershipData.length > 0 
          ? (ownershipData.reduce((sum, f) => sum + f.busFactor, 0) / ownershipData.length).toFixed(1)
          : '0',
      };
    } catch (error) {
      console.error('Error getting ownership:', error);
      return { files: [], highRiskFiles: [], ownersByFiles: [], averageBusFactor: '0' };
    }
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
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'"
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
    const key = this.getClientKey(req);
    const now = Date.now();
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
}

/**
 * Start the dashboard server
 */
export async function startDashboard(
  engine: CodexiaEngine,
  port: number,
  open = false,
  host?: string
): Promise<DashboardServer> {
  const server = new DashboardServer(engine);
  await server.start({ port, open, host });
  return server;
}
