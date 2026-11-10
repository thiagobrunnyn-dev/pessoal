// Central do WhatsApp: handlers reais + migrações + SQLite em memória. Sem rede, WAHA ou n8n.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const {DatabaseSync} = require('node:sqlite'), {randomUUID} = require('node:crypto');
const root = path.resolve(__dirname, '..'), OWNER = 'CONFIGURE_VERIFIED_SITE_OWNER_ID', ORIGIN = 'https://qa.example';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const file of fs.readdirSync(root + '/drizzle').filter(name => /^\d{4}.*\.sql$/.test(name)).sort()) sqlite.exec(fs.readFileSync(root + '/drizzle/' + file, 'utf8'));

const owner = {userId: OWNER, email: 'qa@example.test', displayName: 'Owner QA', fullName: 'Owner QA'};
let actor = owner;
class Statement {
  constructor(sql, args = []) {this.sql = sql; this.args = args;}
  bind(...args) {return new Statement(this.sql, args);}
  async first() {return sqlite.prepare(this.sql).get(...this.args) || null;}
  async all() {return {results: sqlite.prepare(this.sql).all(...this.args)};}
  async run() {return {meta: sqlite.prepare(this.sql).run(...this.args)};}
}
const d1 = {
  prepare: sql => new Statement(sql),
  batch: async statements => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => ({meta: sqlite.prepare(statement.sql).run(...statement.args)}));
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};
const cache = {};
function load(file) {
  file = path.resolve(root, file);
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cache[file]) return cache[file].exports;
  const module = {exports: {}};
  cache[file] = module;
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  const req = id => {
    if (id === 'cloudflare:workers') return {env: {DB: d1, BUCKET: {}}};
    if (id === 'next/navigation') return {redirect: target => {throw Error('Redirect ' + target);}, notFound: () => {throw Error('Not found');}};
    if (id.endsWith('app/chatgpt-auth')) return {getChatGPTUser: async () => actor, requireChatGPTUser: async () => actor};
    if (id.startsWith('.')) {const target = path.resolve(path.dirname(file), id); return load(target + (path.extname(target) ? '' : '.ts'));}
    return require(id);
  };
  new Function('require', 'module', 'exports', js)(req, module, module.exports);
  return module.exports;
}
const settings = load('app/api/settings/integrations/route.ts'), gateway = load('lib/integration-gateway.ts'), route = load('app/api/whatsapp/route.ts'), model = load('lib/whatsapp.ts');
const get = (sql, ...args) => sqlite.prepare(sql).get(...args), run = (sql, ...args) => sqlite.prepare(sql).run(...args);

