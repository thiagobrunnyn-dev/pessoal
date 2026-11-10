// Gateway de identidade: valida a sessão do Supabase Auth (cookie) e injeta os headers confiáveis
// `oai-authenticated-user-*` que o app já consome. Qualquer header desses vindo do cliente é descartado antes.
import type {IncomingHttpHeaders} from 'node:http';
import {createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey} from 'jose';

export const USER_ID_HEADER = 'oai-authenticated-user-id';
export const USER_EMAIL_HEADER = 'oai-authenticated-user-email';
export const USER_FULL_NAME_HEADER = 'oai-authenticated-user-full-name';
export const USER_FULL_NAME_ENCODING_HEADER = 'oai-authenticated-user-full-name-encoding';
const IDENTITY_HEADERS = [USER_ID_HEADER, USER_EMAIL_HEADER, USER_FULL_NAME_HEADER, USER_FULL_NAME_ENCODING_HEADER];

export type VerifiedUser = {userId: string; email: string; fullName: string | null};

export type GatewayConfig = {
  supabaseUrl: string;
  /** Segredo HS256 legado (Project Settings → API → JWT Secret). Se ausente, usa o JWKS do projeto (chaves assimétricas). */
  jwtSecret?: string;
  /** Tolerância de relógio em segundos. */
  clockTolerance?: number;
};

export function projectRef(supabaseUrl: string): string {
  const host = new URL(supabaseUrl).hostname;
  return host.split('.')[0];
}

/** Lê e junta o cookie `sb-<ref>-auth-token` (possivelmente fragmentado em .0, .1, ...). */
export function readSessionCookie(cookieHeader: string | undefined, ref: string): string | null {
  if (!cookieHeader) return null;
  const name = `sb-${ref}-auth-token`;
  const parts = new Map<number, string>();
  let whole: string | null = null;
  for (const raw of cookieHeader.split(';')) {
    const i = raw.indexOf('=');
    if (i < 0) continue;
    const key = raw.slice(0, i).trim(), value = raw.slice(i + 1).trim();
    if (key === name) whole = value;
    else if (key.startsWith(name + '.')) {
      const n = Number(key.slice(name.length + 1));
      if (Number.isInteger(n)) parts.set(n, value);
    }
  }
  if (whole) return whole;
  if (!parts.size) return null;
  return [...parts.keys()].sort((a, b) => a - b).map(k => parts.get(k)!).join('');
}

/** Extrai o access_token do valor do cookie (formato `base64-<json>` do @supabase/ssr ou JSON puro/percent-encoded). */
export function accessTokenFromCookie(value: string): string | null {
  try {
    let json: string;
    if (value.startsWith('base64-')) json = Buffer.from(value.slice(7), 'base64url').toString('utf8');
    else json = decodeURIComponent(value);
    const parsed = JSON.parse(json) as {access_token?: string} | [string, ...unknown[]];
    if (Array.isArray(parsed)) return typeof parsed[0] === 'string' ? parsed[0] : null;
    return typeof parsed.access_token === 'string' ? parsed.access_token : null;
  } catch { return null; }
}

export class IdentityGateway {
  private readonly ref: string;
  private readonly key: JWTVerifyGetKey | Uint8Array;
  private readonly issuer: string;
  private readonly tolerance: number;
  constructor(private readonly config: GatewayConfig) {
    this.ref = projectRef(config.supabaseUrl);
    this.issuer = config.supabaseUrl.replace(/\/+$/, '') + '/auth/v1';
    this.tolerance = config.clockTolerance ?? 30;
    this.key = config.jwtSecret
      ? new TextEncoder().encode(config.jwtSecret)
      : createRemoteJWKSet(new URL(this.issuer + '/.well-known/jwks.json'), {cooldownDuration: 30_000, cacheMaxAge: 600_000});
  }
  async verifyToken(token: string): Promise<VerifiedUser | null> {
    try {
      const {payload} = this.key instanceof Uint8Array
        ? await jwtVerify(token, this.key, {issuer: this.issuer, audience: 'authenticated', clockTolerance: this.tolerance, algorithms: ['HS256']})
        : await jwtVerify(token, this.key, {issuer: this.issuer, audience: 'authenticated', clockTolerance: this.tolerance});
      return userFromClaims(payload);
    } catch { return null; }
  }
  async userFromCookies(cookieHeader: string | undefined): Promise<VerifiedUser | null> {
    const raw = readSessionCookie(cookieHeader, this.ref);
    if (!raw) return null;
    const token = accessTokenFromCookie(raw);
    return token ? this.verifyToken(token) : null;
  }
  /** Remove headers de identidade forjados e aplica os verificados. Muta `headers` (req.headers do Node). */
  async apply(headers: IncomingHttpHeaders): Promise<VerifiedUser | null> {
    for (const h of IDENTITY_HEADERS) delete headers[h];
    const user = await this.userFromCookies(typeof headers.cookie === 'string' ? headers.cookie : undefined);
    if (!user) return null;
    headers[USER_ID_HEADER] = user.userId;
    headers[USER_EMAIL_HEADER] = user.email;
    if (user.fullName) {
      headers[USER_FULL_NAME_HEADER] = encodeURIComponent(user.fullName);
      headers[USER_FULL_NAME_ENCODING_HEADER] = 'percent-encoded-utf-8';
    }
    return user;
  }
}

export function userFromClaims(claims: JWTPayload): VerifiedUser | null {
  const sub = typeof claims.sub === 'string' ? claims.sub : null;
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!sub || !email) return null;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = [meta.full_name, meta.name, meta.display_name].find(v => typeof v === 'string' && v.trim()) as string | undefined;
  return {userId: sub, email, fullName: fullName?.trim() || null};
}
