import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import kuzu from 'kuzu';
import type { CommitRecord, FileInfo, Symbol } from './types.js';

type QueryRow = Record<string, unknown>;

const DB_FILE = path.join('.codexia', 'codegraph', 'graph.kuzu');

export class GraphStore {
  private readonly dbPath: string;
  private db?: kuzu.Database;
  private conn?: kuzu.Connection;
  private initialized = false;
  private pendingStatements: string[] = [];
  private readonly BATCH_SIZE = 150;

  constructor(repoRoot: string) {
    this.dbPath = path.join(repoRoot, DB_FILE);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    this.db = new kuzu.Database(this.dbPath);
    this.conn = new kuzu.Connection(this.db);
    await this.conn.init();
    await this.ensureSchema();
    this.initialized = true;
  }

  async rebuild(files: Map<string, FileInfo>, dependencyGraph: { getDependencies(filePath: string): string[] }): Promise<void> {
    await this.reset();
    await this.initialize();
    await this.indexFiles(files, dependencyGraph, new Set(files.keys()));
  }

  async updateFiles(
    files: Map<string, FileInfo>,
    dependencyGraph: { getDependencies(filePath: string): string[]; getDependents(filePath: string): string[] },
    changedFiles: string[],
    deletedFiles: string[]
  ): Promise<void> {
    await this.initialize();

    const affected = new Set<string>();
    for (const file of changedFiles) {
      affected.add(file);
      for (const dependent of dependencyGraph.getDependents(file)) {
        affected.add(dependent);
      }
    }
    for (const file of deletedFiles) {
      affected.add(file);
      for (const dependent of dependencyGraph.getDependents(file)) {
        affected.add(dependent);
      }
    }

    await this.deleteFileSubgraphs(Array.from(affected));
    const existingAffected = new Set(Array.from(affected).filter((file) => files.has(file)));
    await this.indexFiles(files, dependencyGraph, existingAffected);
  }

  async syncTemporalData(files: Map<string, FileInfo>, commits: CommitRecord[]): Promise<void> {
    await this.initialize();

    await this.run('MATCH ()-[r:MODIFIED_IN]->() DELETE r;', true);
    await this.run('MATCH ()-[r:FN_MODIFIED_IN]->() DELETE r;', true);
    await this.run('MATCH (c:Commit) DETACH DELETE c;', true);

    const functionSymbols = Array.from(files.values()).flatMap((file) =>
      file.symbols.filter((symbol) => symbol.kind === 'function' || symbol.kind === 'method')
    );

    for (const commit of commits) {
      await this.batchRun(`
        CREATE (:Commit {
          sha: '${this.escape(commit.hash)}',
          message: '${this.escape(commit.message)}',
          author: '${this.escape(commit.author)}',
          date: '${commit.date.toISOString()}',
          is_merge: ${commit.isMerge ? 'true' : 'false'},
          is_revert: ${commit.isRevert ? 'true' : 'false'},
          reverts_sha: '${this.escape(commit.revertsSha || '')}'
        });
      `);

      for (const change of commit.changes) {
        if (!files.has(change.path)) {
          continue;
        }

        await this.batchRun(`
          MATCH (f:File {path: '${this.escape(change.path)}'}), (c:Commit {sha: '${this.escape(commit.hash)}'})
          CREATE (f)-[:MODIFIED_IN {
            lines_added: ${change.additions},
            lines_removed: ${change.deletions}
          }]->(c);
        `);

        const impactedFunctions = functionSymbols.filter((symbol) =>
          symbol.filePath === change.path &&
          change.hunks.some((hunk) => this.rangesOverlap(symbol.line, symbol.endLine || symbol.line, hunk.newStart, hunk.newStart + Math.max(hunk.newLines, 1) - 1))
        );

        for (const symbol of impactedFunctions) {
          await this.batchRun(`
            MATCH (fn:Function {id: '${this.escape(this.symbolId(symbol))}'}), (c:Commit {sha: '${this.escape(commit.hash)}'})
            CREATE (fn)-[:FN_MODIFIED_IN {
              lines_added: ${change.additions},
              lines_removed: ${change.deletions}
            }]->(c);
          `);
        }
      }
    }

    await this.flushBatch();
  }

