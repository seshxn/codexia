import type { CommitRecord, FileInfo } from './types.js';

export type QueryRow = Record<string, unknown>;

export interface DependencyGraphReader {
  getDependencies(filePath: string): string[];
}

export interface DependencyGraphUpdateReader extends DependencyGraphReader {
  getDependents(filePath: string): string[];
}

export interface GraphStoreBuildMetrics {
  files: number;
  functions: number;
  classes: number;
  types: number;
  modules: number;
  relationships: number;
  durationMs: number;
}

export interface GraphStoreAdapter {
  initialize(): Promise<void>;
  rebuild(files: Map<string, FileInfo>, dependencyGraph: DependencyGraphReader): Promise<GraphStoreBuildMetrics>;
  updateFiles(
    files: Map<string, FileInfo>,
    dependencyGraph: DependencyGraphUpdateReader,
    changedFiles: string[],
    deletedFiles: string[]
  ): Promise<GraphStoreBuildMetrics>;
  syncTemporalData(files: Map<string, FileInfo>, commits: CommitRecord[]): Promise<GraphStoreBuildMetrics>;
  syncTemporalDataForFiles(
    files: Map<string, FileInfo>,
    commits: CommitRecord[],
    targetFiles: string[]
  ): Promise<GraphStoreBuildMetrics>;
  queryText(search: string, limit?: number): Promise<QueryRow[]>;
  getFileContext(filePath: string): Promise<QueryRow[]>;
  getSymbolContext(symbolName: string): Promise<QueryRow[]>;
  getHistoryForTarget(target: string): Promise<QueryRow[]>;
  getDependents(filePath: string): Promise<QueryRow[]>;
  getDependencies(filePath: string): Promise<QueryRow[]>;
  getBlastRadius(files: string[], depth: number): Promise<Array<{ depth: number; files: string[] }>>;
  getTestsForSymbol(symbolName: string): Promise<QueryRow[]>;
  getStats(): Promise<QueryRow>;
  runReadOnlyCypher(query: string, options?: { limit?: number }): Promise<QueryRow[]>;
  close(): Promise<void>;
}
