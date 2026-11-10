const assert = require('node:assert/strict');
const { trustedIdentityRequest } = require('../lib/trusted-identity.ts');

const identity = 'oai-authenticated-user-id';
const proof = 'x-mobiliza-auth-proxy-secret';
const secret = 'synthetic-proxy-secret-only-for-this-test';
const proxy = { MOBILIZA_AUTH_PROXY_SECRET: secret };
const request = (value) => new Request('https://preview.invalid/api/hub', {
  headers: {
    [identity]: 'synthetic-owner',
    'oai-authenticated-user-email': 'owner@example.invalid',
    'oai-authenticated-user-full-name': 'Synthetic',
    ...(value === undefined ? {} : { [proof]: value }),
  },
});

for (const [input, env] of [[request(), {}], [request(), proxy], [request(secret + 'x'), proxy], [request('short'), { MOBILIZA_AUTH_PROXY_SECRET: 'short' }]]) {
  const forwarded = trustedIdentityRequest(input, env);
  assert.deepEqual([...forwarded.headers], []);
}

const direct = trustedIdentityRequest(request(secret), proxy);
assert.equal(direct.headers.get(identity), 'synthetic-owner');
assert.equal(direct.headers.get(proof), null);
assert.equal(trustedIdentityRequest(request(), { MOBILIZA_TRUST_SITES_AUTH: '1' }).headers.get(identity), 'synthetic-owner');
assert.equal(trustedIdentityRequest(request(), {}, true).headers.get(identity), 'synthetic-owner');
const anonymous = new Request('https://preview.invalid/');
assert.equal(trustedIdentityRequest(anonymous, {}), anonymous);
console.log('PASS worker ingress strips forged identities and forwards verified proxy, Sites and preview identities.');
