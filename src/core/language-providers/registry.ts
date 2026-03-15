import type { LanguageProvider } from './types.js';
import { TypeScriptProvider } from './providers/typescript.js';
import { PythonProvider } from './providers/python.js';
import { RubyProvider } from './providers/ruby.js';
import { JavaProvider } from './providers/java.js';
import { GoProvider } from './providers/go.js';
import { RustProvider } from './providers/rust.js';
import { CSharpProvider } from './providers/csharp.js';
import { KotlinProvider } from './providers/kotlin.js';
import { SwiftProvider } from './providers/swift.js';
import { PhpProvider } from './providers/php.js';
import { CppProvider } from './providers/cpp.js';

/**
 * Registry for language providers
 */
export class LanguageProviderRegistry {
  private providers = new Map<string, LanguageProvider>();
  private extensionMap = new Map<string, LanguageProvider>();
  private basenameMap = new Map<string, LanguageProvider>();

  constructor() {
    // Register built-in providers
    this.register(new TypeScriptProvider());
    this.register(new PythonProvider());
    this.register(new RubyProvider());
    this.register(new JavaProvider());
    this.register(new GoProvider());
    this.register(new RustProvider());
    this.register(new CSharpProvider());
    this.register(new KotlinProvider());
    this.register(new SwiftProvider());
    this.register(new PhpProvider());
    this.register(new CppProvider());
  }

  /**
   * Register a language provider
   */
  register(provider: LanguageProvider): void {
    this.providers.set(provider.id, provider);
    
    for (const ext of provider.extensions) {
      this.extensionMap.set(ext, provider);
    }

    for (const pattern of provider.filePatterns) {
      const basename = this.getStaticBasename(pattern);
      if (basename) {
        this.basenameMap.set(basename, provider);
      }
    }
  }

  /**
   * Get provider by ID
   */
  get(id: string): LanguageProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get provider for a file extension
   */
  getForExtension(ext: string): LanguageProvider | undefined {
    // Normalize extension to include dot
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
    return this.extensionMap.get(normalizedExt);
  }

  /**
   * Get provider for a file path
   */
  getForFile(filePath: string): LanguageProvider | undefined {
    const ext = this.getExtension(filePath);
    if (ext) {
      const byExt = this.getForExtension(ext);
      if (byExt) {
        return byExt;
      }
    }

    return this.basenameMap.get(this.getBasename(filePath));
  }

  /**
   * Get all registered providers
   */
  getAll(): LanguageProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all supported extensions
   */
  getAllExtensions(): string[] {
    return Array.from(this.extensionMap.keys());
  }

  getAllProviderIds(): string[] {
    return Array.from(this.providers.keys()).sort();
  }

  /**
   * Get all file patterns from all providers
   */
  getAllPatterns(): string[] {
    const patterns: string[] = [];
    for (const provider of this.providers.values()) {
      patterns.push(...provider.filePatterns);
    }
    return patterns;
  }

  /**
   * Get all ignore patterns (common across languages)
   */
  getIgnorePatterns(): string[] {
    return [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/.codexia/**',
      '**/.codegraph/**',
      '**/coverage/**',
      '**/vendor/**',
      '**/__pycache__/**',
      '**/target/**',
      '**/bin/**',
      '**/obj/**',
      '**/.venv/**',
      '**/venv/**',
    ];
  }

  /**
   * Check if a file is supported
   */
  isSupported(filePath: string): boolean {
    return this.getForFile(filePath) !== undefined;
  }

  /**
   * Get language name for a file
   */
  getLanguageName(filePath: string): string {
    const provider = this.getForFile(filePath);
    if (!provider) return 'unknown';
    
    const ext = this.getExtension(filePath);
    return provider.getLanguageName(ext);
  }

  private getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filePath.slice(lastDot);
  }

  private getBasename(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1];
  }

  private getStaticBasename(pattern: string): string | null {
    const normalized = pattern.replace(/\\/g, '/');
    const lastSegment = normalized.split('/').pop() || normalized;
    if (lastSegment.includes('*') || lastSegment.includes('?') || lastSegment.includes('[')) {
      return null;
    }
    return lastSegment;
  }
}

// Singleton instance
let registryInstance: LanguageProviderRegistry | null = null;

export const getLanguageRegistry = (): LanguageProviderRegistry => {
  if (!registryInstance) {
    registryInstance = new LanguageProviderRegistry();
  }
  return registryInstance;
};

export const resetLanguageRegistry = (): void => {
  registryInstance = null;
};
