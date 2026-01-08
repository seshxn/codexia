import { describe, it, expect, beforeEach } from 'vitest';
import { RepoIndexer } from './repo-indexer.js';

describe('RepoIndexer', () => {
  let indexer: RepoIndexer;

  beforeEach(() => {
    indexer = new RepoIndexer(process.cwd());
  });

  it('should create an indexer instance', () => {
    expect(indexer).toBeDefined();
  });

  it('should not be indexed initially', () => {
    expect(indexer.isIndexed()).toBe(false);
  });

  it('should index the repository', async () => {
    await indexer.index();
    expect(indexer.isIndexed()).toBe(true);
  });

  it('should find files after indexing', async () => {
    await indexer.index();
    const files = indexer.getFiles();
    expect(files.size).toBeGreaterThan(0);
  });

  it('should return stats after indexing', async () => {
    await indexer.index();
    const stats = indexer.getStats();
    
    expect(stats.files).toBeGreaterThan(0);
    expect(stats.symbols).toBeGreaterThanOrEqual(0);
    expect(stats.exports).toBeGreaterThanOrEqual(0);
    expect(typeof stats.avgFanOut).toBe('number');
  });
});
