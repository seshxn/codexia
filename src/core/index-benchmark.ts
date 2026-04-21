import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { CodexiaEngine } from '../cli/engine.js';

export interface TimedBenchmarkMetric {
  durationMs: number;
  rssBytes: number;
}

export interface IndexBenchmarkOptions {
  query: string;
  contextFile?: string;
  changedFiles?: string[];
}

export interface IndexBenchmarkResult {
  repoRoot: string;
  generatedAt: string;
  analyze: TimedBenchmarkMetric & {
    stats: {
      files: number;
      symbols: number;
      exports: number;
      avgFanOut: number;
    };
  };
  update: TimedBenchmarkMetric & {
    changedFiles: string[];
  };
  graph: Record<string, unknown>;
  mcpLike: {
    graphStats: TimedBenchmarkMetric;
    context: TimedBenchmarkMetric & { resultCount: number };
    queryGraph: TimedBenchmarkMetric & { resultCount: number };
    semanticSearch: TimedBenchmarkMetric & { resultCount: number };
    cypher: TimedBenchmarkMetric & { resultCount: number };
  };
}

async function measure<T>(operation: () => Promise<T>): Promise<TimedBenchmarkMetric & { value: T }> {
  const start = performance.now();
  const value = await operation();
  return {
    value,
    durationMs: Math.max(0, Math.round((performance.now() - start) * 100) / 100),
    rssBytes: process.memoryUsage().rss,
  };
}

const countResult = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length;
  }
  return 0;
};

const graphCountsFromStats = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const graph = (value as { graph?: unknown }).graph;
  return graph && typeof graph === 'object' ? graph as Record<string, unknown> : {};
};

export async function runIndexBenchmark(
  repoRoot: string,
  options: IndexBenchmarkOptions
): Promise<IndexBenchmarkResult> {
  const engine = new CodexiaEngine({ repoRoot });

  const analyze = await measure(() => engine.analyzeRepository({ force: true }));
  const indexedFiles = Array.from(engine.getFiles().keys());
  const contextFile = options.contextFile || indexedFiles[0];
  if (!contextFile) {
    throw new Error('Cannot benchmark context lookup because no files were indexed');
  }

  const changedFiles = options.changedFiles || [];
  for (const file of changedFiles) {
    await fs.appendFile(
      path.join(repoRoot, file),
      `\nexport const BENCHMARK_TOUCH_${Date.now().toString(36)} = true;\n`,
      'utf-8'
    );
  }

  const update = await measure(() => engine.updateRepository());
  const graphStats = await measure(() => engine.getGraphStats());
  const context = await measure(() => engine.getCodeContext({ file: contextFile }));
  const queryGraph = await measure(() => engine.queryGraph(options.query, 10));
  const semanticSearch = await measure(() => engine.semanticSearch(options.query, 10));
  const cypher = await measure(() =>
    engine.executePseudoCypher('MATCH (f:File) RETURN f.path AS path LIMIT 10')
  );

  return {
    repoRoot,
    generatedAt: new Date().toISOString(),
    analyze: {
      durationMs: analyze.durationMs,
      rssBytes: analyze.rssBytes,
      stats: analyze.value.stats,
    },
    update: {
      durationMs: update.durationMs,
      rssBytes: update.rssBytes,
      changedFiles,
    },
    graph: graphCountsFromStats(graphStats.value),
    mcpLike: {
      graphStats: {
        durationMs: graphStats.durationMs,
        rssBytes: graphStats.rssBytes,
      },
      context: {
        durationMs: context.durationMs,
        rssBytes: context.rssBytes,
        resultCount: countResult(context.value),
      },
      queryGraph: {
        durationMs: queryGraph.durationMs,
        rssBytes: queryGraph.rssBytes,
        resultCount: queryGraph.value.length,
      },
      semanticSearch: {
        durationMs: semanticSearch.durationMs,
        rssBytes: semanticSearch.rssBytes,
        resultCount: semanticSearch.value.length,
      },
      cypher: {
        durationMs: cypher.durationMs,
        rssBytes: cypher.rssBytes,
        resultCount: countResult(cypher.value.rows),
      },
    },
  };
}
