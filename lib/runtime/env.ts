// Substituto de `import {env} from 'cloudflare:workers'`.
// Fornece os bindings DB (D1-compatível sobre SQLite) e BUCKET (R2-compatível) a partir de variáveis de ambiente.
// Inicialização preguiçosa e única por processo. Em testes, `setRuntimeEnv` injeta implementações falsas.
import path from 'node:path';
import {SqliteD1Database} from './d1-sqlite';
import {createBucketFromEnv, type BucketLike} from './storage';
import {runMigrations} from './migrate';

export type RuntimeEnv = {DB?: D1Database; BUCKET?: R2Bucket};

// Estado compartilhado via globalThis: o server.ts (compilado à parte) e o bundle do Next usam a MESMA conexão SQLite.
type Shared = {cached: RuntimeEnv | null; override: RuntimeEnv | null};
const shared: Shared = ((globalThis as any).__mobilizaRuntime ??= {cached: null, override: null});

export function dataDir() { return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || './data'); }
export function databasePath() { return process.env.DATABASE_PATH || path.join(dataDir(), 'mobiliza.sqlite'); }
export function migrationsDir() { return path.resolve(/*turbopackIgnore: true*/ process.env.MIGRATIONS_DIR || './drizzle'); }

export function openDatabase(file = databasePath(), {migrate = process.env.AUTO_MIGRATE !== 'false'} = {}): SqliteD1Database {
  const db = new SqliteD1Database(file);
  if (migrate) {
    const {applied} = runMigrations(db, migrationsDir(), m => console.log('[db]', m));
    if (applied.length) console.log(`[db] ${applied.length} migração(ões) aplicada(s) em ${file}`);
  }
  return db;
}

function build(): RuntimeEnv {
  const db = openDatabase();
  const bucket: BucketLike = createBucketFromEnv();
  return {DB: db as unknown as D1Database, BUCKET: bucket as unknown as R2Bucket};
}

export function getRuntimeEnv(): RuntimeEnv {
  if (shared.override) return shared.override;
  if (!shared.cached) shared.cached = build();
  return shared.cached;
}

/** Para testes: substitui os bindings. Passe null para voltar ao padrão. */
export function setRuntimeEnv(value: RuntimeEnv | null) { shared.override = value; }

// Mesma forma de uso do original: `env.DB`, `env.BUCKET`.
export const env: RuntimeEnv = {
  get DB() { return getRuntimeEnv().DB; },
  get BUCKET() { return getRuntimeEnv().BUCKET; },
};
