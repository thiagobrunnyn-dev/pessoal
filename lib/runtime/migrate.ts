// Aplica as migrações Drizzle (drizzle/*.sql) em ordem, uma transação por arquivo.
// O marcador `--> statement-breakpoint` é um comentário SQL válido; o arquivo inteiro é executado com exec().
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import type {SqliteD1Database} from './d1-sqlite';

const TABLE = '__migrations';

export function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
}

export function runMigrations(db: SqliteD1Database, dir: string, log: (msg: string) => void = () => {}): {applied: string[]; skipped: number} {
  db.statement(`CREATE TABLE IF NOT EXISTS ${TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`).run();
  const done = new Set((db.statement(`SELECT name FROM ${TABLE}`).all() as {name: string}[]).map(r => r.name));
  const applied: string[] = [];
  let skipped = 0;
  for (const file of listMigrationFiles(dir)) {
    if (done.has(file)) { skipped++; continue; }
    const sql = readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      // exec() dentro de transação: node:sqlite permite múltiplos statements.
      (db as unknown as {conn: {exec(s: string): void}}).conn.exec(sql);
      db.statement(`INSERT INTO ${TABLE} (name, applied_at) VALUES (?, ?)`).run(file, new Date().toISOString());
    });
    applied.push(file);
    log(`migração aplicada: ${file}`);
  }
  return {applied, skipped};
}
