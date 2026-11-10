/* eslint-disable @typescript-eslint/no-require-imports -- Use the CommonJS transpile harness shared by the backend suites. */
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
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
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
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
      return load(target);
    }
    return require(id);
  };
  new Function('require', 'exports', outputText)(resolve, exports);
  return exports;
}

const { SITE_OWNER_ID } = load('lib/owner-access.ts');
const { PASSWORD_SESSION_HEADER, PASSWORD_SESSION_REVISION_HEADER, sitesPasswordIdentity } = load('lib/sites-password-identity.ts');
const { resolvePasswordSession } = load('lib/supabase-auth.ts');
const { MEMBER_INVITATIONS, canAdminister, getOperator, getAdministrator, operatorGuard, recheckOperator } = load('lib/app-access.ts');
const { withIntegration } = load('lib/integration-context.ts');
const { REGIONAL_EMAIL, runWithRegionalAccess, isRegionalRequest } = load('lib/regional-access.ts');
const members = load('app/api/members/route.ts');
const integrationSettings = load('app/api/settings/integrations/route.ts');
const visitAccess = load('app/api/visit-access/route.ts');
const cleaningAccess = load('app/api/cleaning/access/route.ts');
const publicHistory = load('app/api/equipment-public-access/route.ts');
const guestChannel = load('app/api/guest-channel-settings/route.ts');
const { propertyImportGlobalGuard } = load('lib/property-import-runtime.ts');
const { POST: create } = load('app/api/password-members/route.ts');
const { POST: signIn } = load('app/api/password-session/route.ts');
const { POST: signOut } = load('app/api/password-session/logout/route.ts');

const app = 'https://portal.example.test';
const staff = { name: 'Pessoa de teste', email: 'staff@example.test', role: 'general_manager' };
const unlinked = {
  id: '00000000-0000-4000-8000-000000000002', email: 'unlinked@example.test', password: 'synthetic-unlinked-password',
};
const providerAccounts = new Map([[unlinked.email, unlinked]]);
const providerTokens = new Map();
const uncertainEmail = 'pending@example.test';
const occupiedEmail = 'occupied@example.test';
const redirectedEmail = 'redirected@example.test';
let adminCalls = 0;
let passwordUpdates = 0;

