import { SITE_OWNER_ID } from './owner-access';

export type CloudflareOwnerAuthEnv = {
  MOBILIZA_ACCESS_TEAM_URL?: string;
  MOBILIZA_ACCESS_AUD?: string;
  MOBILIZA_ACCESS_OWNER_SUB?: string;
};

const teamUrlPattern = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com\/?$/i;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const rsa = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
let cachedKeys: { origin: string; expiresAt: number; keys: unknown[] } | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeBytes(value: string) {
  const bytes = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(bytes, character => character.charCodeAt(0));
}

function decodeJson(value: string): unknown {
  return JSON.parse(decoder.decode(decodeBytes(value)));
}

function validClaims(claims: Record<string, unknown>, origin: string, audience: string, ownerSubject: string) {
  const { iss, aud, sub, type, exp, nbf } = claims;
  const now = Math.floor(Date.now() / 1000);
  return iss === origin && sub === ownerSubject && type === 'app'
    && (aud === audience || (Array.isArray(aud) && aud.every(value => typeof value === 'string') && aud.includes(audience)))
    && typeof exp === 'number' && Number.isSafeInteger(exp) && exp > now
    && typeof nbf === 'number' && Number.isSafeInteger(nbf) && nbf <= now;
}

async function signingKey(origin: string, kid: string) {
  // Cache only a completed public key set. It is short lived so key rotation takes effect promptly.
  if (cachedKeys?.origin !== origin || cachedKeys.expiresAt <= Date.now()) {
    const response = await fetch(`${origin}/cdn-cgi/access/certs`, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const jwks: unknown = await response.json();
    if (!isRecord(jwks) || !Array.isArray(jwks.keys)) return null;
    cachedKeys = { origin, expiresAt: Date.now() + 60_000, keys: jwks.keys };
  }
  const matches = cachedKeys.keys.filter(key => isRecord(key) && key.kid === kid);
  const jwk = matches[0];
  if (matches.length !== 1 || !isRecord(jwk) || jwk.kty !== 'RSA' || jwk.alg !== 'RS256' || jwk.use !== 'sig') return null;
  const key = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, rsa, false, ['verify']);
  return (key.algorithm as RsaHashedKeyAlgorithm).modulusLength >= 2048 ? key : null;
}

export async function resolveCloudflareOwner(request: Request, env: CloudflareOwnerAuthEnv) {
  const teamUrl = env.MOBILIZA_ACCESS_TEAM_URL?.trim();
  const audience = env.MOBILIZA_ACCESS_AUD?.trim();
  const ownerSubject = env.MOBILIZA_ACCESS_OWNER_SUB?.trim();
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!teamUrl || !teamUrlPattern.test(teamUrl) || !audience || !ownerSubject || !token || token.length > 8192) return null;

  try {
    const origin = new URL(teamUrl).origin;
    const parts = token.split('.');
    if (parts.length !== 3 || !parts.every(part => base64UrlPattern.test(part))) return null;
    const [encodedHeader, encodedClaims, encodedSignature] = parts;
    const header = decodeJson(encodedHeader);
    const claims = decodeJson(encodedClaims);
    if (!isRecord(header) || header.alg !== 'RS256' || header.crit !== undefined || header.b64 !== undefined
      || typeof header.kid !== 'string' || header.kid.length > 128 || !base64UrlPattern.test(header.kid)) return null;
    if (!isRecord(claims) || !validClaims(claims, origin, audience, ownerSubject)) return null;

    const key = await signingKey(origin, header.kid);
    if (!key || !await crypto.subtle.verify(rsa, key, decodeBytes(encodedSignature), encoder.encode(`${encodedHeader}.${encodedClaims}`))) return null;
    if (!validClaims(claims, origin, audience, ownerSubject)) return null;

    // Email is signed display metadata. Only the configured subject can become the owner.
    const email = claims.email;
    if (typeof email !== 'string' || email.length > 254 || !/^[!-?A-~]+@[a-z0-9.-]+$/i.test(email)) return null;
    return { userId: SITE_OWNER_ID, email, fullName: null };
  } catch {
    return null;
  }
}
