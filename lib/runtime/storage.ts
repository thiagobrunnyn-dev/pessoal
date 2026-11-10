// Adaptador compatível com a API do Cloudflare R2 usada pelo app (put/get/delete).
// Backends: 'supabase' (Supabase Storage, bucket privado) e 'local' (disco, para desenvolvimento/testes).
import {mkdirSync, promises as fs} from 'node:fs';
import path from 'node:path';

export type PutOptions = {httpMetadata?: {contentType?: string; cacheControl?: string}; customMetadata?: Record<string, string>};
export type StoredObject = {
  key: string; size: number; httpMetadata: {contentType?: string; cacheControl?: string};
  body: ReadableStream<Uint8Array>; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string>; json<T = unknown>(): Promise<T>;
};
export interface BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: PutOptions): Promise<{key: string; size: number}>;
  get(key: string): Promise<StoredObject | null>;
  delete(keys: string | string[]): Promise<void>;
}

function toBytes(value: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value;
}
function wrap(key: string, bytes: Uint8Array, contentType?: string): StoredObject {
  const copy = bytes.slice();
  return {
    key, size: copy.byteLength, httpMetadata: {contentType},
    get body() { return new Blob([copy as BlobPart]).stream(); },
    async arrayBuffer() { return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer; },
    async text() { return new TextDecoder().decode(copy); },
    async json<T>() { return JSON.parse(new TextDecoder().decode(copy)) as T; },
  };
}
function safeKey(key: string) {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) throw new Error('Chave de objeto inválida.');
  return key;
}

/** Disco local: STORAGE_DIR/<key>. Metadados em <key>.meta.json. */
export class LocalBucket implements BucketLike {
  constructor(private readonly root: string) { mkdirSync(root, {recursive: true}); }
  private file(key: string) { return path.join(this.root, safeKey(key)); }
  async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: PutOptions) {
    const bytes = toBytes(value), file = this.file(key);
    await fs.mkdir(path.dirname(file), {recursive: true});
    await fs.writeFile(file, bytes);
    await fs.writeFile(file + '.meta.json', JSON.stringify({contentType: options?.httpMetadata?.contentType ?? null}));
    return {key, size: bytes.byteLength};
  }
  async get(key: string) {
    try {
      const file = this.file(key);
      const [bytes, metaRaw] = await Promise.all([fs.readFile(file), fs.readFile(file + '.meta.json', 'utf8').catch(() => '{}')]);
      const meta = JSON.parse(metaRaw) as {contentType?: string | null};
      return wrap(key, new Uint8Array(bytes), meta.contentType ?? undefined);
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      const file = this.file(key);
      await Promise.all([fs.rm(file, {force: true}), fs.rm(file + '.meta.json', {force: true})]);
    }
  }
}

/** Supabase Storage via API REST (service role). Bucket privado; o app faz o proxy das fotos com seus próprios guards. */
export class SupabaseBucket implements BucketLike {
  private readonly base: string;
  constructor(url: string, private readonly serviceKey: string, private readonly bucket: string) {
    this.base = url.replace(/\/+$/, '') + '/storage/v1';
  }
  private headers(extra: Record<string, string> = {}) { return {Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra}; }
  private objectUrl(key: string) { return `${this.base}/object/${this.bucket}/${safeKey(key).split('/').map(encodeURIComponent).join('/')}`; }
  async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: PutOptions) {
    const bytes = toBytes(value);
    const res = await fetch(this.objectUrl(key), {
      method: 'POST',
      headers: this.headers({'Content-Type': options?.httpMetadata?.contentType || 'application/octet-stream', 'x-upsert': 'true', 'cache-control': '0'}),
      body: bytes as BodyInit,
    });
    if (!res.ok) throw new Error(`Supabase Storage put falhou (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return {key, size: bytes.byteLength};
  }
  async get(key: string) {
    const res = await fetch(this.objectUrl(key), {headers: this.headers()});
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`Supabase Storage get falhou (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    return wrap(key, bytes, res.headers.get('content-type') ?? undefined);
  }
  async delete(keys: string | string[]) {
    const prefixes = (Array.isArray(keys) ? keys : [keys]).map(safeKey);
    if (!prefixes.length) return;
    const res = await fetch(`${this.base}/object/${this.bucket}`, {
      method: 'DELETE', headers: this.headers({'Content-Type': 'application/json'}), body: JSON.stringify({prefixes}),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase Storage delete falhou (${res.status})`);
  }
}

export function createBucketFromEnv(env: NodeJS.ProcessEnv = process.env): BucketLike {
  const backend = (env.STORAGE_BACKEND || 'local').toLowerCase();
  if (backend === 'supabase') {
    const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY, bucket = env.SUPABASE_STORAGE_BUCKET || 'mobiliza';
    if (!url || !key) throw new Error('STORAGE_BACKEND=supabase exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
    return new SupabaseBucket(url, key, bucket);
  }
  if (backend === 'local') return new LocalBucket(env.STORAGE_DIR || path.resolve(env.DATA_DIR || './data', 'storage'));
  throw new Error(`STORAGE_BACKEND desconhecido: ${backend}`);
}
