// Language Provider System
// Provides multi-language support for code analysis

export * from './types.js';
export * from './registry.js';

// Export individual providers for direct use if needed
export { TypeScriptProvider } from './providers/typescript.js';
export { PythonProvider } from './providers/python.js';
export { RubyProvider } from './providers/ruby.js';
export { JavaProvider } from './providers/java.js';
export { GoProvider } from './providers/go.js';
export { RustProvider } from './providers/rust.js';
