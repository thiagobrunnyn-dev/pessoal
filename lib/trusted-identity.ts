import { timingSafeEqual } from 'node:crypto';

const identityPrefix = 'oai-authenticated-user-';
const proxySecretHeader = 'x-mobiliza-auth-proxy-secret';

type IdentityEnvironment = {
  MOBILIZA_TRUST_SITES_AUTH?: string;
  MOBILIZA_AUTH_PROXY_SECRET?: string;
};

function hasProxyProof(request: Request, secret: string | undefined) {
  const proof = request.headers.get(proxySecretHeader);
  if (!secret || secret.length < 32 || !proof) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(proof);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function trustedIdentityRequest(request: Request, env: IdentityEnvironment, localMockAuth = false) {
  const names = [...request.headers.keys()].filter(name => name.startsWith(identityPrefix));
  const trusted = localMockAuth || env.MOBILIZA_TRUST_SITES_AUTH === '1' ||
    (names.length > 0 && hasProxyProof(request, env.MOBILIZA_AUTH_PROXY_SECRET));
  if ((trusted || names.length === 0) && !request.headers.has(proxySecretHeader)) return request;

  const headers = new Headers(request.headers);
  headers.delete(proxySecretHeader);
  if (!trusted) for (const name of names) headers.delete(name);
  return new Request(request, { headers });
}