  private async indexFiles(
    files: Map<string, FileInfo>,
    dependencyGraph: { getDependencies(filePath: string): string[] },
    scope: Set<string>
  ): Promise<void> {

    const functionSymbols: Symbol[] = [];
    const classSymbols: Symbol[] = [];
    const typeSymbols: Symbol[] = [];
    const allImportSources = new Set<string>();

    for (const [filePath, fileInfo] of files) {
      if (!scope.has(filePath)) {
        continue;
      }
      await this.batchRun(`
        CREATE (:File {
          path: '${this.escape(filePath)}',
          language: '${this.escape(fileInfo.language)}',
          sha256: '${this.hashFile(fileInfo)}',
          size: ${fileInfo.size},
          lines: ${fileInfo.lines},
          last_parsed: '${new Date().toISOString()}'
        });
      `);

      for (const imp of fileInfo.imports) {
        allImportSources.add(imp.source);
      }

      for (const symbol of fileInfo.symbols) {
        if (symbol.kind === 'class') {
          classSymbols.push(symbol);
          await this.batchRun(`
            CREATE (:Class {
              id: '${this.escape(this.symbolId(symbol))}',
              name: '${this.escape(symbol.name)}',
              file_path: '${this.escape(symbol.filePath)}',
              line_start: ${symbol.line},
              line_end: ${symbol.endLine || symbol.line},
              is_exported: ${symbol.exported ? 'true' : 'false'}
            });
          `);

          await this.batchRun(`
            MATCH (f:File {path: '${this.escape(filePath)}'}), (c:Class {id: '${this.escape(this.symbolId(symbol))}'})
            CREATE (f)-[:CONTAINS_CLASS]->(c);
          `);
          continue;
        }

        if (['function', 'method'].includes(symbol.kind)) {
          functionSymbols.push(symbol);
          await this.batchRun(`
            CREATE (:Function {
              id: '${this.escape(this.symbolId(symbol))}',
              name: '${this.escape(symbol.name)}',
              file_path: '${this.escape(symbol.filePath)}',
              class_name: ${symbol.parentSymbol ? `'${this.escape(symbol.parentSymbol)}'` : 'NULL'},
              line_start: ${symbol.line},
              line_end: ${symbol.endLine || symbol.line},
              params: '${this.escape((symbol.parameters || []).join(','))}',
              return_type: '${this.escape(symbol.returnType || '')}',
              is_exported: ${symbol.exported ? 'true' : 'false'},
              is_test: ${this.isTestSymbol(symbol) ? 'true' : 'false'}
            });
          `);

          if (symbol.parentSymbol) {
            await this.batchRun(`
              MATCH (c:Class {name: '${this.escape(symbol.parentSymbol)}', file_path: '${this.escape(symbol.filePath)}'}), (fn:Function {id: '${this.escape(this.symbolId(symbol))}'})
              CREATE (c)-[:CLASS_CONTAINS]->(fn);
            `);
          } else {
            await this.batchRun(`
              MATCH (f:File {path: '${this.escape(filePath)}'}), (fn:Function {id: '${this.escape(this.symbolId(symbol))}'})
              CREATE (f)-[:CONTAINS_FUNCTION]->(fn);
            `);
          }
          continue;
        }

        if (['interface', 'type', 'enum'].includes(symbol.kind)) {
          typeSymbols.push(symbol);
          await this.batchRun(`
            CREATE (:Type {
              id: '${this.escape(this.symbolId(symbol))}',
              name: '${this.escape(symbol.name)}',
              file_path: '${this.escape(symbol.filePath)}',
              kind: '${this.escape(symbol.kind)}',
              is_exported: ${symbol.exported ? 'true' : 'false'}
            });
          `);

          await this.batchRun(`
            MATCH (f:File {path: '${this.escape(filePath)}'}), (t:Type {id: '${this.escape(this.symbolId(symbol))}'})
            CREATE (f)-[:CONTAINS_TYPE]->(t);
          `);
        }
      }
    }

    // Flush pending node CREATEs before querying for existing modules
    await this.flushBatch();

    // Fetch all existing modules in one query, then create only missing ones
    const existingModuleRows = await this.query(`MATCH (m:Module) RETURN m.path AS path;`);
    const existingModules = new Set(existingModuleRows.map((r) => r.path as string));
    const createdModules = new Set<string>();

    for (const source of allImportSources) {
      if (!existingModules.has(source) && !createdModules.has(source)) {
        createdModules.add(source);
        await this.batchRun(`
          CREATE (:Module {
            path: '${this.escape(source)}',
            is_external: ${this.isExternalImport(source) ? 'true' : 'false'}
          });
        `);
      }
    }

    // Flush module CREATEs before creating relationships that reference them
    await this.flushBatch();

    for (const [filePath, fileInfo] of files) {
      if (!scope.has(filePath)) {
        continue;
      }
      for (const imp of fileInfo.imports) {
        await this.batchRun(`
          MATCH (f:File {path: '${this.escape(filePath)}'}), (m:Module {path: '${this.escape(imp.source)}'})
          CREATE (f)-[:IMPORTS_FROM {
            symbols: '${this.escape(imp.specifiers.join(','))}',
            is_default: ${imp.isDefault ? 'true' : 'false'}
          }]->(m);
        `);
      }

      for (const target of dependencyGraph.getDependencies(filePath)) {
        if (!files.has(target)) {
          continue;
        }
        await this.batchRun(`
          MATCH (from:File {path: '${this.escape(filePath)}'}), (to:File {path: '${this.escape(target)}'})
          CREATE (from)-[:DEPENDS_ON]->(to);
        `);
      }
    }

    const classIndex = new Map(classSymbols.map((symbol) => [this.classKey(symbol), symbol]));
    const functionIndex = new Map<string, Symbol[]>();
    for (const symbol of functionSymbols) {
      const list = functionIndex.get(symbol.name) || [];
      list.push(symbol);
      functionIndex.set(symbol.name, list);
    }
    const typeIndex = new Map(typeSymbols.map((symbol) => [this.typeKey(symbol), symbol]));

    for (const classSymbol of classSymbols) {
      for (const base of classSymbol.extendsSymbols || []) {
        const target = classIndex.get(this.classLookupKey(base, classSymbol.filePath)) || this.findByName(classSymbols, base);
        if (!target) {
          continue;
        }
        await this.batchRun(`
          MATCH (src:Class {id: '${this.escape(this.symbolId(classSymbol))}'}), (dst:Class {id: '${this.escape(this.symbolId(target))}'})
          CREATE (src)-[:INHERITS]->(dst);
        `);
      }

      for (const implemented of classSymbol.implementsSymbols || []) {
        const target = typeIndex.get(this.typeLookupKey(implemented, classSymbol.filePath)) || this.findByName(typeSymbols, implemented);
        if (!target) {
          continue;
        }
        await this.batchRun(`
          MATCH (src:Class {id: '${this.escape(this.symbolId(classSymbol))}'}), (dst:Type {id: '${this.escape(this.symbolId(target))}'})
          CREATE (src)-[:IMPLEMENTS]->(dst);
        `);
      }
    }

    for (const functionSymbol of functionSymbols) {
      for (const ref of functionSymbol.references.filter((item) => item.kind === 'call' && item.target)) {
        const targetName = ref.target!.split('.').at(-1) || ref.target!;
        const candidates = functionIndex.get(targetName) || [];
        const preferred =
          candidates.find((candidate) => candidate.filePath === functionSymbol.filePath) ||
          candidates[0];
        if (!preferred || this.symbolId(preferred) === this.symbolId(functionSymbol)) {
          continue;
        }

        await this.batchRun(`
          MATCH (src:Function {id: '${this.escape(this.symbolId(functionSymbol))}'}), (dst:Function {id: '${this.escape(this.symbolId(preferred))}'})
          CREATE (src)-[:CALLS {line_number: ${ref.line}}]->(dst);
        `);
      }
    }

    await this.flushBatch();
  }

