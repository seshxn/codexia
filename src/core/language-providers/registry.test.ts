import { describe, expect, it } from 'vitest';
import { resetLanguageRegistry, getLanguageRegistry } from './index.js';

describe('LanguageProviderRegistry', () => {
  it('supports extensionless Ruby files and newly added languages', () => {
    resetLanguageRegistry();
    const registry = getLanguageRegistry();

    expect(registry.getForFile('Gemfile')?.id).toBe('ruby');
    expect(registry.getForFile('Rakefile')?.id).toBe('ruby');
    expect(registry.getForFile('src/api/Program.cs')?.id).toBe('csharp');
    expect(registry.getForFile('app/main.kt')?.id).toBe('kotlin');
    expect(registry.getForFile('Sources/App.swift')?.id).toBe('swift');
    expect(registry.getForFile('public/index.php')?.id).toBe('php');
    expect(registry.getForFile('src/native/main.cpp')?.id).toBe('cpp');
  });

  it('reports the expanded provider set', () => {
    resetLanguageRegistry();
    const registry = getLanguageRegistry();

    expect(registry.getAllProviderIds()).toEqual([
      'cpp',
      'csharp',
      'go',
      'java',
      'kotlin',
      'php',
      'python',
      'ruby',
      'rust',
      'swift',
      'typescript',
    ]);
  });
});
