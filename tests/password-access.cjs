/* eslint-disable @typescript-eslint/no-require-imports -- Use the CommonJS transpile harness shared by the backend suites. */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const { tag } of require('../drizzle/meta/_journal.json').entries) {
  sqlite.exec(fs.readFileSync(path.join(root, 'drizzle', `${tag}.sql`), 'utf8'));
}

class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
  async run() { return { meta: sqlite.prepare(this.sql).run(...this.args) }; }
}

const env = {
  MOBILIZA_SUPABASE_AUTH: '1',
  MOBILIZA_SUPABASE_URL: 'https://syntheticproject0001.supabase.co',
  MOBILIZA_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_login_only',
  MOBILIZA_SUPABASE_SECRET_KEY: 'sb_secret_test_create_only',
  MOBILIZA_SUPABASE_OWNER_ID: '00000000-0000-4000-8000-000000000001',
  DB: {
    prepare: sql => new Statement(sql),
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(({ sql, args }) => ({ meta: sqlite.prepare(sql).run(...args) }));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  },
};

const modules = new Map();
const nextHeaders = new Headers();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const resolve = id => {
    if (id === 'cloudflare:workers') return { env };
    if (id === 'next/headers') return { headers: async () => nextHeaders };
    if (id === 'next/navigation') return {};
    if (id.startsWith('.')) {
      const target = path.posix.join(path.posix.dirname(file), `${id}.ts`);
      if (target === 'lib/regional-access.ts') return {};
      if (target === 'lib/app-access.ts') {
        const { MEMBER_ROLES } = load('lib/member-roles.ts');
        return { memberTitle: ({ role }) => MEMBER_ROLES[role] ?? null };
      }
      return load(target);
    }
    return require(id);
  };
  new Function('require', 'exports', outputText)(resolve, exports);
  return exports;
}

const { SITE_OWNER_ID } = load('lib/owner-access.ts');
const { resolvePasswordSession } = load('lib/supabase-auth.ts');
const { POST: create } = load('app/api/password-members/route.ts');
const { POST: signIn } = load('app/api/password-session/route.ts');
const { POST: signOut } = load('app/api/team-session/logout/route.ts');

const app = 'https://portal.example.test';
const staff = { name: 'Pessoa de teste', email: 'staff@example.test', role: 'general_manager' };
const unlinked = {
  id: '00000000-0000-4000-8000-000000000002', email: 'unlinked@example.test', password: 'synthetic-unlinked-password',
};
const providerAccounts = new Map([[unlinked.email, unlinked]]);
const providerTokens = new Map();
const uncertainEmail = 'pending@example.test';
const occupiedEmail = 'occupied@example.test';
let adminCalls = 0;
let passwordUpdates = 0;

