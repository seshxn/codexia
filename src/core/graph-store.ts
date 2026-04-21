import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import kuzu from 'kuzu';
import type { CommitRecord, FileInfo, Symbol } from './types.js';
import { buildGraphRecords, countGraphRelationships } from './graph-build-records.js';
import { bulkLoadGraphRecords } from './graph-kuzu-bulk-loader.js';
import type {
  DependencyGraphReader,
  DependencyGraphUpdateReader,
  GraphStoreAdapter,
  GraphStoreBuildMetrics,
  QueryRow,
} from './graph-store-types.js';

const DB_FILE = path.join('.codexia', 'codegraph', 'graph.kuzu');

export class GraphStore implements GraphStoreAdapter {
  private readonly dbPath: string;
  private db?: kuzu.Database;
  private conn?: kuzu.Connection;
  private initialized = false;

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

  async rebuild(files: Map<string, FileInfo>, dependencyGraph: DependencyGraphReader): Promise<GraphStoreBuildMetrics> {
    const start = Date.now();
    await this.reset();
    await this.initialize();
    const records = buildGraphRecords(files, dependencyGraph);
    await bulkLoadGraphRecords(this.conn!, path.join(path.dirname(this.dbPath), 'tmp'), records);
    return this.getBuildMetrics(start, countGraphRelationships(records));
  }

  async updateFiles(
    files: Map<string, FileInfo>,
    dependencyGraph: DependencyGraphUpdateReader,
    changedFiles: string[],
    deletedFiles: string[]
  ): Promise<GraphStoreBuildMetrics> {
    const start = Date.now();
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
    return this.getBuildMetrics(start);
  }

