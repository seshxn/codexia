import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { MemoryLoader } from './memory-loader.js';

// Mock fs module
vi.mock('node:fs/promises');

describe('MemoryLoader', () => {
  let loader: MemoryLoader;
  const repoRoot = '/test/repo';

  beforeEach(() => {
    loader = new MemoryLoader(repoRoot);
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hasMemory', () => {
    it('should return true if .codexia exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      expect(await loader.hasMemory()).toBe(true);
    });

    it('should return false if .codexia does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      expect(await loader.hasMemory()).toBe(false);
    });
  });

  describe('loadArchitecture', () => {
    it('should parse architecture file', async () => {
      const content = `# Architecture

## Layers

- **CLI**: Command-line interface
  - \`src/cli/**\`
  - depends on: Core, Modules

- **Core**: Core logic
  - \`src/core/**\`

## Entry Points

- src/index.ts
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const arch = await loader.loadArchitecture();

      expect(arch.layers).toHaveLength(2);
      expect(arch.layers[0].name).toBe('CLI');
      expect(arch.layers[0].description).toBe('Command-line interface');
      expect(arch.entryPoints).toContain('src/index.ts');
    });

    it('should return empty architecture if file missing', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const arch = await loader.loadArchitecture();

      expect(arch.layers).toHaveLength(0);
      expect(arch.boundaries).toHaveLength(0);
    });
  });

  describe('loadConventions', () => {
    it('should parse conventions file', async () => {
      const content = `# Conventions

## Naming Conventions

- Classes: \`PascalCase\`
- Functions: \`camelCase\`

## File Structure

- One class per file
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const conv = await loader.loadConventions();

      expect(conv.naming.length).toBeGreaterThan(0);
      expect(conv.structure.length).toBeGreaterThan(0);
    });
  });

  describe('loadInvariants', () => {
    it('should parse invariants file', async () => {
      const content = `# Invariants

### No direct DB access

The CLI must not directly access the database.

### All APIs typed

All exported APIs must have explicit types.
`;

      vi.mocked(fs.readFile).mockResolvedValue(content);

      const inv = await loader.loadInvariants();

      expect(inv.rules).toHaveLength(2);
      expect(inv.rules[0].id).toBe('No direct DB access');
    });
  });

  describe('loadAdrs', () => {
    it('should return empty array if ADR directory missing', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

      const adrs = await loader.loadAdrs();
      expect(adrs).toHaveLength(0);
    });
  });

  describe('loadMemory', () => {
    it('should return null if no memory directory', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const memory = await loader.loadMemory();
      expect(memory).toBeNull();
    });

    it('should load all memory sections', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('# Empty');
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const memory = await loader.loadMemory();

      expect(memory).not.toBeNull();
      expect(memory).toHaveProperty('architecture');
      expect(memory).toHaveProperty('conventions');
      expect(memory).toHaveProperty('invariants');
      expect(memory).toHaveProperty('adrs');
    });
  });
});