  async queryText(search: string, limit: number = 10): Promise<QueryRow[]> {
    await this.initialize();
    const needle = this.escape(search.toLowerCase());
    return this.query(`
      MATCH (f:File)
      WHERE lower(f.path) CONTAINS '${needle}' OR lower(f.language) CONTAINS '${needle}'
      RETURN 'file' AS type, f.path AS path, f.language AS language
      UNION
      MATCH (fn:Function)
      WHERE lower(fn.name) CONTAINS '${needle}' OR lower(fn.file_path) CONTAINS '${needle}'
      RETURN 'function' AS type, fn.file_path AS path, fn.name AS name
      UNION
      MATCH (c:Class)
      WHERE lower(c.name) CONTAINS '${needle}' OR lower(c.file_path) CONTAINS '${needle}'
      RETURN 'class' AS type, c.file_path AS path, c.name AS name
      UNION
      MATCH (t:Type)
      WHERE lower(t.name) CONTAINS '${needle}' OR lower(t.file_path) CONTAINS '${needle}'
      RETURN 'type' AS type, t.file_path AS path, t.name AS name
      LIMIT ${limit};
    `);
  }

  async getFileContext(filePath: string): Promise<QueryRow[]> {
    await this.initialize();
    return this.query(`
      MATCH (f:File {path: '${this.escape(filePath)}'})-[:CONTAINS_FUNCTION]->(fn:Function)
      RETURN f.path AS file, f.language AS language, fn.name AS symbol, 'function' AS kind, fn.line_start AS line
      UNION
      MATCH (f:File {path: '${this.escape(filePath)}'})-[:CONTAINS_CLASS]->(c:Class)
      RETURN f.path AS file, f.language AS language, c.name AS symbol, 'class' AS kind, c.line_start AS line
      UNION
      MATCH (f:File {path: '${this.escape(filePath)}'})-[:CONTAINS_TYPE]->(t:Type)
      RETURN f.path AS file, f.language AS language, t.name AS symbol, t.kind AS kind, 0 AS line
      UNION
      MATCH (f:File {path: '${this.escape(filePath)}'})-[:CONTAINS_CLASS]->(c:Class)-[:CLASS_CONTAINS]->(m:Function)
      RETURN f.path AS file, f.language AS language, m.name AS symbol, 'method' AS kind, m.line_start AS line
      ORDER BY line;
    `);
  }