async function mockSupabase(url, init) {
  const endpoint = new URL(url);
  assert.equal(endpoint.origin, env.MOBILIZA_SUPABASE_URL);
  assert.equal(init.redirect, 'manual');
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
    if (body.email === redirectedEmail) return Response.redirect('https://untrusted.example.test/collect', 307);
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
function setIdentity(userId, email, revision) {
  nextHeaders.set('oai-authenticated-user-id', userId);
  nextHeaders.set('oai-authenticated-user-email', email);
  nextHeaders.delete(PASSWORD_SESSION_REVISION_HEADER);
  nextHeaders.delete(PASSWORD_SESSION_HEADER);
  if (revision != null) {
    nextHeaders.set(PASSWORD_SESSION_HEADER, '1');
    nextHeaders.set(PASSWORD_SESSION_REVISION_HEADER, String(revision));
  }
}
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
    setIdentity(SITE_OWNER_ID, 'owner@example.test');
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

    const redirectedRequest = loginRequest(redirectedEmail, 'synthetic-invalid-password');
    redirectedRequest.headers.set('cf-connecting-ip', '192.0.2.55');
    const redirected = await signIn(redirectedRequest);
    assert.equal(redirected.status, 503);
    assert.equal(redirected.headers.get('Set-Cookie'), null);
    assert.equal(sessionCount(), 0);
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

    const signedOut = await signOut(post('/api/password-session/logout', null, cookie));
    assert.equal(signedOut.status, 204);
    const logoutCookies = signedOut.headers.getSetCookie();
    assert.match(logoutCookies[0], /^__Host-mobiliza-password=; .*Max-Age=0$/);
    assert.match(logoutCookies[1], /^__Host-mobiliza-logged-out=1; /);
    assert.equal(await resolvePasswordSession(privateRequest(cookie), env), null);
    assert.equal(sessionCount(), 0);

    const signedIn = await signIn(loginRequest(email, chosenPassword, { return_to: '//untrusted.example.test/' }));
    assert.equal(signedIn.status, 200);
    assert.deepEqual(await signedIn.json(), { ok: true, return_to: '/' });
    const secondCookie = signedIn.headers.get('Set-Cookie').split(';')[0];
    const ordinarySession = await resolvePasswordSession(privateRequest(secondCookie), env);
    assert.ok(ordinarySession);
    setIdentity(ordinarySession.userId, email, ordinarySession.revision);

    const legacy = MEMBER_INVITATIONS.find(invite => invite.role === 'general_manager');
    const legacyId = 'synthetic-legacy-sites-user';
    sqlite.prepare("INSERT INTO app_members (user_id,email,display_name,role,status,requested_at) VALUES (?,?,?,?,'active',?)")
      .run(legacyId, legacy.email, 'Legacy staff', legacy.role, new Date().toISOString());
    const nativeRequest = (cookie = '') => new Request(app + '/dashboard', {headers: {
      'oai-authenticated-user-id': legacyId, 'oai-authenticated-user-email': legacy.email, Cookie: cookie,
      [PASSWORD_SESSION_HEADER]: '1', [PASSWORD_SESSION_REVISION_HEADER]: '100',
    }});
    const native = sitesPasswordIdentity(nativeRequest(), null, true).headers;
    assert.equal(native.get('oai-authenticated-user-id'), legacyId);
    assert.equal(native.get(PASSWORD_SESSION_HEADER), null);
    assert.equal(native.get(PASSWORD_SESSION_REVISION_HEADER), null);
    setIdentity(legacyId, legacy.email);
    assert.equal((await getOperator()).role, 'operator');
    assert.equal(await getAdministrator(), null);
    const locallyLoggedOut = sitesPasswordIdentity(nativeRequest(logoutCookies[1].split(';')[0]), null, true).headers;
    assert.equal(locallyLoggedOut.get('oai-authenticated-user-id'), null);
    const stalePassword = sitesPasswordIdentity(nativeRequest(cookie), null, true).headers;
    assert.equal(stalePassword.get('oai-authenticated-user-id'), null);
    const featureOff = sitesPasswordIdentity(nativeRequest(cookie), null, false).headers;
    assert.equal(featureOff.get('oai-authenticated-user-id'), legacyId);
    assert.equal(featureOff.get(PASSWORD_SESSION_HEADER), null);
    const local = sitesPasswordIdentity(nativeRequest(secondCookie), ordinarySession, true).headers;
    assert.equal(local.get('oai-authenticated-user-id'), ordinarySession.userId);
    assert.equal(local.get(PASSWORD_SESSION_HEADER), '1');
    assert.equal(local.get(PASSWORD_SESSION_REVISION_HEADER), String(ordinarySession.revision));
    setIdentity(ordinarySession.userId, email, ordinarySession.revision);
    assert.equal((await getOperator()).role, 'operator');
    assert.equal(await getAdministrator(), null);
    assert.equal((await create(createRequest({...staff, email: 'ordinary-cannot-create@example.test', role: 'admin'}))).status, 403);
    sqlite.prepare("UPDATE app_members SET status='revoked', revision=revision+1 WHERE email=?").run(email);
    assert.equal(await resolvePasswordSession(privateRequest(secondCookie), env), null);
    assert.equal((await signIn(loginRequest(email, chosenPassword))).status, 401);

    setIdentity(SITE_OWNER_ID, 'owner@example.test');
    sqlite.prepare("UPDATE app_members SET role='admin' WHERE user_id=?").run(ordinarySession.userId);
    const reapproved = await members.POST(post('/api/members', {action: 'approve', user_id: ordinarySession.userId, confirmed: true}));
    assert.equal(reapproved.status, 200);

    // The Worker accepted this cookie before the revoke/reapproval. The later role
    // lookup must still enforce the revision from that accepted session.
    setIdentity(ordinarySession.userId, email, ordinarySession.revision);
    assert.equal(await getOperator(), null);
    assert.equal(await getAdministrator(), null);
    assert.equal((await create(createRequest({...staff, email: 'stale-cannot-create@example.test', role: 'admin'}))).status, 403);
    assert.equal(await resolvePasswordSession(privateRequest(secondCookie), env), null);
    setIdentity(ordinarySession.userId, email);
    assert.equal(await getOperator(), null);
    setIdentity(ordinarySession.userId, email, '0, ' + member(email).revision);
    assert.equal(await getOperator(), null);
    setIdentity(SITE_OWNER_ID, 'owner@example.test');

    const adminEmail = 'administrator@example.test';
    const adminCreated = await create(createRequest({...staff, email: adminEmail, role: 'admin'}));
    assert.equal(adminCreated.status, 201);
    const firstAdmin = await adminCreated.json();
    const adminLogin = await signIn(loginRequest(adminEmail, firstAdmin.temporary_password, {new_password: 'Synthetic-Admin-password-42!'}));
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.headers.get('Set-Cookie').split(';')[0];
    const adminSession = await resolvePasswordSession(privateRequest(adminCookie), env);
    assert.ok(adminSession);
    const adminId = adminSession.userId;
    assert.notEqual(adminId, SITE_OWNER_ID);
    setIdentity(adminId, adminSession.email, adminSession.revision);
    const admin = await getAdministrator();
    assert.equal(admin.role, 'admin');
    assert.equal(admin.ownerId, SITE_OWNER_ID);
    assert.equal(admin.actor.userId, adminId);
    assert.equal(canAdminister(admin), true);
    assert.equal((await members.GET(new Request(app + '/api/members'))).status, 200);
    assert.equal((await integrationSettings.GET()).status, 200);
    const integrationKeyId = randomUUID();
    const key = await integrationSettings.POST(post('/api/settings/integrations', {id: integrationKeyId, name: 'Admin key', permission: 'read', days: 7, confirmed: true}));
    assert.equal(key.status, 201);
    assert.equal(sqlite.prepare('SELECT owner_id FROM integration_keys WHERE id=?').get(integrationKeyId).owner_id, SITE_OWNER_ID);
    assert.equal((await integrationSettings.DELETE(post('/api/settings/integrations', {id: integrationKeyId, confirmed: true}))).status, 200);

    const propertyId = randomUUID(), equipmentId = randomUUID(), locationId = randomUUID(), stamp = new Date().toISOString();
    sqlite.prepare('INSERT INTO properties (id,owner_id,name,address,state_code,created_at) VALUES (?,?,?,?,?,?)')
      .run(propertyId, SITE_OWNER_ID, 'Admin property', 'Private address', 'MG', stamp);
    sqlite.prepare('INSERT INTO equipment (id,owner_id,property_id,name,location,checklist,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(equipmentId, SITE_OWNER_ID, propertyId, 'Admin equipment', 'Room', '[]', stamp);
    sqlite.prepare('INSERT INTO cleaning_locations (id,owner_id,property_id,name,catalog,created_at) VALUES (?,?,?,?,?,?)')
      .run(locationId, SITE_OWNER_ID, propertyId, 'Admin location', '[]', stamp);

    assert.equal((await visitAccess.POST(post('/api/visit-access', {action: 'generate', equipment_id: equipmentId, technician_name: 'Test technician'}))).status, 200);
    assert.equal(sqlite.prepare('SELECT owner_id FROM visit_grants WHERE equipment_id=?').get(equipmentId).owner_id, SITE_OWNER_ID);
    assert.equal((await visitAccess.POST(post('/api/visit-access', {action: 'revoke', equipment_id: equipmentId}))).status, 200);
    assert.equal((await cleaningAccess.POST(post('/api/cleaning/access', {action: 'generate', role: 'team', location_id: locationId, person_name: 'Test staff'}))).status, 200);
    assert.equal(sqlite.prepare('SELECT owner_id FROM cleaning_grants WHERE location_id=?').get(locationId).owner_id, SITE_OWNER_ID);
    assert.equal((await cleaningAccess.POST(post('/api/cleaning/access', {action: 'revoke', role: 'team', location_id: locationId}))).status, 200);

    const visibility = await publicHistory.POST(post('/api/equipment-public-access', {id: equipmentId, enabled: false, revision: 0, confirmed: true}));
    assert.equal(visibility.status, 200);
    const event = sqlite.prepare('SELECT owner_id,actor_user_id FROM equipment_public_events WHERE equipment_id=?').get(equipmentId);
    assert.equal(event.owner_id, SITE_OWNER_ID);
    assert.equal(event.actor_user_id, adminId);
    const channel = await guestChannel.POST(post('/api/guest-channel-settings', {property_id: propertyId, action: 'enable', revision: 0, request_id: randomUUID(), confirmed: true, audience_confirmed: true}));
    assert.equal(channel.status, 200);
    assert.ok((await channel.json()).path.startsWith('/canal/'));
    const importGuard = propertyImportGlobalGuard(admin);
    assert.ok(sqlite.prepare('SELECT 1 AS allowed WHERE ' + importGuard.sql).get(...importGuard.args));
    const invalidBootstrapRevoke = await members.POST(post('/api/members', {action: 'revoke', user_id: SITE_OWNER_ID}));
    assert.equal(invalidBootstrapRevoke.status, 400);

    const secondAdminEmail = 'second-administrator@example.test';
    const secondAdminCreated = await create(createRequest({...staff, email: secondAdminEmail, role: 'admin'}));
    assert.equal(secondAdminCreated.status, 201);
    const secondAdminId = member(secondAdminEmail).user_id;
    assert.equal(member(secondAdminEmail).approved_by, adminId);
    assert.equal(member(secondAdminEmail).role, 'admin');
    const secondAdmin = await secondAdminCreated.json();
    const secondAdminLogin = await signIn(loginRequest(secondAdminEmail, secondAdmin.temporary_password, {new_password: 'Second-Synthetic-Admin-password-42!'}));
    assert.equal(secondAdminLogin.status, 200);
    const secondAdminCookie = secondAdminLogin.headers.get('Set-Cookie').split(';')[0];
    const secondAdminSession = await resolvePasswordSession(privateRequest(secondAdminCookie), env);
    assert.equal(secondAdminSession.userId, secondAdminId);
    setIdentity(secondAdminId, secondAdminEmail, secondAdminSession.revision);
    assert.equal((await getAdministrator()).actor.userId, secondAdminId);
    const integration = {id: 'test-integration', ownerId: SITE_OWNER_ID, permission: 'write', name: 'test'};
    assert.equal(await withIntegration(integration, getAdministrator), null);
    assert.equal((await withIntegration(integration, () => create(createRequest({...staff, email: 'bearer-cannot-create@example.test', role: 'admin'})))).status, 403);

    const regionalUser = 'supabase:00000000-0000-4000-8000-000000000008';
    const regionalEmail = REGIONAL_EMAIL;
    sqlite.prepare("INSERT INTO app_members (user_id,email,display_name,role,status,requested_at) VALUES (?,?,?,'maintenance_lead','active',?)")
      .run(regionalUser, regionalEmail, 'Regional', new Date().toISOString());
    setIdentity(regionalUser, regionalEmail, 0);
    const regionalRequest = new Request(app + '/', {headers: nextHeaders});
    await runWithRegionalAccess(regionalRequest, env.DB, async () => {
      assert.equal(isRegionalRequest(), true);
      assert.equal((await getOperator()).role, 'operator');
      assert.equal(await getAdministrator(), null);
    });
    sqlite.prepare("UPDATE app_members SET role='admin', revision=revision+1 WHERE user_id=?").run(regionalUser);
    await runWithRegionalAccess(regionalRequest, env.DB, async () => {
      assert.equal(isRegionalRequest(), false);
      assert.equal(await getAdministrator(), null);
      setIdentity(regionalUser, regionalEmail, 1);
      assert.equal((await getAdministrator()).role, 'admin');
    });

    // An already authenticated admin cannot finish an admin write after losing the role.
    sqlite.prepare("UPDATE app_members SET role='general_manager' WHERE user_id=?").run(adminId);
    const guard = operatorGuard(admin);
    assert.equal(sqlite.prepare('SELECT 1 AS permitted WHERE ' + guard.sql).get(...guard.args), undefined);
    await assert.rejects(() => recheckOperator(admin), {status: 401});
    setIdentity(secondAdminId, secondAdminEmail, secondAdminSession.revision);
    const revoked = await members.POST(post('/api/members', {action: 'revoke', user_id: adminId}));
    assert.equal(revoked.status, 200);
    assert.equal(await resolvePasswordSession(privateRequest(adminCookie), env), null);
    setIdentity(adminId, adminEmail, adminSession.revision);
    assert.equal(await getAdministrator(), null);
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
