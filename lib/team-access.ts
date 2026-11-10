import { createHash, randomBytes } from 'node:crypto';
import { RequestError } from './http-security';
import { SITE_OWNER_ID } from './owner-access';

const TEAM_SESSION_COOKIE = '__Host-mobiliza-team';
const CODE_SECONDS = 30 * 60;
const SESSION_SECONDS = 8 * 60 * 60;
const SESSION_PATTERN = /^[a-f0-9]{64}$/;
const cookieAttributes = 'HttpOnly; Secure; SameSite=Strict; Path=/';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const epoch = () => Math.floor(Date.now() / 1000);

function teamSessionToken(request: Request) {
  const prefix = TEAM_SESSION_COOKIE + '=';
  const values = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim());
  const cookies = values.filter(value => value.startsWith(prefix));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(prefix.length);
  return SESSION_PATTERN.test(token) ? token : null;
}

export function teamSessionCookie(sessionToken: string, expiresAt: number) {
  if (!SESSION_PATTERN.test(sessionToken) || !Number.isSafeInteger(expiresAt)) throw new Error('Invalid team session.');
  const maxAge = Math.max(0, Math.min(SESSION_SECONDS, expiresAt - epoch()));
  return `${TEAM_SESSION_COOKIE}=${sessionToken}; ${cookieAttributes}; Max-Age=${maxAge}`;
}

export function clearTeamSessionCookie() {
  return `${TEAM_SESSION_COOKIE}=; ${cookieAttributes}; Max-Age=0`;
}

export async function issueTeamCode(db: D1Database, member: { userId: string; revision: number }, issuedBy: string) {
  if (issuedBy !== SITE_OWNER_ID || member.userId === SITE_OWNER_ID) {
    throw new RequestError('Somente o administrador pode emitir códigos para a equipe.', 403);
  }
  const raw = randomBytes(16).toString('hex');
  const codeHash = hash(raw);
  const createdAt = epoch();
  const expiresAt = createdAt + CODE_SECONDS;
  const [created] = await db.batch([
    db.prepare(`INSERT INTO team_access_grants (code_hash, member_user_id, member_revision, issued_by, created_at, code_expires_at)
      SELECT ?, user_id, revision, ?, ?, ? FROM app_members
      WHERE user_id=? AND status='active' AND revision=?`)
      .bind(codeHash, issuedBy, createdAt, expiresAt, member.userId, member.revision),
    db.prepare(`UPDATE team_access_grants SET revoked_at=unixepoch()
      WHERE member_user_id=? AND code_hash<>? AND redeemed_at IS NULL AND revoked_at IS NULL AND code_expires_at>unixepoch()
      AND EXISTS (SELECT 1 FROM team_access_grants WHERE code_hash=?)`)
      .bind(member.userId, codeHash, codeHash),
  ]);
  if (!created.meta.changes) throw new RequestError('O acesso da pessoa mudou. Atualize a equipe antes de emitir o código.', 409);
  return { code: raw.match(/.{8}/g)!.join('-'), expiresAt };
}

export async function redeemTeamCode(db: D1Database, code: string) {
  const raw = code.trim().toLowerCase();
  if (!/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{8}){3})$/.test(raw)) return null;
  const sessionToken = randomBytes(32).toString('hex');
  const grant = await db.prepare(`UPDATE team_access_grants SET
      redeemed_at=unixepoch(), session_hash=?, session_expires_at=unixepoch()+?
    WHERE code_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND code_expires_at>unixepoch()
      AND issued_by=? AND member_user_id<>?
      AND EXISTS (SELECT 1 FROM app_members m WHERE m.user_id=member_user_id AND m.revision=member_revision AND m.status='active')
    RETURNING session_expires_at`)
    .bind(hash(sessionToken), SESSION_SECONDS, hash(raw.replaceAll('-', '')), SITE_OWNER_ID, SITE_OWNER_ID)
    .first<{ session_expires_at: number }>();
  return grant ? { sessionToken, expiresAt: grant.session_expires_at } : null;
}

export async function resolveTeamSession(request: Request, db: D1Database) {
  const token = teamSessionToken(request);
  if (!token) return null;
  const member = await db.prepare(`SELECT m.user_id AS userId, m.email, m.display_name AS fullName
    FROM team_access_grants g JOIN app_members m ON m.user_id=g.member_user_id AND m.revision=g.member_revision
    WHERE g.session_hash=? AND g.redeemed_at IS NOT NULL AND g.revoked_at IS NULL AND g.session_expires_at>unixepoch()
      AND g.issued_by=? AND m.user_id<>? AND m.status='active'`)
    .bind(hash(token), SITE_OWNER_ID, SITE_OWNER_ID)
    .first<{ userId: string; email: string; fullName: string }>();
  return member;
}

export async function revokeTeamSession(request: Request, db: D1Database) {
  const token = teamSessionToken(request);
  if (!token) return;
  await db.prepare('UPDATE team_access_grants SET revoked_at=unixepoch() WHERE session_hash=? AND revoked_at IS NULL')
    .bind(hash(token)).run();
}