  async getSymbolContext(symbolName: string): Promise<QueryRow[]> {
    await this.initialize();
    return this.query(`
      MATCH (fn:Function {name: '${this.escape(symbolName)}'})
      OPTIONAL MATCH (caller:Function)-[call:CALLS]->(fn)
      OPTIONAL MATCH (fn)-[out:CALLS]->(callee:Function)
      RETURN 'function' AS entity_type, fn.name AS name, fn.file_path AS file_path, coalesce(fn.class_name, '') AS class_name, coalesce(caller.name, '') AS caller, coalesce(callee.name, '') AS callee, '' AS parent_class, '' AS implemented_type, '' AS base_class
      UNION
      MATCH (c:Class {name: '${this.escape(symbolName)}'})
      OPTIONAL MATCH (c)-[:INHERITS]->(base:Class)
      OPTIONAL MATCH (c)-[:IMPLEMENTS]->(impl:Type)
      OPTIONAL MATCH (c)-[:CLASS_CONTAINS]->(method:Function)
      RETURN 'class' AS entity_type, c.name AS name, c.file_path AS file_path, '' AS class_name, coalesce(method.name, '') AS caller, '' AS callee, c.name AS parent_class, coalesce(impl.name, '') AS implemented_type, coalesce(base.name, '') AS base_class
      UNION
      MATCH (t:Type {name: '${this.escape(symbolName)}'})
      RETURN 'type' AS entity_type, t.name AS name, t.file_path AS file_path, '' AS class_name, '' AS caller, '' AS callee, '' AS parent_class, '' AS implemented_type, '' AS base_class;
    `);
  }

