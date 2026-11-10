import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {canAdminister,memberTitle,operatorGuard,recheckOperator,type Operator} from './app-access';
import {RequestError} from './http-security';
import {isSupabaseMemberId, type MemberRole} from './member-roles';
import {SITE_OWNER_ID} from './owner-access';

const COOKIE = '__Host-mobiliza-password';
const ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Strict';
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const SESSION_TOKEN = /^[a-f0-9]{64}$/;
const ACCESS_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SESSION_LIMIT = 3600;
const now = () => Math.floor(Date.now() / 1000);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const denied = () => new RequestError('E-mail ou senha inválidos, ou acesso não autorizado.', 401);
const unavailable = () => new RequestError('O login está temporariamente indisponível. Tente novamente.', 503);
export class PasswordChangeRequired extends RequestError {
  constructor(message = 'Escolha uma nova senha para concluir seu primeiro acesso.') { super(message, 409); }
}

type Configuration = {
  origin: string;
  key: string;
  ownerId: string;
  members: ReadonlyMap<string, string>;
};

function configuration(env: Cloudflare.Env): Configuration {
  const origin = env.MOBILIZA_SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = env.MOBILIZA_SUPABASE_PUBLISHABLE_KEY?.trim();
  const ownerId = env.MOBILIZA_SUPABASE_OWNER_ID?.trim().toLowerCase();
  if (!origin || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(origin) ||
      !key || !/^sb_publishable_[A-Za-z0-9_-]{10,128}$/.test(key) ||
      !ownerId || !UUID.test(ownerId)) throw unavailable();

  let mappings: unknown;
  try { mappings = JSON.parse(env.MOBILIZA_SUPABASE_MEMBERS || '{}'); }
  catch { throw unavailable(); }
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw unavailable();
  const members = new Map<string, string>();
  const linkedMembers = new Set<string>();
  const entries = Object.entries(mappings);
  if (entries.length > 200) throw unavailable();
  for (const [providerUserId, userId] of entries) {
    if (!UUID.test(providerUserId) || providerUserId === ownerId ||
        typeof userId !== 'string' || !userId || userId.length > 160 || userId === SITE_OWNER_ID || isSupabaseMemberId(userId) ||
        linkedMembers.has(userId)) throw unavailable();
    members.set(providerUserId, userId);
    linkedMembers.add(userId);
  }
  return {origin, key, ownerId, members};
}

function linkedUserId(config: Configuration, providerUserId: string) {
  if (config.ownerId === providerUserId) return SITE_OWNER_ID;
  return config.members.get(providerUserId) ?? 'supabase:' + providerUserId;
}

function sessionHash(request: Request) {
  const prefix = COOKIE + '=';
  const entries = (request.headers.get('cookie') ?? '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(prefix));
  if (entries.length !== 1) return null;
  const token = entries[0].slice(prefix.length);
  return SESSION_TOKEN.test(token) ? digest(token) : null;
}

async function authRequest(config: Configuration, path: string, options: RequestInit = {}, apiKey = config.key) {
  const headers = new Headers(options.headers);
  headers.set('apikey', apiKey);
  try {
    return await fetch(config.origin + '/auth/v1' + path, {
      ...options, headers, redirect: 'error', signal: AbortSignal.timeout(8000),
    });
  } catch { throw unavailable(); }
}

async function confirmedIdentity(config: Configuration, email: string, password: string) {
  const issuedAfter = now();
  const result = await authRequest(config, '/token?grant_type=password', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password}),
  });
  if (result.status === 429) throw new RequestError('Muitas tentativas. Aguarde antes de tentar novamente.', 429);
  if ([400, 401, 403, 422].includes(result.status)) throw denied();
  if (!result.ok) throw unavailable();

  const token = await result.json<{access_token?: unknown; expires_in?: unknown}>();
  if (typeof token.access_token !== 'string' || token.access_token.length > 6000 ||
      !ACCESS_TOKEN.test(token.access_token) || typeof token.expires_in !== 'number' ||
      !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0) throw unavailable();
  const response = await authRequest(config, '/user', {
    headers: {Authorization: 'Bearer ' + token.access_token},
  });
  if ([401, 403, 404].includes(response.status)) throw denied();
  if (!response.ok) throw unavailable();
  const user = await response.json<{id?: unknown; email?: unknown; email_confirmed_at?: unknown; is_anonymous?: unknown}>();
  if (typeof user.id !== 'string' || !UUID.test(user.id) || typeof user.email !== 'string' ||
      user.email.toLowerCase() !== email || typeof user.email_confirmed_at !== 'string' ||
      !Number.isFinite(Date.parse(user.email_confirmed_at)) || user.is_anonymous === true) throw denied();
  return {id: user.id, email, accessToken: token.access_token, expiresAt: issuedAfter + Math.min(token.expires_in, SESSION_LIMIT)};
}