  async syncTemporalData(files: Map<string, FileInfo>, commits: CommitRecord[]): Promise<GraphStoreBuildMetrics> {
    const start = Date.now();
    await this.initialize();

    await this.run('MATCH ()-[r:MODIFIED_IN]->() DELETE r;', true);
    await this.run('MATCH ()-[r:FN_MODIFIED_IN]->() DELETE r;', true);
    await this.run('MATCH (c:Commit) DETACH DELETE c;', true);

    const functionSymbols = Array.from(files.values()).flatMap((file) =>
      file.symbols.filter((symbol) => symbol.kind === 'function' || symbol.kind === 'method')
    );

    for (const commit of commits) {
      await this.run(`
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

        await this.run(`
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
          await this.run(`
            MATCH (fn:Function {id: '${this.escape(this.symbolId(symbol))}'}), (c:Commit {sha: '${this.escape(commit.hash)}'})
            CREATE (fn)-[:FN_MODIFIED_IN {
              lines_added: ${change.additions},
              lines_removed: ${change.deletions}
            }]->(c);
          `);
        }
      }
    }
    return this.getBuildMetrics(start);
  }

  async syncTemporalDataForFiles(
    files: Map<string, FileInfo>,
    commits: CommitRecord[],
    targetFiles: string[]
  ): Promise<GraphStoreBuildMetrics> {
    const start = Date.now();
    await this.initialize();

    const targets = Array.from(new Set(targetFiles)).filter(Boolean);
    if (targets.length === 0) {
      return this.getBuildMetrics(start);
    }

    const targetSet = new Set(targets);
    const functionSymbols = Array.from(files.values()).flatMap((file) =>
      file.symbols.filter((symbol) =>
        (symbol.kind === 'function' || symbol.kind === 'method') && targetSet.has(symbol.filePath)
      )
    );

    for (const chunk of this.chunk(targets, 200)) {
      const list = this.cypherStringList(chunk);
      await this.run(`MATCH (f:File)-[r:MODIFIED_IN]->() WHERE f.path IN ${list} DELETE r;`, true);
      await this.run(`MATCH (fn:Function)-[r:FN_MODIFIED_IN]->() WHERE fn.file_path IN ${list} DELETE r;`, true);
    }

    for (const commit of commits) {
      const relevantChanges = commit.changes.filter((change) => targetSet.has(change.path) && files.has(change.path));
      if (relevantChanges.length === 0) {
        continue;
      }

      await this.ensureCommit(commit);

      for (const change of relevantChanges) {
        await this.run(`
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
          await this.run(`
            MATCH (fn:Function {id: '${this.escape(this.symbolId(symbol))}'}), (c:Commit {sha: '${this.escape(commit.hash)}'})
            CREATE (fn)-[:FN_MODIFIED_IN {
              lines_added: ${change.additions},
              lines_removed: ${change.deletions}
            }]->(c);
          `);
        }
      }
    }

    return this.getBuildMetrics(start);
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
      await this.run(`
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
          await this.run(`
            CREATE (:Class {
              id: '${this.escape(this.symbolId(symbol))}',
              name: '${this.escape(symbol.name)}',
              file_path: '${this.escape(symbol.filePath)}',
              line_start: ${symbol.line},
              line_end: ${symbol.endLine || symbol.line},
              is_exported: ${symbol.exported ? 'true' : 'false'}
            });
          `);

          await this.run(`
            MATCH (f:File {path: '${this.escape(filePath)}'}), (c:Class {id: '${this.escape(this.symbolId(symbol))}'})
            CREATE (f)-[:CONTAINS_CLASS]->(c);
          `);
          continue;
        }

        if (['function', 'method'].includes(symbol.kind)) {
          functionSymbols.push(symbol);
          await this.run(`
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
            await this.run(`
              MATCH (c:Class {name: '${this.escape(symbol.parentSymbol)}', file_path: '${this.escape(symbol.filePath)}'}), (fn:Function {id: '${this.escape(this.symbolId(symbol))}'})
              CREATE (c)-[:CLASS_CONTAINS]->(fn);
            `);
          } else {
            await this.run(`
              MATCH (f:File {path: '${this.escape(filePath)}'}), (fn:Function {id: '${this.escape(this.symbolId(symbol))}'})
              CREATE (f)-[:CONTAINS_FUNCTION]->(fn);
            `);
          }
          continue;
        }

        if (['interface', 'type', 'enum'].includes(symbol.kind)) {
          typeSymbols.push(symbol);
          await this.run(`
            CREATE (:Type {
              id: '${this.escape(this.symbolId(symbol))}',
              name: '${this.escape(symbol.name)}',
              file_path: '${this.escape(symbol.filePath)}',
              kind: '${this.escape(symbol.kind)}',
              is_exported: ${symbol.exported ? 'true' : 'false'}
            });
          `);

          await this.run(`
            MATCH (f:File {path: '${this.escape(filePath)}'}), (t:Type {id: '${this.escape(this.symbolId(symbol))}'})
            CREATE (f)-[:CONTAINS_TYPE]->(t);
          `);
        }
      }
    }

    for (const source of allImportSources) {
      const existing = await this.query(`
        MATCH (m:Module {path: '${this.escape(source)}'})
        RETURN m.path AS path
        LIMIT 1;
      `);

      if (existing.length === 0) {
        await this.run(`
          CREATE (:Module {
            path: '${this.escape(source)}',
            is_external: ${this.isExternalImport(source) ? 'true' : 'false'}
          });
        `);
      }
    }

    for (const [filePath, fileInfo] of files) {
      if (!scope.has(filePath)) {
        continue;
      }
      for (const imp of fileInfo.imports) {
        await this.run(`
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
        await this.run(`
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
        await this.run(`
          MATCH (src:Class {id: '${this.escape(this.symbolId(classSymbol))}'}), (dst:Class {id: '${this.escape(this.symbolId(target))}'})
          CREATE (src)-[:INHERITS]->(dst);
        `);
      }

      for (const implemented of classSymbol.implementsSymbols || []) {
        const target = typeIndex.get(this.typeLookupKey(implemented, classSymbol.filePath)) || this.findByName(typeSymbols, implemented);
        if (!target) {
          continue;
        }
        await this.run(`
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

        await this.run(`
          MATCH (src:Function {id: '${this.escape(this.symbolId(functionSymbol))}'}), (dst:Function {id: '${this.escape(this.symbolId(preferred))}'})
          CREATE (src)-[:CALLS {line_number: ${ref.line}}]->(dst);
        `);
      }
    }
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
    const files = await this.query(`MATCH (f:File) RETURN count(f) AS value;`);
    const functions = await this.query(`MATCH (fn:Function) RETURN count(fn) AS value;`);
    const classes = await this.query(`MATCH (c:Class) RETURN count(c) AS value;`);
    const types = await this.query(`MATCH (t:Type) RETURN count(t) AS value;`);
    const modules = await this.query(`MATCH (m:Module) RETURN count(m) AS value;`);
    const commits = await this.query(`MATCH (c:Commit) RETURN count(c) AS value;`);

    return {
      files: Number(files[0]?.value || 0),
      functions: Number(functions[0]?.value || 0),
      classes: Number(classes[0]?.value || 0),
      types: Number(types[0]?.value || 0),
      modules: Number(modules[0]?.value || 0),
      commits: Number(commits[0]?.value || 0),
    };
  }

  async runReadOnlyCypher(query: string, options: { limit?: number } = {}): Promise<QueryRow[]> {
    await this.initialize();
    return this.query(this.toReadOnlyQuery(query, options.limit ?? 100));
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

  private async getBuildMetrics(start: number, relationships: number = 0): Promise<GraphStoreBuildMetrics> {
    const stats = await this.getStats();
    return {
      files: Number(stats.files || 0),
      functions: Number(stats.functions || 0),
      classes: Number(stats.classes || 0),
      types: Number(stats.types || 0),
      modules: Number(stats.modules || 0),
      relationships,
      durationMs: Date.now() - start,
    };
  }

  private async deleteFileSubgraphs(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      const escaped = this.escape(filePath);
      await this.run(`MATCH (f:File {path: '${escaped}'})-[r:CONTAINS_FUNCTION]->(fn:Function)-[call:CALLS]->() DELETE call;`, true);
      await this.run(`MATCH ()-[call:CALLS]->(fn:Function {file_path: '${escaped}'}) DELETE call;`, true);
      await this.run(`MATCH (c:Class {file_path: '${escaped}'})-[r:CLASS_CONTAINS]->(fn:Function) DELETE r;`, true);
      await this.run(`MATCH (c:Class {file_path: '${escaped}'})-[r:INHERITS]->() DELETE r;`, true);
      await this.run(`MATCH (c:Class {file_path: '${escaped}'})-[r:IMPLEMENTS]->() DELETE r;`, true);
      await this.run(`MATCH (f:File {path: '${escaped}'})-[r:CONTAINS_FUNCTION]->(fn:Function) DELETE r;`, true);
      await this.run(`MATCH (f:File {path: '${escaped}'})-[r:CONTAINS_CLASS]->(c:Class) DELETE r;`, true);
      await this.run(`MATCH (f:File {path: '${escaped}'})-[r:CONTAINS_TYPE]->(t:Type) DELETE r;`, true);
      await this.run(`MATCH (f:File {path: '${escaped}'})-[r:IMPORTS_FROM]->() DELETE r;`, true);
      await this.run(`MATCH (f:File {path: '${escaped}'})-[r:DEPENDS_ON]->() DELETE r;`, true);
      await this.run(`MATCH ()-[r:DEPENDS_ON]->(f:File {path: '${escaped}'}) DELETE r;`, true);
      await this.run(`MATCH (fn:Function {file_path: '${escaped}'}) DETACH DELETE fn;`, true);
      await this.run(`MATCH (c:Class {file_path: '${escaped}'}) DETACH DELETE c;`, true);
      await this.run(`MATCH (t:Type {file_path: '${escaped}'}) DETACH DELETE t;`, true);
      await this.run(`MATCH (f:File {path: '${escaped}'}) DETACH DELETE f;`, true);
    }
  }

  private async ensureCommit(commit: CommitRecord): Promise<void> {
    const existing = await this.query(`
      MATCH (c:Commit {sha: '${this.escape(commit.hash)}'})
      RETURN c.sha AS sha
      LIMIT 1;
    `);
    if (existing.length > 0) {
      return;
    }

    await this.run(`
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
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private cypherStringList(values: string[]): string {
    return `[${values.map((value) => `'${this.escape(value)}'`).join(', ')}]`;
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

  private toReadOnlyQuery(query: string, limit: number): string {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw new Error('Cypher query cannot be empty');
    }

    if (trimmed.includes(';')) {
      throw new Error('Only one read-only Cypher statement is allowed');
    }

    const normalized = trimmed
      .replace(/\/\/.*$/gm, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!/^(match|with|return|unwind)\b/.test(normalized)) {
      throw new Error('Only read-only Cypher queries are allowed');
    }

    const forbidden = /\b(create|merge|set|delete|detach|drop|alter|copy|load|install|remove|call\s+create_|call\s+drop_|import)\b/i;
    if (forbidden.test(normalized)) {
      throw new Error('Only read-only Cypher queries are allowed');
    }

    if (/\blimit\s+\d+\b/i.test(trimmed)) {
      return trimmed;
    }

    return `${trimmed} LIMIT ${Math.max(1, Math.floor(limit))}`;
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
