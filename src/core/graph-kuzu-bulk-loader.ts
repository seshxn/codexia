import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphBuildRecords } from './graph-build-records.js';

interface KuzuConnectionLike {
  query(statement: string): Promise<unknown>;
}

type Scalar = string | number | boolean;

const csvValue = (value: Scalar): string => {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '0';
  }
  return `"${value.replace(/"/g, '""')}"`;
};

const cypherPath = (filePath: string): string =>
  filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const writeCsv = async (
  filePath: string,
  header: string[],
  rows: Scalar[][]
): Promise<void> => {
  const content = [
    header.join(','),
    ...rows.map((row) => row.map(csvValue).join(',')),
  ].join('\n') + '\n';
  await fs.writeFile(filePath, content, 'utf-8');
};

const copy = async (conn: KuzuConnectionLike, table: string, filePath: string): Promise<void> => {
  await conn.query(`COPY ${table} FROM '${cypherPath(filePath)}' (HEADER=true);`);
};

export async function bulkLoadGraphRecords(
  conn: KuzuConnectionLike,
  tmpRoot: string,
  records: GraphBuildRecords
): Promise<void> {
  const buildDir = path.join(tmpRoot, `build-${Date.now().toString(36)}-${process.pid}`);
  await fs.mkdir(buildDir, { recursive: true });

  try {
    const fileCsv = path.join(buildDir, 'File.csv');
    const functionCsv = path.join(buildDir, 'Function.csv');
    const classCsv = path.join(buildDir, 'Class.csv');
    const typeCsv = path.join(buildDir, 'Type.csv');
    const moduleCsv = path.join(buildDir, 'Module.csv');
    const containsFunctionCsv = path.join(buildDir, 'CONTAINS_FUNCTION.csv');
    const containsClassCsv = path.join(buildDir, 'CONTAINS_CLASS.csv');
    const containsTypeCsv = path.join(buildDir, 'CONTAINS_TYPE.csv');
    const classContainsCsv = path.join(buildDir, 'CLASS_CONTAINS.csv');
    const callsCsv = path.join(buildDir, 'CALLS.csv');
    const inheritsCsv = path.join(buildDir, 'INHERITS.csv');
    const implementsCsv = path.join(buildDir, 'IMPLEMENTS.csv');
    const importsFromCsv = path.join(buildDir, 'IMPORTS_FROM.csv');
    const dependsOnCsv = path.join(buildDir, 'DEPENDS_ON.csv');

    await writeCsv(fileCsv, ['path', 'language', 'sha256', 'size', 'lines', 'last_parsed'],
      records.files.map((row) => [row.path, row.language, row.sha256, row.size, row.lines, row.last_parsed]));
    await writeCsv(functionCsv, ['id', 'name', 'file_path', 'class_name', 'line_start', 'line_end', 'params', 'return_type', 'is_test', 'is_exported'],
      records.functions.map((row) => [row.id, row.name, row.file_path, row.class_name, row.line_start, row.line_end, row.params, row.return_type, row.is_test, row.is_exported]));
    await writeCsv(classCsv, ['id', 'name', 'file_path', 'line_start', 'line_end', 'is_exported'],
      records.classes.map((row) => [row.id, row.name, row.file_path, row.line_start, row.line_end, row.is_exported]));
    await writeCsv(typeCsv, ['id', 'name', 'file_path', 'kind', 'is_exported'],
      records.types.map((row) => [row.id, row.name, row.file_path, row.kind, row.is_exported]));
    await writeCsv(moduleCsv, ['path', 'is_external'],
      records.modules.map((row) => [row.path, row.is_external]));

    await writeCsv(containsFunctionCsv, ['from', 'to'], records.containsFunction.map((row) => [row.from, row.to]));
    await writeCsv(containsClassCsv, ['from', 'to'], records.containsClass.map((row) => [row.from, row.to]));
    await writeCsv(containsTypeCsv, ['from', 'to'], records.containsType.map((row) => [row.from, row.to]));
    await writeCsv(classContainsCsv, ['from', 'to'], records.classContains.map((row) => [row.from, row.to]));
    await writeCsv(callsCsv, ['from', 'to', 'line_number'], records.calls.map((row) => [row.from, row.to, row.line_number]));
    await writeCsv(inheritsCsv, ['from', 'to'], records.inherits.map((row) => [row.from, row.to]));
    await writeCsv(implementsCsv, ['from', 'to'], records.implements.map((row) => [row.from, row.to]));
    await writeCsv(importsFromCsv, ['from', 'to', 'symbols', 'is_default'],
      records.importsFrom.map((row) => [row.from, row.to, row.symbols, row.is_default]));
    await writeCsv(dependsOnCsv, ['from', 'to'], records.dependsOn.map((row) => [row.from, row.to]));

    await copy(conn, 'File', fileCsv);
    await copy(conn, 'Function', functionCsv);
    await copy(conn, 'Class', classCsv);
    await copy(conn, 'Type', typeCsv);
    await copy(conn, 'Module', moduleCsv);
    await copy(conn, 'CONTAINS_FUNCTION', containsFunctionCsv);
    await copy(conn, 'CONTAINS_CLASS', containsClassCsv);
    await copy(conn, 'CONTAINS_TYPE', containsTypeCsv);
    await copy(conn, 'CLASS_CONTAINS', classContainsCsv);
    await copy(conn, 'CALLS', callsCsv);
    await copy(conn, 'INHERITS', inheritsCsv);
    await copy(conn, 'IMPLEMENTS', implementsCsv);
    await copy(conn, 'IMPORTS_FROM', importsFromCsv);
    await copy(conn, 'DEPENDS_ON', dependsOnCsv);

    if (process.env.CODEXIA_KEEP_GRAPH_TMP !== '1') {
      await fs.rm(buildDir, { recursive: true, force: true });
    }
  } catch (error) {
    if (process.env.CODEXIA_KEEP_GRAPH_TMP !== '1') {
      await fs.rm(buildDir, { recursive: true, force: true });
    }
    throw error;
  }
}
