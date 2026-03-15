import { describe, expect, it } from 'vitest';
import { TreeSitterParser } from './parser.js';

describe('TreeSitterParser', () => {
  const parser = new TreeSitterParser();
  const findSymbol = (symbols: NonNullable<ReturnType<TreeSitterParser['parseFile']>>['symbols'], name: string) =>
    symbols.find((symbol) => symbol.name === name);

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

  it('parses Ruby classes, mixins, and call references', () => {
    const parsed = parser.parseFile(
      'app/models/user.rb',
      `require 'json'\nmodule Admin\n  class User < BaseUser\n    include Auditable\n    def save(record)\n      Logger.info(record)\n      persist(record)\n    end\n  end\nend`
    );

    expect(parsed?.language).toBe('ruby');
    expect(parsed?.imports[0]?.source).toBe('json');
    const userClass = findSymbol(parsed?.symbols || [], 'User');
    const saveMethod = findSymbol(parsed?.symbols || [], 'save');
    expect(userClass?.extendsSymbols).toEqual(['BaseUser']);
    expect(userClass?.implementsSymbols).toEqual(['Auditable']);
    expect(saveMethod?.parentSymbol).toBe('User');
    expect(saveMethod?.parameters).toEqual(['record']);
    expect(saveMethod?.references.map((ref) => ref.target)).toEqual(['Logger.info', 'persist']);
  });

  it('parses Java inheritance, fields, and method calls', () => {
    const parsed = parser.parseFile(
      'src/main/java/com/acme/UserService.java',
      `import java.util.List;\npublic class UserService extends BaseService implements Auditable, Runnable {\n  private String name;\n  public UserService(String name) { this.name = name; }\n  public void save(User user) { repo.save(user); log(user); }\n}`
    );

    expect(parsed?.language).toBe('java');
    expect(parsed?.imports[0]?.source).toBe('java.util.List');
    const serviceClass = findSymbol(parsed?.symbols || [], 'UserService');
    const nameProperty = (parsed?.symbols || []).find((symbol) => symbol.name === 'name' && symbol.kind === 'property');
    const saveMethod = (parsed?.symbols || []).find((symbol) => symbol.name === 'save' && symbol.kind === 'method');
    expect(serviceClass?.extendsSymbols).toEqual(['BaseService']);
    expect(serviceClass?.implementsSymbols).toEqual(['Auditable', 'Runnable']);
    expect(nameProperty?.parentSymbol).toBe('UserService');
    expect(saveMethod?.parameters).toEqual(['user']);
    expect(saveMethod?.references.map((ref) => ref.target)).toEqual(['repo.save', 'log']);
  });

  it('parses Rust traits, impl methods, and call references', () => {
    const parsed = parser.parseFile(
      'src/lib.rs',
      `use crate::db::Repo;\npub trait Auditable {}\npub struct Service;\nimpl Service {\n  pub fn save(&self, user: User) {\n    repo.save(user);\n    log(user);\n  }\n}`
    );

    expect(parsed?.language).toBe('rust');
    expect(parsed?.imports[0]?.source).toBe('crate::db::Repo');
    expect((parsed?.symbols || []).some((symbol) => symbol.name === 'Auditable' && symbol.kind === 'interface')).toBe(true);
    const saveMethod = (parsed?.symbols || []).find((symbol) => symbol.name === 'save' && symbol.kind === 'method');
    expect(saveMethod?.parentSymbol).toBe('Service');
    expect(saveMethod?.parameters).toEqual(['user']);
    expect(saveMethod?.references.map((ref) => ref.target)).toEqual(['repo.save', 'log']);
  });

  it('parses C# classes, properties, and method calls', () => {
    const parsed = parser.parseFile(
      'src/UserService.cs',
      `using System.Collections.Generic;\npublic class UserService : BaseService, IAuditable {\n  public string Name { get; set; }\n  public UserService(string name) {}\n  public void Save(User user) { repo.Save(user); Log(user); }\n}`
    );

    expect(parsed?.language).toBe('csharp');
    expect(parsed?.imports[0]?.source).toBe('System.Collections.Generic');
    const serviceClass = findSymbol(parsed?.symbols || [], 'UserService');
    const nameProperty = (parsed?.symbols || []).find((symbol) => symbol.name === 'Name' && symbol.kind === 'property');
    const saveMethod = (parsed?.symbols || []).find((symbol) => symbol.name === 'Save' && symbol.kind === 'method');
    expect(serviceClass?.extendsSymbols).toEqual(['BaseService']);
    expect(serviceClass?.implementsSymbols).toEqual(['IAuditable']);
    expect(nameProperty?.parentSymbol).toBe('UserService');
    expect(saveMethod?.parameters).toEqual(['user']);
    expect(saveMethod?.references.map((ref) => ref.target)).toEqual(['repo.Save', 'Log']);
  });

  it('parses Kotlin inheritance, parameters, and method calls', () => {
    const parsed = parser.parseFile(
      'src/UserService.kt',
      `import kotlin.collections.List\nclass UserService : BaseService(), Auditable {\n  fun save(user: User) {\n    repo.save(user)\n    log(user)\n  }\n}`
    );

    expect(parsed?.language).toBe('kotlin');
    expect(parsed?.imports[0]?.source).toBe('kotlin.collections.List');
    const serviceClass = findSymbol(parsed?.symbols || [], 'UserService');
    const saveMethod = (parsed?.symbols || []).find((symbol) => symbol.name === 'save' && symbol.kind === 'method');
    expect(serviceClass?.extendsSymbols).toEqual(['BaseService']);
    expect(serviceClass?.implementsSymbols).toEqual(['Auditable']);
    expect(saveMethod?.parameters).toEqual(['user']);
    expect(saveMethod?.references.map((ref) => ref.target)).toEqual(['repo.save', 'log']);
  });
});