async function mockSupabase(url, init) {
  const endpoint = new URL(url);
  assert.equal(endpoint.origin, env.MOBILIZA_SUPABASE_URL);
  assert.equal(init.redirect, 'error');
  const key = init.headers.get('apikey');
  const body = init.body && JSON.parse(init.body);
  if (endpoint.pathname === '/auth/v1/admin/users') {
    adminCalls++;
    assert.equal(init.method, 'POST');
    assert.equal(key, env.MOBILIZA_SUPABASE_SECRET_KEY);
    assert.equal(body.email_confirm, true);
    assert.match(body.id, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
    assert.ok(body.password.length >= 12);
    if (body.email === occupiedEmail) return Response.json({ error: 'already registered' }, { status: 422 });
    const account = { id: body.id, email: body.email, password: body.password };
    providerAccounts.set(body.email, account);
    if (body.email === uncertainEmail) return Response.json({ error: 'provider timeout' }, { status: 503 });
    return Response.json({ id: account.id, email: account.email });
  }

  assert.equal(key, env.MOBILIZA_SUPABASE_PUBLISHABLE_KEY);
  if (endpoint.pathname === '/auth/v1/token') {
    assert.equal(endpoint.searchParams.get('grant_type'), 'password');
    assert.equal(init.method, 'POST');
    const account = providerAccounts.get(body.email);
    if (!account || account.password !== body.password) return Response.json({}, { status: 400 });
    const token = `synthetic.${providerTokens.size}.signature`;
    providerTokens.set(token, account);
    return Response.json({ access_token: token, expires_in: 7200 });
  }

  assert.equal(endpoint.pathname, '/auth/v1/user');
  const account = providerTokens.get(init.headers.get('Authorization')?.replace(/^Bearer /, ''));
  assert.ok(account);
  if (init.method === 'PUT') {
    passwordUpdates++;
    account.password = body.password;
  } else {
    assert.equal(init.method, undefined);
  }
  return Response.json({ id: account.id, email: account.email, email_confirmed_at: '2020-01-01T00:00:00Z' });
}

function post(route, body, cookie = '') {
  return new Request(app + route, {
    method: 'POST',
    headers: { Origin: app, 'Content-Type': 'application/json', Cookie: cookie },
    body: body && JSON.stringify(body),
  });
}

const createRequest = input => post('/api/password-members', input);
const loginRequest = (email, password, fields) => post('/api/password-session', { email, password, ...fields });
const privateRequest = cookie => new Request(app + '/dashboard', { headers: { Cookie: cookie } });
const member = email => sqlite.prepare('SELECT * FROM app_members WHERE email=?').get(email);
const sessionCount = () => sqlite.prepare('SELECT count(*) AS total FROM password_sessions').get().total;

async function check() {
  const originalFetch = globalThis.fetch;
  const fetchErrors = [];
  globalThis.fetch = async (...args) => {
    try { return await mockSupabase(...args); }
    catch (error) { fetchErrors.push(error); throw error; }
  };
  try {
    assert.equal((await create(createRequest(staff))).status, 403);
    assert.equal(adminCalls, 0);
    nextHeaders.set('oai-authenticated-user-id', SITE_OWNER_ID);
    nextHeaders.set('oai-authenticated-user-email', 'owner@example.test');
    const created = await create(createRequest(staff));
    assert.equal(created.status, 201);
    assert.match(created.headers.get('Cache-Control'), /no-store/);
    const { ok, email, temporary_password: initialPassword } = await created.json();
    assert.equal(ok, true);
    assert.equal(email, staff.email);
    const account = providerAccounts.get(email);
    assert.equal(initialPassword, account.password);
    assert.equal(member(email).user_id, `supabase:${account.id}`);
    assert.equal(member(email).status, 'active');
    assert.equal(member(email).password_change_required, 1);
    assert.equal((await create(createRequest(staff))).status, 409);
    assert.equal(adminCalls, 1);

    const pending = { ...staff, email: uncertainEmail };
    assert.equal((await create(createRequest(pending))).status, 503);
    assert.equal(member(uncertainEmail).status, 'provisioning');
    assert.equal((await signIn(loginRequest(uncertainEmail, providerAccounts.get(uncertainEmail).password))).status, 401);
    assert.equal((await create(createRequest(pending))).status, 409);
    assert.equal(adminCalls, 2);
    assert.equal((await create(createRequest({ ...staff, email: occupiedEmail }))).status, 409);
    assert.equal(member(occupiedEmail), undefined);

    assert.equal((await signIn(loginRequest(email, 'incorrect'))).status, 401);
    assert.equal((await signIn(loginRequest(unlinked.email, unlinked.password))).status, 401);
    for (const newPassword of [undefined, initialPassword, 'too short']) {
      const firstAccess = await signIn(loginRequest(email, initialPassword, { new_password: newPassword }));
      assert.equal(firstAccess.status, 409);
      assert.equal((await firstAccess.json()).password_change_required, true);
      assert.equal(firstAccess.headers.get('Set-Cookie'), null);
    }
    assert.equal(passwordUpdates, 0);
    assert.equal(sessionCount(), 0);

    const chosenPassword = 'Synthetic-new-password-90!';
    const changed = await signIn(loginRequest(email, initialPassword, {
      new_password: chosenPassword, return_to: '/dashboard?view=team',
    }));
    assert.equal(changed.status, 200);
    assert.deepEqual(await changed.json(), { ok: true, return_to: '/dashboard?view=team' });
    assert.equal(passwordUpdates, 1);
    assert.equal(member(email).password_change_required, 0);
    const setCookie = changed.headers.get('Set-Cookie');
    assert.match(setCookie, /^__Host-mobiliza-password=[a-f0-9]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=\d+$/);
    const cookie = setCookie.split(';')[0];
    const token = cookie.split('=')[1];
    const storedSession = sqlite.prepare('SELECT session_hash, member_revision FROM password_sessions').get();
    assert.equal(storedSession.session_hash, createHash('sha256').update(token).digest('hex'));
    assert.equal(storedSession.member_revision, member(email).revision);
    assert.equal((await resolvePasswordSession(privateRequest(cookie), env))?.userId, member(email).user_id);
    assert.equal((await signIn(loginRequest(email, initialPassword))).status, 401);

    const signedOut = await signOut(post('/api/team-session/logout', null, cookie));
    assert.equal(signedOut.status, 204);
    assert.match(signedOut.headers.get('Set-Cookie'), /^__Host-mobiliza-password=; .*Max-Age=0$/);
    assert.equal(await resolvePasswordSession(privateRequest(cookie), env), null);
    assert.equal(sessionCount(), 0);

    const signedIn = await signIn(loginRequest(email, chosenPassword, { return_to: '//untrusted.example.test/' }));
    assert.equal(signedIn.status, 200);
    assert.deepEqual(await signedIn.json(), { ok: true, return_to: '/' });
    const secondCookie = signedIn.headers.get('Set-Cookie').split(';')[0];
    assert.ok(await resolvePasswordSession(privateRequest(secondCookie), env));
    sqlite.prepare("UPDATE app_members SET status='revoked', revision=revision+1 WHERE email=?").run(email);
    assert.equal(await resolvePasswordSession(privateRequest(secondCookie), env), null);
    assert.equal((await signIn(loginRequest(email, chosenPassword))).status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
    if (fetchErrors.length) throw fetchErrors[0];
  }
}

check().then(() => console.log('Supabase password access regression passed.')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
