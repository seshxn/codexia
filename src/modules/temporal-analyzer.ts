import { simpleGit, SimpleGit } from 'simple-git';


// ============================================================================
// Temporal Analysis Types
// ============================================================================

export interface TemporalInsights {
  path: string;
  stabilityScore: number;        // 0-100, higher = more stable
  churnRate: number;             // Changes per day
  regressionProne: boolean;      // Often gets bug fixes after changes
  ownershipRisk: number;         // Bus factor risk (0-100)
  couplingTrend: 'increasing' | 'stable' | 'decreasing';
  hotspotScore: number;          // Combination of churn + complexity
  ageInDays: number;
  lastModified: Date;
  contributors: ContributorInsight[];
  changePatterns: ChangePattern[];
}

export interface ContributorInsight {
  name: string;
  email: string;
  commits: number;
  additions: number;
  deletions: number;
  firstCommit: Date;
  lastCommit: Date;
  ownership: number;  // Percentage of code owned
  isActive: boolean;  // Committed in last 30 days
}

export interface ChangePattern {
  type: 'bugfix' | 'feature' | 'refactor' | 'chore' | 'unknown';
  count: number;
  recentCount: number;  // Last 30 days
}

export interface FileCoChange {
  path: string;
  coChangeCount: number;
  coChangeRatio: number;  // How often they change together
}

export interface TemporalAnalysisResult {
  files: Map<string, TemporalInsights>;
  hotspots: string[];           // Files that are both complex and frequently changed
  riskFiles: string[];          // Files with ownership risk
  staleFiles: string[];         // Files not touched in a long time
  coChangeClusters: FileCoChange[][];  // Groups of files that change together
}

// ============================================================================
// Temporal Analyzer
// ============================================================================

