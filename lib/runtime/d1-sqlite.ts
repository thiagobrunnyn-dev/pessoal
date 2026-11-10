// Adaptador compatível com a API do Cloudflare D1 sobre `node:sqlite` (DatabaseSync).
// D1 é SQLite: o SQL do app, as migrações e os triggers rodam sem alteração.
// Cobre a superfície usada pelo app: prepare().bind().all()/first()/run(), batch(), exec().
import {DatabaseSync, type SQLInputValue, type StatementSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

type Row = Record<string, unknown>;
type Meta = {changes: number; last_row_id: number; duration: number; rows_read: number; rows_written: number; size_after: number; changed_db: boolean};

const BEGIN = 'BEGIN IMMEDIATE', COMMIT = 'COMMIT', ROLLBACK = 'ROLLBACK';

/** D1 aceita boolean/undefined/ArrayBuffer; node:sqlite não. Normaliza para o que o SQLite entende. */
function toSqlite(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return BigInt(value ? 1 : 0);
  // node:sqlite faz bind de `number` como REAL; o D1 grava inteiros como INTEGER (os triggers checam typeof()='integer').
  if (typeof value === 'number') return Number.isSafeInteger(value) ? BigInt(value) : value;
  if (typeof value === 'bigint' || typeof value === 'string') return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof Date) return value.toISOString();
  throw new TypeError(`Tipo de parâmetro SQL não suportado: ${Object.prototype.toString.call(value)}`);
}

/** node:sqlite devolve linhas com protótipo nulo; o D1 devolve objetos comuns. Normaliza para evitar surpresas em spreads/asserções. */
function plain<T>(row: unknown): T { return Object.assign({}, row as object) as T; }
function plainAll<T>(rows: unknown[]): T[] { return rows.map(r => plain<T>(r)); }

function meta(result: {changes: number | bigint; lastInsertRowid: number | bigint}, durationMs: number): Meta {
  return {changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid), duration: durationMs, rows_read: 0, rows_written: Number(result.changes), size_after: 0, changed_db: Number(result.changes) > 0};
}

export class SqliteD1PreparedStatement {
  readonly sql: string;
  readonly args: SQLInputValue[];
  private readonly db: SqliteD1Database;
  constructor(db: SqliteD1Database, sql: string, args: SQLInputValue[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...values: unknown[]) { return new SqliteD1PreparedStatement(this.db, this.sql, values.map(toSqlite)); }
  private stmt(): StatementSync { return this.db.statement(this.sql); }
  async first<T = Row>(column?: string): Promise<T | null> {
    const raw = this.stmt().get(...this.args);
    if (raw === undefined) return null;
    const row = plain<Row>(raw);
    if (column !== undefined) return (column in row ? (row[column] as T) : null);
    return row as T;
  }
  async all<T = Row>(): Promise<{results: T[]; success: true; meta: Meta}> {
    const started = performance.now();
    const results = plainAll<T>(this.stmt().all(...this.args));
    return {results, success: true, meta: meta({changes: 0, lastInsertRowid: 0}, performance.now() - started)};
  }
  async run<T = Row>(): Promise<{results: T[]; success: true; meta: Meta}> {
    const started = performance.now();
    const r = this.stmt().run(...this.args);
    return {results: [], success: true, meta: meta(r, performance.now() - started)};
  }
  async raw<T = unknown[]>(options?: {columnNames?: boolean}): Promise<T[]> {
    const rows = plainAll<Row>(this.stmt().all(...this.args));
    const out: unknown[][] = rows.map(r => Object.values(r));
    if (options?.columnNames && rows[0]) out.unshift(Object.keys(rows[0]));
    return out as T[];
  }
  /** Execução síncrona usada dentro de batch (transação). */
  runSync() { return this.stmt().run(...this.args); }
  allSync<T = Row>() { return plainAll<T>(this.stmt().all(...this.args)); }
}

export class SqliteD1Database {
  private readonly conn: DatabaseSync;
  private readonly cache = new Map<string, StatementSync>();
  readonly file: string;
  constructor(file: string) {
    this.file = file;
    if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
    this.conn = new DatabaseSync(file);
    // Mesmas garantias do D1: chaves estrangeiras ativas. WAL para leitura concorrente; busy_timeout para gravações.
    this.conn.exec('PRAGMA foreign_keys=ON');
    if (file !== ':memory:') { this.conn.exec('PRAGMA journal_mode=WAL'); this.conn.exec('PRAGMA synchronous=NORMAL'); }
    this.conn.exec('PRAGMA busy_timeout=5000');
  }
  statement(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) { s = this.conn.prepare(sql); if (this.cache.size > 2000) this.cache.clear(); this.cache.set(sql, s); }
    return s;
  }
  prepare(sql: string) { return new SqliteD1PreparedStatement(this, sql); }
  /** D1.batch é atômico: tudo ou nada. */
  async batch<T = Row>(statements: SqliteD1PreparedStatement[]): Promise<{results: T[]; success: true; meta: Meta}[]> {
    this.conn.exec(BEGIN);
    try {
      const out = statements.map(s => {
        const started = performance.now();
        const isRead = /^\s*(SELECT|WITH|PRAGMA)\b/i.test(s.sql) && !/\bRETURNING\b/i.test(s.sql);
        if (isRead) return {results: s.allSync<T>(), success: true as const, meta: meta({changes: 0, lastInsertRowid: 0}, performance.now() - started)};
        // Statements de escrita com RETURNING devolvem linhas: usa all() para capturá-las e changes via total_changes.
        if (/\bRETURNING\b/i.test(s.sql)) {
          const before = this.totalChanges();
          const results = s.allSync<T>();
          return {results, success: true as const, meta: meta({changes: this.totalChanges() - before, lastInsertRowid: 0}, performance.now() - started)};
        }
        return {results: [] as T[], success: true as const, meta: meta(s.runSync(), performance.now() - started)};
      });
      this.conn.exec(COMMIT);
      return out;
    } catch (e) {
      try { this.conn.exec(ROLLBACK); } catch { /* já revertido */ }
      throw e;
    }
  }
  async exec(sql: string): Promise<{count: number; duration: number}> {
    const started = performance.now();
    this.conn.exec(sql);
    return {count: sql.split(';').filter(x => x.trim()).length, duration: performance.now() - started};
  }
  private totalChanges(): number {
    return Number((this.conn.prepare('SELECT total_changes() c').get() as {c: number}).c);
  }
  /** Transação síncrona genérica (uso interno: migrações, backup). */
  transaction<T>(run: () => T): T {
    this.conn.exec(BEGIN);
    try { const r = run(); this.conn.exec(COMMIT); return r; } catch (e) { try { this.conn.exec(ROLLBACK); } catch {} throw e; }
  }
  close() { this.cache.clear(); this.conn.close(); }
}
