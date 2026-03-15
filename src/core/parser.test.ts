import { describe, expect, it } from 'vitest';
import { TreeSitterParser } from './parser.js';

describe('TreeSitterParser', () => {
  const parser = new TreeSitterParser();

  it('parses TypeScript imports and symbols', () => {
    const parsed = parser.parseFile(
      'src/example.ts',
      `import foo, { bar } from './dep'\nexport class User { save() {} }\nexport function run() {}\nconst local = () => 1;`
    );

    expect(parsed?.language).toBe('typescript');
    expect(parsed?.imports[0]?.source).toBe('./dep');
    expect(parsed?.symbols.some((symbol) => symbol.name === 'User' && symbol.kind === 'class')).toBe(true);
    expect(parsed?.symbols.some((symbol) => symbol.name === 'save' && symbol.kind === 'method')).toBe(true);
    expect(parsed?.symbols.some((symbol) => symbol.name === 'run' && symbol.kind === 'function')).toBe(true);
  });

  it('parses Python classes and functions', () => {
    const parsed = parser.parseFile(
      'app/main.py',
      `from pkg.mod import a\nclass User:\n    def save(self):\n        return True\n\ndef run():\n    return 1`
    );

    expect(parsed?.language).toBe('python');
    expect(parsed?.imports[0]?.source).toBe('pkg.mod');
    expect(parsed?.symbols.some((symbol) => symbol.name === 'User' && symbol.kind === 'class')).toBe(true);
    expect(parsed?.symbols.some((symbol) => symbol.name === 'save' && symbol.kind === 'method')).toBe(true);
    expect(parsed?.symbols.some((symbol) => symbol.name === 'run' && symbol.kind === 'function')).toBe(true);
  });

  it('parses Go imports and declarations', () => {
    const parsed = parser.parseFile(
      'service/main.go',
      `package service\nimport (\n  "fmt"\n  alias "mod/pkg"\n)\ntype Service struct{}\nfunc (s *Service) Run() {}\nfunc helper() {}`
    );

    expect(parsed?.language).toBe('go');
    expect(parsed?.imports.some((item) => item.source === 'fmt')).toBe(true);
    expect(parsed?.imports.some((item) => item.source === 'mod/pkg')).toBe(true);
    expect(parsed?.symbols.some((symbol) => symbol.name === 'Service')).toBe(true);
    expect(parsed?.symbols.some((symbol) => symbol.name === 'Run' && symbol.kind === 'method')).toBe(true);
    expect(parsed?.symbols.some((symbol) => symbol.name === 'helper' && symbol.kind === 'function')).toBe(true);
  });
});