async function activeMember(db: D1Database, userId: string, email: string) {
  const member = await db.prepare(`SELECT user_id AS userId, email, display_name AS fullName, role, revision,
    password_change_required AS passwordChangeRequired
    FROM app_members WHERE user_id=? AND lower(email)=? AND status='active'`)
    .bind(userId, email).first<{userId: string; email: string; fullName: string | null; role: string; revision: number; passwordChangeRequired: number}>();
  return member && memberTitle(member) ? member : null;
}

async function limitPasswordAttempt(db: D1Database, request: Request) {
  const window = Math.floor(now() / 300);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const id = 'password:' + window + ':' + digest(ip + ':' + window);
  const limit = await db.prepare(`INSERT INTO visit_rate_limits (id, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 WHERE attempts < 12 RETURNING attempts`)
    .bind(id, (window + 1) * 300).first();
  if (!limit) throw new RequestError('Muitas tentativas. Aguarde antes de tentar novamente.', 429);
  await db.prepare(`DELETE FROM visit_rate_limits WHERE id IN (
    SELECT id FROM visit_rate_limits WHERE id LIKE 'password:%' AND expires_at < unixepoch() LIMIT 50)`).run();
}

async function replaceInitialPassword(db: D1Database, config: Configuration, member: NonNullable<Awaited<ReturnType<typeof activeMember>>>,
  accessToken: string, password: string, newPassword: string | undefined) {
  if (!newPassword || newPassword === password || [...newPassword].length < 12 || Buffer.byteLength(newPassword) > 72) {
    throw new PasswordChangeRequired('Escolha uma senha diferente da inicial, com pelo menos 12 caracteres e até 72 bytes.');
  }
  const lock = now();
  const claim = await db.prepare(`UPDATE app_members SET password_change_required=?
    WHERE user_id=? AND status='active' AND revision=?
    AND password_change_required BETWEEN 1 AND ? RETURNING user_id`)
    .bind(lock, member.userId, member.revision, lock - 60).first();
  if (!claim) throw new PasswordChangeRequired('A troca de senha está em andamento. Tente novamente em instantes.');
  try {
    const updated = await authRequest(config, '/user', {
      method: 'PUT',
      headers: {Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json'},
      body: JSON.stringify({password: newPassword}),
    });
    if (!updated.ok) throw new PasswordChangeRequired('A nova senha foi recusada. Escolha outra e tente novamente.');
    const saved = await db.prepare(`UPDATE app_members SET password_change_required=0, revision=revision+1
      WHERE user_id=? AND status='active' AND revision=? AND password_change_required=?`)
      .bind(member.userId, member.revision, lock).run();
    if (saved.meta.changes !== 1) throw denied();
    return member.revision + 1;
  } catch (error) {
    await db.prepare('UPDATE app_members SET password_change_required=1 WHERE user_id=? AND password_change_required=?')
      .bind(member.userId, lock).run();
    throw error;
  }
}

export async function signInWithPassword(request: Request, env: Cloudflare.Env, email: string, password: string, newPassword?: string) {
  const config = configuration(env);
  const db = env.DB;
  if (!db) throw unavailable();
  await limitPasswordAttempt(db, request);
  const identity = await confirmedIdentity(config, email, password);
  const userId = linkedUserId(config, identity.id);
  const member = userId === SITE_OWNER_ID ? null : await activeMember(db, userId, identity.email);
  if (!member && userId !== SITE_OWNER_ID) throw denied();
  let revision = member?.revision ?? null;
  if (member?.passwordChangeRequired) {
    revision = await replaceInitialPassword(db, config, member, identity.accessToken, password, newPassword);
  }

  const token = randomBytes(32).toString('hex');
  const existing = sessionHash(request);
  await db.batch([
    db.prepare(`INSERT INTO password_sessions
      (session_hash, provider_origin, provider_user_id, user_id, email, member_revision, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(digest(token), config.origin, identity.id, userId, identity.email, revision, identity.expiresAt),
    db.prepare(`DELETE FROM password_sessions WHERE session_hash=? OR session_hash IN (
      SELECT session_hash FROM password_sessions WHERE expires_at<=unixepoch() LIMIT 50)`).bind(existing),
  ]);
  return COOKIE + '=' + token + '; ' + ATTRIBUTES + '; Max-Age=' + Math.max(0, identity.expiresAt - now());
}

export async function resolvePasswordSession(request: Request, env: Cloudflare.Env): Promise<{
  userId: string; email: string; fullName: string | null; revision: number | null;
} | null> {
  const hash = sessionHash(request);
  if (!hash || !env.DB) return null;
  let config: Configuration;
  try { config = configuration(env); } catch { return null; }
  const row = await env.DB.prepare(`SELECT provider_user_id AS providerUserId, user_id AS userId, email, member_revision AS revision
    FROM password_sessions WHERE session_hash=? AND provider_origin=? AND expires_at>unixepoch()`)
    .bind(hash, config.origin)
    .first<{providerUserId: string; userId: string; email: string; revision: number | null}>();
  if (!row || linkedUserId(config, row.providerUserId) !== row.userId) return null;
  if (row.userId === SITE_OWNER_ID) return {userId: row.userId, email: row.email, fullName: null, revision: null};
  const member = await activeMember(env.DB, row.userId, row.email);
  return member?.revision === row.revision && member.passwordChangeRequired === 0 ? member : null;
}

export async function revokePasswordSession(request: Request, db: D1Database) {
  const hash = sessionHash(request);
  if (hash) await db.prepare('DELETE FROM password_sessions WHERE session_hash=?').bind(hash).run();
}

export function clearPasswordSessionCookie() {
  return COOKIE + '=; ' + ATTRIBUTES + '; Max-Age=0';
}

export async function createPasswordMember(env: Cloudflare.Env, input: {name: string; email: string; role: MemberRole}, admin: Operator) {
  if (!canAdminister(admin)) throw new RequestError('Apenas o administrador pode cadastrar usuários.', 403);
  const config = configuration(env);
  const secret = env.MOBILIZA_SUPABASE_SECRET_KEY?.trim();
  const db = env.DB;
  if (!db || !secret || !/^sb_secret_[A-Za-z0-9_-]{10,128}$/.test(secret)) {
    throw new RequestError('O cadastro de usuários ainda precisa ser configurado.', 503);
  }
  const providerId = randomUUID();
  const userId = 'supabase:' + providerId;
  const temporaryPassword = randomBytes(24).toString('base64url') + 'aA7!';
  const createdAt = new Date().toISOString();
  const auth = operatorGuard(admin);
  const reservation = await db.prepare(`INSERT INTO app_members
    (user_id, email, display_name, role, status, revision, requested_at, password_change_required)
    SELECT ?, ?, ?, ?, 'provisioning', 0, ?, 1
    WHERE NOT EXISTS (SELECT 1 FROM app_members WHERE lower(email)=?) AND ${auth.sql}`)
    .bind(userId, input.email, input.name, input.role, createdAt, input.email, ...auth.args).run();
  if (reservation.meta.changes !== 1) {
    await recheckOperator(admin);
    throw new RequestError('Já existe um cadastro ou uma criação pendente para este e-mail.', 409);
  }
  try {
    await recheckOperator(admin);
  } catch (error) {
    await db.prepare("DELETE FROM app_members WHERE user_id=? AND status='provisioning'").bind(userId).run();
    throw error;
  }

  const pending = () => new RequestError('O cadastro está pendente. Confira a conta no Supabase antes de repetir.', 503);
  let response: Response;
  try {
    response = await authRequest(config, '/admin/users', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: providerId, email: input.email, password: temporaryPassword, email_confirm: true}),
    }, secret);
  } catch { throw pending(); }
  if ([400, 401, 403, 409, 422, 429].includes(response.status)) {
    await db.prepare("DELETE FROM app_members WHERE user_id=? AND status='provisioning'").bind(userId).run();
    if ([409, 422].includes(response.status)) throw new RequestError('O Supabase recusou o cadastro. Confira se já existe uma conta para este e-mail.', 409);
    throw new RequestError('O Supabase recusou a criação da conta. Confira a configuração e tente novamente.', 503);
  }
  if (!response.ok) throw pending();
  const created = await response.json<{id?: unknown; email?: unknown}>();
  if (created.id !== providerId || created.email !== input.email) throw pending();
  const active = await db.prepare(`UPDATE app_members SET status='active', revision=1, approved_at=?, approved_by=?
    WHERE user_id=? AND status='provisioning' AND email=? AND ${auth.sql}`)
    .bind(createdAt, admin.actor.userId, userId, input.email, ...auth.args).run();
  if (active.meta.changes !== 1) throw pending();
  return {email: input.email, temporary_password: temporaryPassword};
}