export class TemporalAnalyzer {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  /**
   * Analyze temporal patterns for a file
   */
  async analyzeFile(filePath: string, daysBack: number = 180): Promise<TemporalInsights> {
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    
    const log = await this.git.log({
      file: filePath,
      '--since': since.toISOString(),
    });

    const allTimeLog = await this.git.log({
      file: filePath,
      maxCount: 500,
    });

    const commits = log.all;
    const allCommits = allTimeLog.all;

    // Calculate contributors
    const contributorMap = new Map<string, ContributorInsight>();
    for (const commit of allCommits) {
      const key = commit.author_email;
      const existing = contributorMap.get(key);
      
      if (existing) {
        existing.commits++;
        existing.lastCommit = new Date(Math.max(
          existing.lastCommit.getTime(),
          new Date(commit.date).getTime()
        ));
        existing.firstCommit = new Date(Math.min(
          existing.firstCommit.getTime(),
          new Date(commit.date).getTime()
        ));
      } else {
        contributorMap.set(key, {
          name: commit.author_name,
          email: commit.author_email,
          commits: 1,
          additions: 0,
          deletions: 0,
          firstCommit: new Date(commit.date),
          lastCommit: new Date(commit.date),
          ownership: 0,
          isActive: new Date(commit.date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        });
      }
    }

    // Calculate ownership percentages
    const totalCommits = allCommits.length;
    for (const contributor of contributorMap.values()) {
      contributor.ownership = totalCommits > 0 
        ? Math.round((contributor.commits / totalCommits) * 100) 
        : 0;
    }

    const contributors = Array.from(contributorMap.values())
      .sort((a, b) => b.commits - a.commits);

    // Analyze change patterns
    const patterns = this.analyzeChangePatterns([...allCommits]);

    // Calculate stability score
    const recentChanges = commits.length;
    const churnRate = recentChanges / daysBack;
    const stabilityScore = Math.max(0, 100 - churnRate * 100);

    // Detect regression-prone files (lots of "fix" commits)
    const bugfixRatio = patterns.find(p => p.type === 'bugfix')?.count || 0;
    const regressionProne = totalCommits > 5 && (bugfixRatio / totalCommits) > 0.3;

    // Ownership risk (bus factor)
    const activeContributors = contributors.filter(c => c.isActive);
    const topContributorOwnership = contributors[0]?.ownership || 0;
    const ownershipRisk = Math.min(100, Math.max(0,
      (topContributorOwnership > 80 ? 50 : 0) +
      (activeContributors.length <= 1 ? 30 : 0) +
      (activeContributors.length === 0 ? 20 : 0)
    ));

    // Coupling trend (simplified - based on recent vs old commit frequency)
    const midpoint = Math.floor(commits.length / 2);
    const recentHalf = commits.slice(0, midpoint).length;
    const olderHalf = commits.slice(midpoint).length;
    const couplingTrend: 'increasing' | 'stable' | 'decreasing' = 
      recentHalf > olderHalf * 1.5 ? 'increasing' :
      olderHalf > recentHalf * 1.5 ? 'decreasing' : 'stable';

    // File age
    const firstCommitDate = allCommits.length > 0 
      ? new Date(allCommits[allCommits.length - 1].date)
      : new Date();
    const ageInDays = Math.floor(
      (Date.now() - firstCommitDate.getTime()) / (24 * 60 * 60 * 1000)
    );

    const lastModified = allCommits.length > 0
      ? new Date(allCommits[0].date)
      : new Date();

    return {
      path: filePath,
      stabilityScore: Math.round(stabilityScore),
      churnRate: Math.round(churnRate * 1000) / 1000,
      regressionProne,
      ownershipRisk,
      couplingTrend,
      hotspotScore: 0, // Calculated later with complexity data
      ageInDays,
      lastModified,
      contributors,
      changePatterns: patterns,
    };
  }

  /**
   * Analyze multiple files and find patterns
   */
  async analyzeAll(
    filePaths: string[],
    complexityScores?: Map<string, number>
  ): Promise<TemporalAnalysisResult> {
    const files = new Map<string, TemporalInsights>();

    // Analyze each file
    for (const filePath of filePaths) {
      try {
        const insights = await this.analyzeFile(filePath);
        
        // Calculate hotspot score if complexity data available
        if (complexityScores) {
          const complexity = complexityScores.get(filePath) || 50;
          insights.hotspotScore = Math.round(
            (100 - insights.stabilityScore) * 0.5 + 
            (100 - complexity) * 0.5
          );
        }
        
        files.set(filePath, insights);
      } catch {
        // Skip files with no git history
      }
    }

    // Find hotspots (high churn + low stability)
    const hotspots = Array.from(files.entries())
      .filter(([_, insights]) => 
        insights.stabilityScore < 50 && insights.hotspotScore > 60
      )
      .sort((a, b) => b[1].hotspotScore - a[1].hotspotScore)
      .slice(0, 10)
      .map(([path]) => path);

    // Find risk files (ownership issues)
    const riskFiles = Array.from(files.entries())
      .filter(([_, insights]) => insights.ownershipRisk > 50)
      .sort((a, b) => b[1].ownershipRisk - a[1].ownershipRisk)
      .slice(0, 10)
      .map(([path]) => path);

    // Find stale files (not modified in 180+ days)
    const staleFiles = Array.from(files.entries())
      .filter(([_, insights]) => {
        const daysSinceModified = 
          (Date.now() - insights.lastModified.getTime()) / (24 * 60 * 60 * 1000);
        return daysSinceModified > 180;
      })
      .map(([path]) => path);

    // Find co-change clusters
    const coChangeClusters = await this.findCoChangeClusters(filePaths);

    return {
      files,
      hotspots,
      riskFiles,
      staleFiles,
      coChangeClusters,
    };
  }

  /**
   * Find files that frequently change together
   */
  async findCoChangeClusters(filePaths: string[]): Promise<FileCoChange[][]> {
    const coChangeMatrix = new Map<string, Map<string, number>>();
    const fileCommits = new Map<string, Set<string>>();

    // Get commits for each file
    for (const filePath of filePaths.slice(0, 100)) {
      try {
        const log = await this.git.log({
          file: filePath,
          maxCount: 50,
        });
        fileCommits.set(filePath, new Set(log.all.map(c => c.hash)));
      } catch {
        // Skip files with no history
      }
    }

    // Build co-change matrix
    const fileList = Array.from(fileCommits.keys());
    for (let i = 0; i < fileList.length; i++) {
      for (let j = i + 1; j < fileList.length; j++) {
        const file1 = fileList[i];
        const file2 = fileList[j];
        const commits1 = fileCommits.get(file1)!;
        const commits2 = fileCommits.get(file2)!;

        // Count shared commits
        let shared = 0;
        for (const hash of commits1) {
          if (commits2.has(hash)) shared++;
        }

        if (shared > 2) {
          const ratio = shared / Math.min(commits1.size, commits2.size);
          
          if (!coChangeMatrix.has(file1)) {
            coChangeMatrix.set(file1, new Map());
          }
          coChangeMatrix.get(file1)!.set(file2, ratio);
        }
      }
    }

    // Cluster files by co-change
    const clusters: FileCoChange[][] = [];
    const visited = new Set<string>();

    for (const [file, related] of coChangeMatrix) {
      if (visited.has(file)) continue;
      
      const cluster: FileCoChange[] = [{
        path: file,
        coChangeCount: 0,
        coChangeRatio: 1,
      }];
      visited.add(file);

      for (const [relatedFile, ratio] of related) {
        if (!visited.has(relatedFile) && ratio > 0.3) {
          cluster.push({
            path: relatedFile,
            coChangeCount: Math.round(ratio * 100),
            coChangeRatio: ratio,
          });
          visited.add(relatedFile);
        }
      }

      if (cluster.length > 1) {
        clusters.push(cluster);
      }
    }

    return clusters.sort((a, b) => b.length - a.length).slice(0, 5);
  }

  /**
   * Analyze commit message patterns
   */
  private analyzeChangePatterns(
    commits: Array<{ message: string; date: string }>
  ): ChangePattern[] {
    const patterns: Map<ChangePattern['type'], { count: number; recentCount: number }> = new Map([
      ['bugfix', { count: 0, recentCount: 0 }],
      ['feature', { count: 0, recentCount: 0 }],
      ['refactor', { count: 0, recentCount: 0 }],
      ['chore', { count: 0, recentCount: 0 }],
      ['unknown', { count: 0, recentCount: 0 }],
    ]);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const commit of commits) {
      const message = commit.message.toLowerCase();
      const isRecent = new Date(commit.date).getTime() > thirtyDaysAgo;
      
      let type: ChangePattern['type'] = 'unknown';
      
      if (/\b(fix|bug|patch|hotfix|issue)\b/.test(message)) {
        type = 'bugfix';
      } else if (/\b(feat|feature|add|implement|new)\b/.test(message)) {
        type = 'feature';
      } else if (/\b(refactor|clean|improve|optimize)\b/.test(message)) {
        type = 'refactor';
      } else if (/\b(chore|deps|update|bump|ci|test)\b/.test(message)) {
        type = 'chore';
      }

      const pattern = patterns.get(type)!;
      pattern.count++;
      if (isRecent) pattern.recentCount++;
    }

    return Array.from(patterns.entries())
      .map(([type, data]) => ({
        type,
        count: data.count,
        recentCount: data.recentCount,
      }))
      .filter(p => p.count > 0);
  }

  /**
   * Get blame information for a file
   */
  async getBlameInsights(filePath: string): Promise<BlameInsight[]> {
    try {
      const blame = await this.git.raw(['blame', '--line-porcelain', filePath]);
      const insights: BlameInsight[] = [];
      const authorLines = new Map<string, number>();
      
      const lines = blame.split('\n');
      let currentAuthor = '';
      
      for (const line of lines) {
        if (line.startsWith('author ')) {
          currentAuthor = line.slice(7);
          authorLines.set(currentAuthor, (authorLines.get(currentAuthor) || 0) + 1);
        }
      }

      for (const [author, lineCount] of authorLines) {
        insights.push({
          author,
          lineCount,
          percentage: 0, // Calculate after
        });
      }

      const totalLines = insights.reduce((sum, i) => sum + i.lineCount, 0);
      for (const insight of insights) {
        insight.percentage = Math.round((insight.lineCount / totalLines) * 100);
      }

      return insights.sort((a, b) => b.lineCount - a.lineCount);
    } catch {
      return [];
    }
  }
}

export interface BlameInsight {
  author: string;
  lineCount: number;
  percentage: number;
}