  async getHistoryForTarget(target: string): Promise<QueryRow[]> {
    await this.initialize();
    return this.query(`
      MATCH (f:File {path: '${this.escape(target)}'})-[r:MODIFIED_IN]->(c:Commit)
      RETURN 'file' AS target_type, f.path AS target, c.sha AS sha, c.message AS message, c.author AS author, c.date AS date, c.is_revert AS is_revert, c.reverts_sha AS reverts_sha, r.lines_added AS lines_added, r.lines_removed AS lines_removed
      UNION
      MATCH (fn:Function {name: '${this.escape(target)}'})-[r:FN_MODIFIED_IN]->(c:Commit)
      RETURN 'function' AS target_type, fn.name AS target, c.sha AS sha, c.message AS message, c.author AS author, c.date AS date, c.is_revert AS is_revert, c.reverts_sha AS reverts_sha, r.lines_added AS lines_added, r.lines_removed AS lines_removed
      ORDER BY date DESC;
    `);
  }

  async getDependents(filePath: string): Promise<QueryRow[]> {
    await this.initialize();
    return this.query(`
      MATCH (from:File)-[:DEPENDS_ON]->(to:File {path: '${this.escape(filePath)}'})
      RETURN from.path AS path
      ORDER BY from.path;
    `);
  }

  async getDependencies(filePath: string): Promise<QueryRow[]> {
    await this.initialize();
    return this.query(`
      MATCH (from:File {path: '${this.escape(filePath)}'})-[:DEPENDS_ON]->(to:File)
      RETURN to.path AS path
      ORDER BY to.path;
    `);
  }

