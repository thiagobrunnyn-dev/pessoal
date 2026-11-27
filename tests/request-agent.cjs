/* eslint-disable @typescript-eslint/no-require-imports -- Match the backend test transpile harnesses. */
// Exercise the real route, D1 migrations and notice outbox in memory without WAHA or n8n.
const assert = require('node:assert/strict');
const {createHash, randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {after, before, test} = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const origin = 'https://qa.example';
const directToken = 'a'.repeat(64);
const identityKey = 'b'.repeat(64);
const integrationToken = 'mbl_' + 'c'.repeat(64);
const session = 'qa-direct-session';
// Reserved example phone numbers keep the fixtures separate from real conversations.
const sender = '12025550100@c.us';
const anotherSender = '12025550101@c.us';
const privacyVersion = 'whatsapp-agent-v1';
const sqlite = new DatabaseSync(':memory:');
let failNextNotice = false;

class Statement {
  constructor(sql, args = []) {this.sql = sql; this.args = args;}
  bind(...args) {return new Statement(this.sql, args);}
  async first() {return sqlite.prepare(this.sql).get(...this.args) ?? null;}
  async all() {return {results: sqlite.prepare(this.sql).all(...this.args)};}
  async run() {return {meta: sqlite.prepare(this.sql).run(...this.args)};}
}

const d1 = {
  prepare: sql => new Statement(sql),
  batch: async statements => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(({sql, args}) => {
        if (failNextNotice && sql.startsWith('INSERT INTO request_notices ')) {
          failNextNotice = false;
          throw new Error('Injected notice write failure');
        }
        return {meta: sqlite.prepare(sql).run(...args)};
      });
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};

const env = {
  DB: d1,
  MOBILIZA_WHATSAPP_REQUEST_TOKEN: directToken,
  MOBILIZA_WHATSAPP_REQUEST_IDENTITY_KEY: identityKey,
  MOBILIZA_WHATSAPP_REQUEST_SESSION: session,
};
const modules = new Map();
function load(file) {
  const resolved = path.resolve(root, file);
  if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (modules.has(resolved)) return modules.get(resolved).exports;
  const mod = {exports: {}};
  modules.set(resolved, mod);
  const source = fs.readFileSync(resolved, 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }});
  const resolveImport = id => {
    if (id === 'cloudflare:workers') return {env};
    if (id === 'next/navigation') return {};
    if (id.endsWith('app/chatgpt-auth')) return {getChatGPTUser: async () => null};
    if (id.startsWith('.')) {
      const target = path.resolve(path.dirname(resolved), id);
      return load(path.extname(target) ? target : target + '.ts');
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', outputText)(resolveImport, mod, mod.exports);
  return mod.exports;
}

let route, integrationGateway, triageIntake, ownerOperator;
before(() => {
  sqlite.exec('PRAGMA foreign_keys=ON');
  const migrations = path.join(root, 'drizzle');
  for (const file of fs.readdirSync(migrations).filter(name => /^\d{4}.*\.sql$/.test(name)).sort()) {
    sqlite.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
  }
  const {SITE_OWNER_ID: owner} = load('lib/owner-access.ts');
  route = load('app/api/request-agent/route.ts');
  ({integrationGateway} = load('lib/integration-gateway.ts'));
  ({triageIntake} = load('lib/request-intake-management.ts'));
  ownerOperator = {
    ownerId: owner, role: 'owner', title: 'Gestão QA', revision: 0,
    actor: {userId: owner, displayName: 'Gestão QA', fullName: 'Gestão QA', email: 'qa@example.test'},
  };
  const now = new Date().toISOString();
  sqlite.prepare(`INSERT INTO whatsapp_chats(id,owner_id,chat_jid,name,requests_default,created_at,updated_at)
    VALUES(?,?,?,'Grupo de QA',1,?,?)`).run(randomUUID(), owner, '123456789-test@g.us', now, now);
  sqlite.prepare(`INSERT INTO integration_keys(id,owner_id,name,token_hash,prefix,permission,created_at,expires_at)
    VALUES(?,?,'Fila QA',?,?,'write',?,?)`).run(randomUUID(), owner,
    createHash('sha256').update(integrationToken).digest('hex'), integrationToken.slice(0, 12),
    now, new Date(Date.now() + 86_400_000).toISOString());
});
after(() => sqlite.close());

function values(kind) {
  return {
    name: 'Nome reservado QA', job_title: 'Função QA', company: 'Empresa QA', location: 'Local reservado QA',
    address: kind === 'maintenance' ? 'Endereço reservado QA' : '', description: 'Descrição reservada QA',
    items: kind === 'purchase' ? [{name: 'Item reservado QA', quantity: 2, unit: 'unidade'}] : [],
    privacy_accepted: true, privacy_version: privacyVersion,
  };
}

function create(kind = 'maintenance') {
  return {action: 'create', session, sender, messageId: `false_${sender}_${randomUUID()}`, kind, values: values(kind)};
}

function lookup(protocol, who = sender) {
  return {action: 'status', session, sender: who, protocol};
}

async function call(body, token = directToken, additionalHeaders = {}) {
  const headers = new Headers(additionalHeaders);
  if (token) headers.set('authorization', 'Bearer ' + token);
  if (body !== undefined) headers.set('content-type', 'application/json');
  const response = await (body === undefined ? route.GET : route.POST)(new Request(origin + '/api/request-agent', {
    method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  }));
  return {status: response.status, headers: response.headers, data: await response.json()};
}

function counts() {
  return Object.fromEntries(['request_intakes', 'request_intake_events', 'request_agent_intakes', 'request_notices']
    .map(table => [table, sqlite.prepare(`SELECT count(*) AS total FROM ${table}`).get().total]));
}

async function claim() {
  const response = await integrationGateway(new Request(origin + '/api/integrations/v1/whatsapp', {
    method: 'POST', headers: {authorization: 'Bearer ' + integrationToken, 'content-type': 'application/json'},
    body: JSON.stringify({action: 'outbox_claim', limit: 10}),
  }), {params: Promise.resolve({path: ['whatsapp']})});
  assert.equal(response.status, 200);
  return (await response.json()).messages;
}

test('only the dedicated server credential grants readiness or requests', async () => {
  const initial = counts();
  for (const token of [null, 'wrong', integrationToken]) {
    assert.equal((await call(undefined, token)).status, 401);
    assert.equal((await call(create(), token)).status, 401);
  }
  const readiness = await call();
  assert.equal(readiness.status, 200);
  assert.deepEqual(readiness.data, {ready: true});
  assert.match(readiness.headers.get('cache-control') ?? '', /no-store/);
  for (const headers of [{origin}, {cookie: 'browser=1'}]) {
    assert.equal((await call(undefined, directToken, headers)).status, 403);
    assert.equal((await call(create(), directToken, headers)).status, 403);
  }
  env.MOBILIZA_WHATSAPP_REQUEST_IDENTITY_KEY = directToken;
  try {
    assert.equal((await call()).status, 503);
    assert.equal((await call(create())).status, 503);
  } finally {
    env.MOBILIZA_WHATSAPP_REQUEST_IDENTITY_KEY = identityKey;
  }
  assert.deepEqual(counts(), initial);
});

test('wrong session, invalid sender and missing explicit consent leave no persistent data', async () => {
  const initial = counts();
  const valid = create();
  assert.equal((await call({...valid, session: 'wrong-session'})).status, 403);
  for (const body of [
    {...valid, sender: '123456789-test@g.us'},
    {...valid, sender: '12025550100@lid'},
    {...valid, sender: '123456789@c.us'},
    {...valid, messageId: valid.messageId.replace('false_', 'true_')},
    {...valid, values: {...valid.values, privacy_accepted: false}},
    {...valid, values: {...valid.values, privacy_version: 'general-requests-v2'}},
    {...valid, values: {...valid.values, description: ''}},
    {...valid, values: {...valid.values, whatsapp: anotherSender, whatsapp_consent: true}},
    {...valid, values: {...valid.values, owner_id: 'foreign-qa'}},
  ]) assert.equal((await call(body)).status, 400);
  assert.deepEqual(counts(), initial);
});

test('exact concurrent creates use one protocol and one requester-only acknowledgment', async () => {
  const initial = counts();
  const body = create();
  const results = await Promise.all([call(body), call(body)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 201], JSON.stringify(results));
  for (const result of results) {
    assert.match(result.data.protocol, /^MAN-/);
    assert.equal(result.data.alreadySaved, result.status === 200 ? true : undefined);
  }
  const protocol = results[0].data.protocol;
  assert.equal(results[1].data.protocol, protocol);
  const savedCounts = counts();
  for (const table of Object.keys(initial)) assert.equal(savedCounts[table] - initial[table], 1, table);
  const linkage = JSON.stringify(sqlite.prepare('SELECT * FROM request_agent_intakes').all());
  assert.ok(!linkage.includes(sender));
  assert.ok(!linkage.includes(body.messageId));
  const changed = {...body, values: {...body.values, description: 'Descrição diferente QA'}};
  assert.equal((await call(changed)).status, 409);
  assert.equal((await call({...body, sender: anotherSender})).status, 409);
  assert.deepEqual(counts(), savedCounts);

  const items = await claim();
  assert.equal(items.length, 1);
  assert.equal(items[0].chat_jid, sender);
  assert.ok(items[0].body.includes(protocol));
  for (const field of ['name', 'address', 'location', 'description']) {
    assert.ok(!items[0].body.includes(body.values[field]), field);
  }
  assert.doesNotMatch(items[0].body, /receberá outro aviso/i);
  assert.equal(sqlite.prepare("SELECT count(*) AS total FROM request_notices WHERE target='group'").get().total, 0);
  assert.deepEqual(await claim(), []);
});

test('status returns only the authenticated sender’s request and leaves operational data untouched', async () => {
  const result = await call(create('purchase'));
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const {protocol} = result.data;
  assert.match(protocol, /^COM-/);
  const initial = counts();
  const matching = await call(lookup(protocol));
  assert.equal(matching.status, 200);
  assert.deepEqual(matching.data, {protocol, status: 'received', received_at: result.data.received_at});
  const samePhone = await call(lookup(protocol, sender.replace('@c.us', '@s.whatsapp.net')));
  assert.deepEqual(samePhone.data, matching.data);
  const other = await call(lookup(protocol, anotherSender));
  const absent = await call(lookup('COM-FFFFFFFFFFFFFFFF'));
  assert.equal(other.status, 404);
  assert.equal(absent.status, 404);
  assert.deepEqual(other.data, absent.data);
  assert.deepEqual(counts(), initial);

  const row = sqlite.prepare('SELECT id,revision FROM request_intakes WHERE protocol=?').get(protocol);
  await triageIntake(ownerOperator, {
    ...row, action: 'close', confirmed: true, request_id: randomUUID(), note: 'Nota interna QA',
  });
  const closed = await call(lookup(protocol));
  assert.equal(closed.status, 200);
  assert.deepEqual(closed.data, {...matching.data, status: 'closed'});
  assert.equal(counts().request_notices, initial.request_notices);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});

test('status throttles repeated queries for one sender and leaves operational data untouched', async t => {
  t.mock.timers.enable({apis: ['Date'], now: new Date()});
  const initial = counts();
  const unknown = lookup('MAN-FFFFFFFFFFFFFFFF', '12025550102@c.us');
  const results = await Promise.all(Array.from({length: 31}, () => call(unknown)));
  assert.equal(results.filter(result => result.status === 404).length, 30);
  const limited = results.filter(result => result.status === 429);
  assert.equal(limited.length, 1);
  assert.equal(limited[0].headers.get('retry-after'), '60');
  assert.equal((await call(lookup(unknown.protocol, anotherSender))).status, 404);
  assert.deepEqual(counts(), initial);
});

test('receipt queue failure preserves the request and replay queues exactly one acknowledgment', async () => {
  const initial = counts();
  const body = create();
  body.values.description = 'Falha transitória QA';
  failNextNotice = true;
  const failed = await call(body);
  assert.equal(failed.status, 503, JSON.stringify(failed.data));
  assert.ok(!Object.hasOwn(failed.data, 'protocol'));
  assert.deepEqual(counts(), {
    request_intakes: initial.request_intakes + 1,
    request_intake_events: initial.request_intake_events + 1,
    request_agent_intakes: initial.request_agent_intakes + 1,
    request_notices: initial.request_notices,
  });
  const saved = sqlite.prepare("SELECT protocol,received_at FROM request_intakes WHERE json_extract(values_json,'$.description')=?")
    .get(body.values.description);
  const replay = await call(body);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.data, {...saved, alreadySaved: true});
  assert.equal((await call(body)).status, 200);
  const receipts = sqlite.prepare('SELECT target,requester_jid FROM request_notices WHERE protocol=?').all(saved.protocol);
  assert.deepEqual(receipts.map(row => ({...row})), [{target: 'requester', requester_jid: sender}]);
});
