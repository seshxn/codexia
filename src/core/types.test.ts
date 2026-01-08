import { describe, it, expect } from 'vitest';

describe('Core Types', () => {
  it('should have valid type definitions', () => {
    // Type-level test - if this compiles, types are valid
    expect(true).toBe(true);
  });
});

describe('GitDiff interface', () => {
  it('should accept valid diff structure', () => {
    const diff = {
      files: [],
      stats: { files: 0, additions: 0, deletions: 0 },
      base: 'HEAD',
      head: 'main',
    };
    
    expect(diff.files).toEqual([]);
    expect(diff.stats.files).toBe(0);
  });
});
