const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ownerId = 'synthetic-original-owner';
const source = fs.readFileSync(path.join(__dirname, '../lib/cloudflare-owner-auth.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleExports = {};
new Function('require', 'exports', code)(id => id === './owner-access' ? { SITE_OWNER_ID: ownerId } : require(id), moduleExports);
const { resolveCloudflareOwner } = moduleExports;

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const origin = 'https://mobiliza-test.cloudflareaccess.com';
const env = { MOBILIZA_ACCESS_TEAM_URL: `${origin}/`, MOBILIZA_ACCESS_AUD: 'owner-audience', MOBILIZA_ACCESS_OWNER_SUB: 'verified-owner' };
const now = Math.floor(Date.now() / 1000);
const claims = { iss: origin, aud: [env.MOBILIZA_ACCESS_AUD], sub: env.MOBILIZA_ACCESS_OWNER_SUB, type: 'app', nbf: now - 10, exp: now + 300, email: 'owner@example.test' };
const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
function jwt(payload = {}, header = {}) {
  const unsigned = `${encode({ alg: 'RS256', kid: jwk.kid, ...header })}.${encode({ ...claims, ...payload })}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}
const request = token => new Request('https://portal.example.test/', { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });

(async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, `${origin}/cdn-cgi/access/certs`);
    assert.equal(init.redirect, 'error');
    return Response.json({ keys: [jwk] });
  };
  try {
    assert.equal(await resolveCloudflareOwner(request(), env), null);
    assert.equal(await resolveCloudflareOwner(request(jwt()), {}), null);
    for (const team of ['http://mobiliza-test.cloudflareaccess.com', `${origin}/wrong`, `${origin}.example.test`, `https://test@${origin.slice(8)}`]) {
      assert.equal(await resolveCloudflareOwner(request(jwt()), { ...env, MOBILIZA_ACCESS_TEAM_URL: team }), null);
    }
    for (const invalid of [
      jwt({ sub: 'other-user' }), jwt({ aud: ['other-audience'] }), jwt({ iss: 'https://other.cloudflareaccess.com' }),
      jwt({ exp: now - 1 }), jwt({ nbf: now + 600 }), jwt({ nbf: undefined }), jwt({ type: 'org' }), jwt({}, { alg: 'none' }),
    ]) {
      assert.equal(await resolveCloudflareOwner(request(invalid), env), null);
    }
    assert.equal(calls, 0);

    const valid = jwt({}, { jku: 'https://untrusted.example.test/keys' });
    const authenticated = { userId: ownerId, email: 'owner@example.test', fullName: null };
    assert.deepEqual(await resolveCloudflareOwner(request(valid), env), authenticated);
    assert.deepEqual(await resolveCloudflareOwner(request(valid), env), authenticated);
    assert.equal(calls, 1);

    const [header, , signature] = valid.split('.');
    const tampered = `${header}.${encode({ ...claims, email: 'changed@example.test' })}.${signature}`;
    assert.equal(await resolveCloudflareOwner(request(tampered), env), null);
    assert.equal(await resolveCloudflareOwner(request(jwt({}, { kid: 'missing' })), env), null);
    assert.equal(await resolveCloudflareOwner(request(jwt({ email: 'owner@example.test\r\ninvalid' })), env), null);

    const originalNow = Date.now;
    Date.now = () => (now + 120) * 1000;
    try {
      globalThis.fetch = async () => Response.json({ keys: [jwk, jwk] });
      assert.equal(await resolveCloudflareOwner(request(valid), env), null);
    } finally {
      Date.now = originalNow;
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('Cloudflare Access owner verification passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