async function key(permission) {
  actor = owner;
  const response = await settings.POST(new Request(ORIGIN + '/api/settings/integrations', {method: 'POST', headers: {origin: ORIGIN, 'content-type': 'application/json'}, body: JSON.stringify({id: randomUUID(), name: 'n8n WhatsApp ' + permission, permission, days: 7, confirmed: true})}));
  assert.equal(response.status, 201);
  return (await response.json()).token;
}
// Chamada do n8n: passa pelo gateway de integrações, sem identidade de navegador.
async function n8n(token, method, query, body) {
  actor = null;
  const target = 'whatsapp' + (query ? '?' + query : '');
  const response = await gateway.integrationGateway(new Request(ORIGIN + '/api/integrations/v1/' + target, {method, headers: {authorization: 'Bearer ' + token, ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}), {params: Promise.resolve({path: ['whatsapp']})});
  return {status: response.status, data: await response.json()};
}
// Chamada do painel: operador autenticado no navegador, mesma origem.
async function panel(method, query, body, who = owner, origin = ORIGIN) {
  actor = who;
  const request = new Request(ORIGIN + '/api/whatsapp' + (query ? '?' + query : ''), {method, headers: {origin, ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  const response = await (method === 'GET' ? route.GET(request) : route.POST(request));
  return {status: response.status, data: await response.json()};
}
const report = [];
async function test(name, fn) {
  try {await fn(); report.push([name, true]); console.log('PASS', name);} catch (error) {report.push([name, false]); console.error('FAIL', name, error.stack);}
}

const GROUP = '120363000000000001@g.us', OTHER = '120363000000000002@g.us', now = Math.floor(Date.now() / 1000);
const message = (id, extra = {}) => ({chat_jid: GROUP, chat_name: 'Alojamento A', wa_message_id: id, from_me: false, sender_jid: '5591999990000@c.us', sender_name: 'Colaborador QA', kind: 'text', body: 'O ar do quarto 3 parou de gelar', has_media: false, timestamp: now - 60, ...extra});

(async () => {
  let read, write, chat, other, pending, request;
  await test('migration creates empty WhatsApp tables', () => {
    for (const table of ['whatsapp_chats', 'whatsapp_messages', 'whatsapp_requests', 'whatsapp_summaries', 'whatsapp_outbox']) assert.equal(get(`SELECT count(*) n FROM ${table}`).n, 0);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  });
  await test('anonymous, cross-origin and read-only callers cannot write', async () => {
    read = await key('read'); write = await key('write');
    assert.equal((await panel('GET', '', null, null)).status, 401);
    assert.equal((await panel('POST', '', {action: 'send'}, owner, 'https://evil.example')).status, 403);
    assert.equal((await n8n(read, 'POST', '', {action: 'sync_chats', chats: [{jid: GROUP, name: 'X'}]})).status, 403);
    assert.equal((await n8n(read, 'GET', 'view=overview')).status, 200);
    assert.equal(get('SELECT count(*) n FROM whatsapp_chats').n, 0);
  });
  await test('group sync registers groups unmonitored and ignores direct chats', async () => {
    const result = await n8n(write, 'POST', '', {action: 'sync_chats', chats: [{jid: GROUP, name: 'Alojamento A', participants: 12}, {jid: OTHER, name: 'Alojamento B'}, {jid: '5591999990000@c.us', name: 'Pessoa'}]});
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, {synced: 2, ignored: 1});
    const rows = sqlite.prepare('SELECT id,chat_jid,name,monitored,participants_count FROM whatsapp_chats ORDER BY name').all();
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.monitored === 0));
    [chat, other] = rows;
    // Nova sincronização sem nome não apaga o nome conhecido.
    await n8n(write, 'POST', '', {action: 'sync_chats', chats: [{jid: GROUP}]});
    assert.equal(get('SELECT name FROM whatsapp_chats WHERE id=?', chat.id).name, 'Alojamento A');
  });
  await test('messages of unmonitored groups are never stored', async () => {
    const result = await n8n(write, 'POST', '', {action: 'ingest', messages: [message('m-0'), message('direct', {chat_jid: '5591999990000@c.us'})]});
    assert.deepEqual(result.data, {stored: 0, duplicates: 0, unmonitored: 1, ignored: 1});
    assert.equal(get('SELECT count(*) n FROM whatsapp_messages').n, 0);
  });
  await test('only the panel administrator turns monitoring on, with notice confirmation', async () => {
    assert.equal((await n8n(write, 'POST', '', {action: 'monitor', chat_id: chat.id, monitored: true, confirmed: true, expected_revision: 0})).status, 403);
    assert.equal((await panel('POST', '', {action: 'ingest', messages: [message('m-0')]})).status, 403);
    assert.equal((await panel('POST', '', {action: 'monitor', chat_id: chat.id, monitored: true, expected_revision: 0})).status, 400);
    const enabled = await panel('POST', '', {action: 'monitor', chat_id: chat.id, monitored: true, confirmed: true, expected_revision: 0});
    assert.equal(enabled.status, 200);
    assert.equal(enabled.data.chat.monitored, 1);
    assert.equal(enabled.data.chat.revision, 1);
    assert.equal((await panel('POST', '', {action: 'monitor', chat_id: chat.id, monitored: false, expected_revision: 0})).status, 409);
    assert.equal(get('SELECT monitored_changed_by FROM whatsapp_chats WHERE id=?', chat.id).monitored_changed_by, 'Owner QA');
  });
  await test('ingest stores once, skips analysis for own and media-only messages', async () => {
    const batch = [message('m-1'), message('m-2', {body: 'bom dia pessoal', timestamp: now - 50}), message('m-3', {from_me: true, body: 'Vamos verificar', timestamp: now - 40}), message('m-4', {kind: 'image', body: '', has_media: true, timestamp: now - 30}), message('o-1', {chat_jid: OTHER})];
    const first = await n8n(write, 'POST', '', {action: 'ingest', messages: batch});
    assert.deepEqual(first.data, {stored: 4, duplicates: 0, unmonitored: 1, ignored: 0});
    const again = await n8n(write, 'POST', '', {action: 'ingest', messages: batch});
    assert.deepEqual(again.data, {stored: 0, duplicates: 4, unmonitored: 1, ignored: 0});
    assert.equal(get('SELECT count(*) n FROM whatsapp_messages').n, 4);
    assert.equal(get("SELECT count(*) n FROM whatsapp_messages WHERE analyzed_at IS NULL").n, 2);
    assert.equal(get("SELECT direction FROM whatsapp_messages WHERE wa_message_id='m-3'").direction, 'out');
    assert.ok(get('SELECT last_message_at FROM whatsapp_chats WHERE id=?', chat.id).last_message_at);
    assert.equal((await n8n(write, 'POST', '', {action: 'ingest', messages: [message('bad', {timestamp: 'ontem'})]})).status, 400);
  });
  await test('analysis queue lists inbound text only and creates each request once', async () => {
    pending = (await n8n(read, 'GET', 'view=pending_analysis&limit=10')).data.messages;
    assert.deepEqual(pending.map(item => item.body), ['O ar do quarto 3 parou de gelar', 'bom dia pessoal']);
    const items = [{message_id: pending[0].id, category: 'maintenance', is_request: true, urgency: 'high', summary: 'Ar-condicionado do quarto 3 sem gelar'}, {message_id: pending[1].id, category: 'chatter', is_request: true, urgency: 'low', summary: 'Saudação'}];
    assert.deepEqual((await n8n(write, 'POST', '', {action: 'analysis', items})).data, {analyzed: 2, requests: 1});
    assert.deepEqual((await n8n(write, 'POST', '', {action: 'analysis', items})).data, {analyzed: 2, requests: 0});
    assert.equal(get('SELECT count(*) n FROM whatsapp_requests').n, 1);
    request = get('SELECT * FROM whatsapp_requests');
    assert.equal(request.requester_name, 'Colaborador QA');
    assert.equal(request.urgency, 'high');
    assert.equal((await n8n(read, 'GET', 'view=pending_analysis')).data.messages.length, 0);
    assert.equal((await n8n(write, 'POST', '', {action: 'analysis', items: [{message_id: pending[0].id, category: 'purchase', is_request: true}]})).status, 400);
  });
  await test('request handling records who acted and enforces revision and dismissal reason', async () => {
    assert.equal((await panel('POST', '', {action: 'request_status', id: request.id, status: 'dismissed', note: '', expected_revision: 0})).status, 400);
    const accepted = await panel('POST', '', {action: 'request_status', id: request.id, status: 'accepted', note: 'Técnico a caminho', expected_revision: 0});
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.request.status, 'accepted');
    assert.equal(accepted.data.request.handled_by_name, 'Owner QA');
    assert.equal((await panel('POST', '', {action: 'request_status', id: request.id, status: 'done', note: '', expected_revision: 0})).status, 409);
    assert.equal((await panel('GET', 'view=requests&status=open')).data.requests.length, 1);
    assert.equal((await panel('POST', '', {action: 'request_status', id: request.id, status: 'done', note: 'Resolvido', expected_revision: 1})).status, 200);
    assert.equal((await panel('GET', 'view=requests&status=open')).data.requests.length, 0);
    assert.equal((await panel('GET', 'view=requests&status=done')).data.requests.length, 1);
  });
  await test('daily summary is upserted with counts computed by the panel', async () => {
    const day = model.dayOf(new Date()), targets = (await n8n(read, 'GET', 'view=summary_targets&day=' + day)).data;
    assert.equal(targets.chats.length, 1);
    assert.equal(targets.chats[0].needs_summary, true);
    assert.equal(targets.chats[0].message_count, 3);
    const texts = (await n8n(read, 'GET', `view=day&id=${chat.id}&day=${day}`)).data.messages;
    assert.equal(texts.length, 3);
    const body = {action: 'summary', chat_id: chat.id, day, summary: 'Pedido de manutenção do ar no quarto 3.', topics: ['Ar-condicionado', 'Quarto 3'], sentiment: 'neutral'};
    assert.equal((await n8n(write, 'POST', '', body)).status, 200);
    assert.equal((await n8n(write, 'POST', '', {...body, summary: 'Atualizado.'})).status, 200);
    const saved = sqlite.prepare('SELECT * FROM whatsapp_summaries').all();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].summary, 'Atualizado.');
    assert.equal(saved[0].message_count, 3);
    assert.equal(saved[0].participant_count, 1);
    assert.equal(saved[0].request_count, 1);
    assert.equal((await n8n(read, 'GET', 'view=summary_targets&day=' + day)).data.chats[0].needs_summary, false);
    assert.equal((await n8n(write, 'POST', '', {...body, chat_id: randomUUID()})).status, 404);
    assert.deepEqual((await panel('GET', 'view=overview')).data.summaries[0].topics, ['Ar-condicionado', 'Quarto 3']);
  });
  await test('send queue is idempotent, claimed once and recorded in the group history', async () => {
    const requestId = randomUUID(), body = {action: 'send', chat_id: chat.id, body: 'Técnico chega às 14h.', request_id: requestId};
    assert.equal((await panel('POST', '', {...body, chat_id: other.id, request_id: randomUUID()})).status, 409);
    const queued = await panel('POST', '', body);
    assert.equal(queued.status, 201);
    assert.equal((await panel('POST', '', body)).data.already_saved, true);
    assert.equal((await panel('POST', '', {...body, body: 'Outro texto'})).status, 409);
    assert.equal(get('SELECT count(*) n FROM whatsapp_outbox').n, 1);
    assert.equal((await panel('POST', '', {action: 'outbox_claim'})).status, 403);
    const claim = await n8n(write, 'POST', '', {action: 'outbox_claim', limit: 5});
    assert.deepEqual(claim.data.messages, [{id: queued.data.id, body: 'Técnico chega às 14h.', chat_jid: GROUP}]);
    assert.deepEqual((await n8n(write, 'POST', '', {action: 'outbox_claim'})).data.messages, []);
    assert.equal((await panel('POST', '', {action: 'cancel_send', id: queued.data.id})).status, 409);
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: queued.data.id, ok: true, wa_message_id: 'true_120363000000000001@g.us_SENT1'})).data.status, 'sent');
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: queued.data.id, ok: true})).status, 409);
    const sent = get("SELECT direction,sender_name,body,analyzed_at FROM whatsapp_messages WHERE wa_message_id='true_120363000000000001@g.us_SENT1'");
    assert.equal(sent.direction, 'out');
    assert.equal(sent.sender_name, 'Owner QA');
    assert.ok(sent.analyzed_at);
    // O WAHA devolve a mesma mensagem na captura: não duplica.
    assert.equal((await n8n(write, 'POST', '', {action: 'ingest', messages: [message('true_120363000000000001@g.us_SENT1', {from_me: true, body: 'Técnico chega às 14h.'})]})).data.duplicates, 1);
  });
  await test('queued sends can be cancelled; unconfirmed sends fail without automatic retry', async () => {
    const first = await panel('POST', '', {action: 'send', chat_id: chat.id, body: 'Primeiro', request_id: randomUUID()});
    assert.equal((await panel('POST', '', {action: 'cancel_send', id: first.data.id})).data.status, 'cancelled');
    const second = await panel('POST', '', {action: 'send', chat_id: chat.id, body: 'Segundo', request_id: randomUUID()});
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_claim'})).data.messages.length, 1);
    run('UPDATE whatsapp_outbox SET claimed_at=? WHERE id=?', new Date(Date.now() - 11 * 60000).toISOString(), second.data.id);
    assert.deepEqual((await n8n(write, 'POST', '', {action: 'outbox_claim'})).data.messages, []);
    const failed = get('SELECT status,error FROM whatsapp_outbox WHERE id=?', second.data.id);
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /não confirmado/);
    const third = await panel('POST', '', {action: 'send', chat_id: chat.id, body: 'Terceiro', request_id: randomUUID()});
    await n8n(write, 'POST', '', {action: 'outbox_claim'});
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: third.data.id, ok: false, error: 'Sessão desconectada'})).data.status, 'failed');
    assert.equal(get("SELECT count(*) n FROM whatsapp_messages WHERE body IN ('Primeiro','Segundo','Terceiro')").n, 0);
    const items = (await panel('GET', 'view=outbox')).data.items;
    assert.equal(items.length, 4);
    assert.ok(items.some(item => item.error === 'Sessão desconectada'));
  });
  await test('retention removes text and sender of old messages but keeps the request record', async () => {
    const old = now - (model.WHATSAPP_RETENTION_DAYS + 5) * 86400;
    assert.equal((await n8n(write, 'POST', '', {action: 'ingest', messages: [message('old-1', {timestamp: old, body: 'mensagem antiga'})]})).data.stored, 1);
    const purged = get("SELECT body,sender_jid,sender_name,purged_at FROM whatsapp_messages WHERE wa_message_id='old-1'");
    assert.equal(purged.body, null);
    assert.equal(purged.sender_jid, null);
    assert.equal(purged.sender_name, null);
    assert.ok(purged.purged_at);
    assert.equal(get("SELECT body FROM whatsapp_messages WHERE wa_message_id='m-1'").body, 'O ar do quarto 3 parou de gelar');
    assert.equal(get('SELECT count(*) n FROM whatsapp_requests').n, 1);
    assert.equal((await n8n(read, 'GET', 'view=pending_analysis')).data.messages.length, 0);
  });
  await test('retention covers the send queue and closed requests without needing new messages', async () => {
    const old = new Date(Date.now() - (model.WHATSAPP_RETENTION_DAYS + 3) * 86400000).toISOString(), staleId = randomUUID();
    // Mensagem vencida gravada direto no banco, como se a captura estivesse parada há meses.
    run("INSERT INTO whatsapp_messages (id,owner_id,chat_id,wa_message_id,direction,sender_jid,sender_name,kind,body,has_media,sent_at,received_at) VALUES (?,?,?,?,'in','5591999990000@c.us','Colaborador QA','text','texto vencido',0,?,?)", staleId, OWNER, chat.id, 'stale-1', old, old);
    const sent = get("SELECT id FROM whatsapp_outbox WHERE status='sent'"), queued = await panel('POST', '', {action: 'send', chat_id: chat.id, body: 'Aguardando n8n', request_id: randomUUID()});
    run('UPDATE whatsapp_outbox SET created_at=? WHERE id IN (?,?)', old, sent.id, queued.data.id);
    run('UPDATE whatsapp_requests SET updated_at=? WHERE id=?', old, request.id);
    // Antes de qualquer limpeza, as consultas já não devolvem o que venceu.
    const view = await panel('GET', 'view=chat&id=' + chat.id), hidden = view.data.messages.find(item => item.id === staleId);
    assert.equal(hidden.body, null);
    assert.equal(hidden.sender_name, null);
    assert.ok(hidden.purged_at);
    assert.equal(view.data.requests[0].requester_name, null);
    assert.equal((await panel('GET', 'view=requests&status=done')).data.requests[0].requester_name, null);
    assert.equal((await n8n(read, 'GET', 'view=pending_analysis')).data.messages.length, 0);
    const before = (await panel('GET', 'view=outbox')).data.items;
    assert.equal(before.find(item => item.id === sent.id).body, '');
    assert.ok(before.find(item => item.id === sent.id).purged_at);
    assert.equal(before.find(item => item.id === queued.data.id).body, 'Aguardando n8n');
    assert.equal(get('SELECT body FROM whatsapp_messages WHERE id=?', staleId).body, 'texto vencido');
    // A sincronização de grupos (de hora em hora) já remove do banco, sem mensagem nova.
    assert.equal((await n8n(write, 'POST', '', {action: 'sync_chats', chats: [{jid: GROUP, name: 'Alojamento A'}]})).status, 200);
    const purged = get('SELECT body,sender_jid,sender_name,purged_at FROM whatsapp_messages WHERE id=?', staleId);
    assert.deepEqual([purged.body, purged.sender_jid, purged.sender_name], [null, null, null]);
    assert.ok(purged.purged_at);
    const outbox = get('SELECT body,purged_at,created_by_name FROM whatsapp_outbox WHERE id=?', sent.id);
    assert.equal(outbox.body, '');
    assert.ok(outbox.purged_at);
    assert.equal(outbox.created_by_name, 'Owner QA');
    assert.equal(get('SELECT requester_name FROM whatsapp_requests WHERE id=?', request.id).requester_name, null);
    // Envio ainda na fila não é apagado: o n8n precisa do texto para enviar.
    assert.equal(get('SELECT body FROM whatsapp_outbox WHERE id=?', queued.data.id).body, 'Aguardando n8n');
    assert.equal((await panel('POST', '', {action: 'cancel_send', id: queued.data.id})).status, 200);
    // A fila de envio (a cada minuto) também roda a limpeza: o envio cancelado e vencido perde o texto.
    assert.deepEqual((await n8n(write, 'POST', '', {action: 'outbox_claim'})).data.messages, []);
    assert.equal(get('SELECT body FROM whatsapp_outbox WHERE id=?', queued.data.id).body, '');
  });
  await test('group screen returns history, requests and summaries; property link is validated', async () => {
    const view = await panel('GET', 'view=chat&id=' + chat.id);
    assert.equal(view.status, 200);
    assert.equal(view.data.chat.name, 'Alojamento A');
    assert.ok(view.data.messages.length >= 5);
    assert.equal(view.data.requests.length, 1);
    assert.equal(view.data.summaries.length, 1);
    assert.ok(!JSON.stringify(view.data).includes('sender_jid'));
    assert.equal((await panel('GET', 'view=chat&id=' + randomUUID())).status, 404);
    assert.equal((await panel('GET', 'view=chat&id=' + chat.id + '&extra=1')).status, 400);
    assert.equal((await panel('POST', '', {action: 'link_property', chat_id: chat.id, property_id: randomUUID(), expected_revision: view.data.chat.revision})).status, 409);
    assert.equal((await panel('POST', '', {action: 'link_property', chat_id: chat.id, property_id: null, expected_revision: view.data.chat.revision})).status, 200);
    const totals = (await panel('GET', 'view=overview')).data.totals;
    assert.equal(totals.monitored_chats, 1);
    assert.equal(totals.open_requests, 0);
    assert.equal(totals.queued_outbox, 0);
  });
  await test('revoked credential stops writing immediately', async () => {
    assert.equal((await n8n(write, 'DELETE', '', undefined)).status, 405);
    actor = null;
    const revoke = await gateway.integrationGateway(new Request(ORIGIN + '/api/integrations/v1/access', {method: 'DELETE', headers: {authorization: 'Bearer ' + write}}), {params: Promise.resolve({path: ['access']})});
    assert.equal(revoke.status, 200);
    const before = get('SELECT count(*) n FROM whatsapp_messages').n;
    assert.equal((await n8n(write, 'POST', '', {action: 'ingest', messages: [message('after-revoke')]})).status, 401);
    assert.equal(get('SELECT count(*) n FROM whatsapp_messages').n, before);
  });
  console.log(JSON.stringify({passed: report.filter(item => item[1]).length, total: report.length}));
  sqlite.close();
  if (report.some(item => !item[1])) process.exitCode = 1;
})();