  async getBlastRadius(files: string[], depth: number): Promise<Array<{ depth: number; files: string[] }>> {
    await this.initialize();
    const groups = new Map<number, Set<string>>();

    for (const file of files) {
      groups.set(0, new Set([...(groups.get(0) || []), file]));
      for (let hop = 1; hop <= depth; hop++) {
        const rows = await this.query(`
          MATCH p=(start:File {path: '${this.escape(file)}'})<-[:DEPENDS_ON*1..${hop}]-(dependent:File)
          RETURN DISTINCT dependent.path AS path;
        `);

        if (!groups.has(hop)) {
          groups.set(hop, new Set());
        }
        for (const row of rows) {
          if (typeof row.path === 'string') {
            groups.get(hop)!.add(row.path);
          }
        }
      }
    }

    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([groupDepth, groupFiles]) => ({
        depth: groupDepth,
        files: Array.from(groupFiles).sort(),
      }));
  }

  async getTestsForSymbol(symbolName: string): Promise<QueryRow[]> {
    await this.initialize();
    return this.query(`
      MATCH (test:Function)-[:CALLS]->(target:Function {name: '${this.escape(symbolName)}'})
      WHERE test.is_test = true
      RETURN test.name AS test_name, test.file_path AS file_path, coalesce(test.class_name, '') AS class_name
      ORDER BY test.file_path, test.name;
    `);
  }

  async getStats(): Promise<QueryRow> {
    await this.initialize();
    const [files, functions, classes, types, modules, commits] = await Promise.all([
      this.query(`MATCH (f:File) RETURN count(f) AS value;`),
      this.query(`MATCH (fn:Function) RETURN count(fn) AS value;`),
      this.query(`MATCH (c:Class) RETURN count(c) AS value;`),
      this.query(`MATCH (t:Type) RETURN count(t) AS value;`),
      this.query(`MATCH (m:Module) RETURN count(m) AS value;`),
      this.query(`MATCH (c:Commit) RETURN count(c) AS value;`),
    ]);

    return {
      files: Number(files[0]?.value || 0),
      functions: Number(functions[0]?.value || 0),
      classes: Number(classes[0]?.value || 0),
      types: Number(types[0]?.value || 0),
      modules: Number(modules[0]?.value || 0),
      commits: Number(commits[0]?.value || 0),
    };
  }

  async runCypher(query: string): Promise<QueryRow[]> {
    await this.initialize();
    return this.query(query);
  }

  async close(): Promise<void> {
    try {
      await this.conn?.close();
    } catch {
      // Ignore close errors during shutdown.
    }
    try {
      await this.db?.close();
    } catch {
      // Ignore close errors during shutdown.
    }
    this.conn = undefined;
    this.db = undefined;
    this.initialized = false;
  }

  private async reset(): Promise<void> {
    await this.close();
    await fs.rm(this.dbPath, { recursive: true, force: true });
  }

  private async deleteFileSubgraphs(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      const escaped = this.escape(filePath);
      await this.batchRun(`MATCH (f:File {path: '${escaped}'})-[r:CONTAINS_FUNCTION]->(fn:Function)-[call:CALLS]->() DELETE call;`);
      await this.batchRun(`MATCH ()-[call:CALLS]->(fn:Function {file_path: '${escaped}'}) DELETE call;`);
      await this.batchRun(`MATCH (c:Class {file_path: '${escaped}'})-[r:CLASS_CONTAINS]->(fn:Function) DELETE r;`);
      await this.batchRun(`MATCH (c:Class {file_path: '${escaped}'})-[r:INHERITS]->() DELETE r;`);
      await this.batchRun(`MATCH (c:Class {file_path: '${escaped}'})-[r:IMPLEMENTS]->() DELETE r;`);
      await this.batchRun(`MATCH (f:File {path: '${escaped}'})-[r:CONTAINS_FUNCTION]->(fn:Function) DELETE r;`);
      await this.batchRun(`MATCH (f:File {path: '${escaped}'})-[r:CONTAINS_CLASS]->(c:Class) DELETE r;`);
      await this.batchRun(`MATCH (f:File {path: '${escaped}'})-[r:CONTAINS_TYPE]->(t:Type) DELETE r;`);
      await this.batchRun(`MATCH (f:File {path: '${escaped}'})-[r:IMPORTS_FROM]->() DELETE r;`);
      await this.batchRun(`MATCH (f:File {path: '${escaped}'})-[r:DEPENDS_ON]->() DELETE r;`);
      await this.batchRun(`MATCH ()-[r:DEPENDS_ON]->(f:File {path: '${escaped}'}) DELETE r;`);
      await this.batchRun(`MATCH (fn:Function {file_path: '${escaped}'}) DETACH DELETE fn;`);
      await this.batchRun(`MATCH (c:Class {file_path: '${escaped}'}) DETACH DELETE c;`);
      await this.batchRun(`MATCH (t:Type {file_path: '${escaped}'}) DETACH DELETE t;`);
      await this.batchRun(`MATCH (f:File {path: '${escaped}'}) DETACH DELETE f;`);
    }
    await this.flushBatch();
  }

  private async ensureSchema(): Promise<void> {
    await this.run('CREATE NODE TABLE File (path STRING, language STRING, sha256 STRING, size INT64, lines INT64, last_parsed STRING, PRIMARY KEY(path));', true);
    await this.run('CREATE NODE TABLE Function (id STRING, name STRING, file_path STRING, class_name STRING, line_start INT64, line_end INT64, params STRING, return_type STRING, is_test BOOLEAN, is_exported BOOLEAN, PRIMARY KEY(id));', true);
    await this.run('CREATE NODE TABLE Class (id STRING, name STRING, file_path STRING, line_start INT64, line_end INT64, is_exported BOOLEAN, PRIMARY KEY(id));', true);
    await this.run('CREATE NODE TABLE Type (id STRING, name STRING, file_path STRING, kind STRING, is_exported BOOLEAN, PRIMARY KEY(id));', true);
    await this.run('CREATE NODE TABLE Module (path STRING, is_external BOOLEAN, PRIMARY KEY(path));', true);
    await this.run('CREATE NODE TABLE Commit (sha STRING, message STRING, author STRING, date STRING, is_merge BOOLEAN, is_revert BOOLEAN, reverts_sha STRING, PRIMARY KEY(sha));', true);
    await this.run('CREATE REL TABLE CONTAINS_FUNCTION (FROM File TO Function);', true);
    await this.run('CREATE REL TABLE CONTAINS_CLASS (FROM File TO Class);', true);
    await this.run('CREATE REL TABLE CONTAINS_TYPE (FROM File TO Type);', true);
    await this.run('CREATE REL TABLE CLASS_CONTAINS (FROM Class TO Function);', true);
    await this.run('CREATE REL TABLE CALLS (FROM Function TO Function, line_number INT64);', true);
    await this.run('CREATE REL TABLE INHERITS (FROM Class TO Class);', true);
    await this.run('CREATE REL TABLE IMPLEMENTS (FROM Class TO Type);', true);
    await this.run('CREATE REL TABLE IMPORTS_FROM (FROM File TO Module, symbols STRING, is_default BOOLEAN);', true);
    await this.run('CREATE REL TABLE DEPENDS_ON (FROM File TO File);', true);
    await this.run('CREATE REL TABLE MODIFIED_IN (FROM File TO Commit, lines_added INT64, lines_removed INT64);', true);
    await this.run('CREATE REL TABLE FN_MODIFIED_IN (FROM Function TO Commit, lines_added INT64, lines_removed INT64);', true);
  }

  private async query(statement: string): Promise<QueryRow[]> {
    const result = await this.conn!.query(statement);
    const rows = Array.isArray(result) ? result[0] : result;
    return rows.getAll() as Promise<QueryRow[]>;
  }

  private async run(statement: string, ignoreExists: boolean = false): Promise<void> {
    try {
      await this.conn!.query(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (ignoreExists && message.toLowerCase().includes('already exists')) {
        return;
      }
      throw error;
    }
  }

  private async batchRun(statement: string): Promise<void> {
    this.pendingStatements.push(statement);
    if (this.pendingStatements.length >= this.BATCH_SIZE) {
      await this.flushBatch();
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.pendingStatements.length === 0) return;
    const batch = this.pendingStatements.join('\n');
    this.pendingStatements = [];
    await this.conn!.query(batch);
  }

  private symbolId(symbol: Symbol): string {
    return `${symbol.filePath}:${symbol.name}:${symbol.kind}:${symbol.line}`;
  }

  private hashFile(fileInfo: FileInfo): string {
    return crypto
      .createHash('sha256')
      .update([
        fileInfo.path,
        fileInfo.language,
        String(fileInfo.size),
        String(fileInfo.lines),
        ...fileInfo.symbols.map((symbol) => this.symbolId(symbol)),
      ].join('|'))
      .digest('hex');
  }

  private classKey(symbol: Symbol): string {
    return `${symbol.filePath}:${symbol.name}`;
  }

  private classLookupKey(name: string, filePath: string): string {
    return `${filePath}:${name}`;
  }

  private typeKey(symbol: Symbol): string {
    return `${symbol.filePath}:${symbol.name}`;
  }

  private typeLookupKey(name: string, filePath: string): string {
    return `${filePath}:${name}`;
  }

  private findByName(symbols: Symbol[], name: string): Symbol | undefined {
    return symbols.find((symbol) => symbol.name === name);
  }

  private isExternalImport(source: string): boolean {
    return !source.startsWith('.') && !source.startsWith('/');
  }

  private isTestSymbol(symbol: Symbol): boolean {
    return /(?:^test|test$|spec$|describe|it)/i.test(symbol.name) || /(?:test|spec)\./i.test(symbol.filePath);
  }

  private rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
    return startA <= endB && startB <= endA;
  }

  private escape(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
}
