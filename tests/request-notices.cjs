/* eslint-disable @typescript-eslint/no-require-imports -- Use the CommonJS transpile harness shared by the backend suites. */
// Request notices: real handlers + migrations + in-memory SQLite. No network, WAHA or n8n.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const {DatabaseSync} = require('node:sqlite'), {randomUUID} = require('node:crypto');
const {harness, walk, words} = require('./request-hooks-harness.cjs');
const root = path.resolve(__dirname, '..'), OWNER = 'CONFIGURE_VERIFIED_SITE_OWNER_ID', ORIGIN = 'https://qa.example';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const file of fs.readdirSync(root + '/drizzle').filter(name => /^\d{4}.*\.sql$/.test(name)).sort()) sqlite.exec(fs.readFileSync(root + '/drizzle/' + file, 'utf8'));

const owner = {userId: OWNER, email: 'qa@example.test', displayName: 'Owner QA', fullName: 'Owner QA'};
const manager = {userId: 'manager-qa', email: 'gerente@example.invalid', displayName: 'Manager QA', fullName: 'Manager QA'};
const regional = {userId: 'regional-qa', email: 'manutencao@example.invalid', displayName: 'Regional QA', fullName: 'Regional QA'};
let actor = owner;
// When set, every statement that touches the notice queue fails, as if the queue were broken.
let failNotices = false;
function prepare(sql) {
  if (failNotices && /\brequest_notices\b/.test(sql)) throw new Error('Injected notice failure for 5591988887777');
  return sqlite.prepare(sql);
}
class Statement {
  constructor(sql, args = []) {this.sql = sql; this.args = args;}
  bind(...args) {return new Statement(this.sql, args);}
  async first() {return prepare(this.sql).get(...this.args) || null;}
  async all() {return {results: prepare(this.sql).all(...this.args)};}
  async run() {return {meta: prepare(this.sql).run(...this.args)};}
}
const d1 = {
  prepare: sql => new Statement(sql),
  batch: async statements => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => ({meta: prepare(statement.sql).run(...statement.args)}));
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};
const bucket = {put: async () => {}, delete: async () => {}, get: async () => null};
const cache = {};
function load(file) {
  file = path.resolve(root, file);
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cache[file]) return cache[file].exports;
  const mod = {exports: {}};
  cache[file] = mod;
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  const req = id => {
    if (id === 'cloudflare:workers') return {env: {DB: d1, BUCKET: bucket}};
    if (id === 'next/navigation') return {redirect: target => {throw Error('Redirect ' + target);}, notFound: () => {throw Error('Not found');}};
    if (id.endsWith('app/chatgpt-auth')) return {getChatGPTUser: async () => actor, requireChatGPTUser: async () => actor};
    if (id.startsWith('.')) {const target = path.resolve(path.dirname(file), id); return load(target + (path.extname(target) ? '' : '.ts'));}
    return require(id);
  };
  new Function('require', 'module', 'exports', js)(req, mod, mod.exports);
  return mod.exports;
}
const settings = load('app/api/settings/integrations/route.ts'), gateway = load('lib/integration-gateway.ts'), route = load('app/api/whatsapp/route.ts');
const intakePublic = load('lib/request-intake-public.ts'), intakeManage = load('lib/request-intake-management.ts'), intakeModel = load('lib/request-intake-model.ts');
const intakeRoute = load('app/api/request-forms/[kind]/route.ts');
const guestPublic = load('lib/guest-channel-public.ts'), guestManage = load('lib/guest-channel-management.ts'), guestModel = load('lib/guest-channel-model.ts');
const model = load('lib/request-notices.ts'), runtime = load('lib/request-notices-runtime.ts'), whatsapp = load('lib/whatsapp.ts'), access = load('lib/app-access.ts'), region = load('lib/regional-access.ts');
const get = (sql, ...args) => sqlite.prepare(sql).get(...args), all = (sql, ...args) => sqlite.prepare(sql).all(...args), run = (sql, ...args) => sqlite.prepare(sql).run(...args);
for (const [member, role] of [[manager, 'general_manager'], [regional, 'maintenance_lead']]) run("INSERT INTO app_members (user_id,email,display_name,role,status,revision,requested_at) VALUES (?,?,?,?,'active',0,?)", member.userId, member.email, member.displayName, role, '2026-10-06T00:00:00Z');
const ownerOp = {actor: owner, ownerId: OWNER, role: 'owner', title: 'Owner', revision: 0};

// ------------------------------------------------------------------------ callers
async function key(permission) {
  actor = owner;
  const response = await settings.POST(new Request(ORIGIN + '/api/settings/integrations', {method: 'POST', headers: {origin: ORIGIN, 'content-type': 'application/json'}, body: JSON.stringify({id: randomUUID(), name: 'n8n avisos ' + permission, permission, days: 7, confirmed: true})}));
  assert.equal(response.status, 201);
  return (await response.json()).token;
}
// The n8n: through the integration gateway, with no browser identity.
async function n8n(token, method, query, body) {
  actor = null;
  const response = await gateway.integrationGateway(new Request(ORIGIN + '/api/integrations/v1/whatsapp' + (query ? '?' + query : ''), {method, headers: {authorization: 'Bearer ' + token, ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}), {params: Promise.resolve({path: ['whatsapp']})});
  return {status: response.status, data: await response.json()};
}
// The panel: an operator signed in on the browser, same origin.
async function panel(method, query, body, who = owner) {
  actor = who;
  const request = new Request(ORIGIN + '/api/whatsapp' + (query ? '?' + query : ''), {method, headers: {origin: ORIGIN, ...(body ? {'content-type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
  const response = await (method === 'GET' ? route.GET(request) : route.POST(request));
  return {status: response.status, data: await response.json()};
}
// A manager whose access is limited to one state: runs `task` inside the regional scope.
async function asRegional(task) {
  const request = new Request(ORIGIN + '/api/whatsapp', {headers: {'oai-authenticated-user-id': regional.userId, 'oai-authenticated-user-email': regional.email}});
  const previous = actor;
  actor = regional;
  try {return await region.runWithRegionalAccess(request, d1, task);} finally {actor = previous;}
}
const claim = async (token, limit = 10) => (await n8n(token, 'POST', '', {action: 'outbox_claim', limit})).data.messages;
const rejects = (promise, status, message) => assert.rejects(promise, error => error.status === status && (!message || message.test(error.message)));
// Runs `task` with the notice queue broken and returns what the code logged meanwhile.
async function withBrokenNotices(task) {
  const logged = [], original = console.error;
  console.error = (...parts) => logged.push(parts.join(' '));
  failNotices = true;
  try {return {result: await task(), logged};} finally {failNotices = false; console.error = original;}
}

// ------------------------------------------------------------------------ fixtures
// Markers: text that must never reach the wrong audience.
const NAME = 'Fulano Marcador-Nome', JOB = 'Cargo Marcador-Funcao', COMPANY = 'Empresa Marcador-Empresa', CONTACT = 'contato.marcador@example.test';
const PLACE = 'República Marcador-Local', ITEM = 'Lona Marcador-Item', NOTE = 'Nota interna Marcador-Nota';
const DESCRIPTION = 'Marcador-Descricao: lâmpada queimada.\nLigar para (91) 97777-6666 ou ver https://marcador-link.example/x';
const NUMBER = '5591988887777', JID = NUMBER + '@c.us', MASKED = '(••) •••••-7777', CONSENTED = {whatsapp: '(91) 98888-7777', whatsapp_consent: true};
// What was typed in a form (never goes to the requester) and who asked (never goes to anyone).
const FORM_TEXT = ['Marcador-Local', 'Marcador-Descricao', 'Marcador-Item', 'Marcador-Quarto', '97777', 'marcador-link'];
const IDENTITY = [NAME, JOB, COMPANY, CONTACT, 'Marcador-Nome', NOTE, '988887777', '9810000'];
const without = (body, parts) => {for (const part of parts) assert.ok(!body.includes(part), 'must not contain ' + part + ':\n' + body);};
// A new valid number for each requester, so the per-number daily limit only shows where it is tested.
let people = 0;
function person() {
  const local = '9' + String(81000000 + ++people), typed = `(91) ${local.slice(0, 5)}-${local.slice(5)}`;
  return {jid: '5591' + local + '@c.us', consent: {whatsapp: typed, whatsapp_consent: true}};
}

const intakeValues = (kind, extra = {}) => ({name: NAME, job_title: JOB, company: COMPANY, location: PLACE, address: kind === 'maintenance' ? 'Rua QA, 1, Belém' : '', contact: CONTACT, description: DESCRIPTION, cost_center: '', needed_on: '', items: kind === 'purchase' ? [{name: ITEM, quantity: 1.5, unit: 'm'}, {name: 'Mesa', quantity: 2, unit: ''}] : [], privacy_accepted: true, privacy_version: intakeModel.INTAKE_PRIVACY_VERSION, ...extra});
async function intakeSubmission(kind = 'maintenance', extra = {}) {
  const request = new Request(ORIGIN + '/api/request-forms/' + kind, {method: 'POST', headers: {origin: ORIGIN, 'cf-connecting-ip': randomUUID()}});
  const session = await intakePublic.startIntakeSession(request, kind), form = new FormData(), cookie = session.cookie.split(';')[0];
  form.set('request_id', randomUUID()); form.set('challenge', session.data.challenge); form.set('values', JSON.stringify(intakeValues(kind, extra)));
  return {kind, form, cookie, request: new Request(request, {headers: {origin: ORIGIN, cookie}})};
}
const sendIntake = submission => intakePublic.submitIntake(submission.request, submission.kind, submission.form);
// Registers a general request and returns its stored row.
async function intake(kind = 'maintenance', extra = {}) {
  const receipt = await sendIntake(await intakeSubmission(kind, extra));
  return get('SELECT * FROM request_intakes WHERE protocol=?', receipt.protocol);
}
const intakeAction = (row, action, extra = {}) => ({id: row.id, revision: get('SELECT revision FROM request_intakes WHERE id=?', row.id).revision, action, note: NOTE, order_id: null, request_id: randomUUID(), confirmed: true, ...extra});

const guestValues = (extra = {}) => ({kind: 'maintenance', category: 'air_conditioning', name: NAME, job_title: JOB, location: 'Marcador-Quarto 3', description: DESCRIPTION, contact: CONTACT, company: COMPANY, cost_center: '', items: [], scores: {cleanliness: null, comfort: null, service: null}, unable_to_photo: true, privacy_accepted: true, privacy_version: guestModel.GUEST_PRIVACY_VERSION, ...extra});
const material = {kind: 'material', category: '', items: [{name: ITEM, quantity: 4, unit: 'unidade'}]};
const rating = {kind: 'rating', category: '', job_title: '', location: '', description: 'Marcador-Descricao: a equipe demorou a atender.', scores: {cleanliness: 4, comfort: null, service: 2}, unable_to_photo: false};
async function guestSubmission(token, extra = {}) {
  const request = new Request(ORIGIN + '/api/guest-channel/' + token, {method: 'POST', headers: {origin: ORIGIN, 'cf-connecting-ip': randomUUID()}});
  const session = await guestPublic.startGuestSession(request, token), channel = await guestPublic.guestChannelData(token), form = new FormData();
  form.set('request_id', randomUUID()); form.set('challenge', session.data.challenge); form.set('channel_revision', String(channel.channel_revision)); form.set('values', JSON.stringify(guestValues(extra)));
  return {token, form, request: new Request(request, {headers: {origin: ORIGIN, cookie: session.cookie.split(';')[0]}})};
}
const sendGuest = submission => guestPublic.submitGuest(submission.request, submission.token, submission.form);
// Registers a request on a property's QR channel and returns its stored row.
async function guest(token, extra = {}) {
  const receipt = await sendGuest(await guestSubmission(token, extra));
  return get('SELECT * FROM guest_submissions WHERE protocol=?', receipt.protocol);
}
const guestAction = (row, action) => ({id: row.id, revision: get('SELECT revision FROM guest_submissions WHERE id=?', row.id).revision, action, note: NOTE, order_id: null, request_id: randomUUID(), confirmed: true});

function seedProperty(name, state = 'PA') {
  const id = randomUUID();
  run('INSERT INTO properties(id,owner_id,name,address,state_code,worksite_id,created_at) VALUES(?,?,?,?,?,?,?)', id, OWNER, name, 'Endereço privado QA', state, null, new Date().toISOString());
  return id;
}
// Turns on the property's QR channel and returns its public token.
async function openChannel(propertyId) {
  const setting = await guestManage.saveGuestChannel(ownerOp, {property_id: propertyId, action: 'enable', revision: 0, request_id: randomUUID(), confirmed: true, audience_confirmed: true});
  return setting.path.slice('/canal/'.length);
}
const noticesOf = (row, event) => all('SELECT * FROM request_notices WHERE source_id=?' + (event ? ' AND event=?' : '') + ' ORDER BY target', row.id, ...(event ? [event] : []));
const noticeCount = () => get('SELECT count(*) n FROM request_notices').n;
// A notice written straight to the table, to stand for earlier traffic.
function seedNotice(fields = {}) {
  const row = {id: randomUUID(), owner_id: OWNER, source: 'intake', source_id: randomUUID(), protocol: 'MAN-SEED', event: 'received', event_key: randomUUID(), target: 'requester', chat_id: null, requester_jid: null, body: 'seed', status: 'sent', created_at: new Date().toISOString(), ...fields};
  run(`INSERT INTO request_notices (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`, ...Object.values(row));
}
const clearSeeds = () => run("DELETE FROM request_notices WHERE protocol='MAN-SEED'");
// Takes every waiting notice out of the queue, so a delivery test starts from a known state.
const drainQueue = () => run("UPDATE request_notices SET status='cancelled' WHERE status IN ('queued','sending')");

// Form screens, driven through the shared hook harness (no browser).
const label = (screen, text) => screen.find(node => node.type === 'label' && words(node).startsWith(text))[0];
const control = (screen, text) => walk(label(screen, text), node => ['input', 'textarea', 'select'].includes(node.type))[0];
const type = (screen, text, value) => {control(screen, text).props.onChange({target: {value, checked: value}}); screen.flush();};
const submit = screen => {screen.find(node => node.type === 'form')[0].props.onSubmit({preventDefault() {}}); screen.flush();};
// Answers the session request and returns the values the form then posts.
async function postedValues(screen) {
  const session = screen.requests.length - 1;
  assert.match(screen.requests[session].url, /\/session$/);
  screen.resolve(session, {challenge: 'b'.repeat(64)});
  await screen.settle();
  return JSON.parse(screen.requests[screen.requests.length - 1].init.body.get('values'));
}

const report = [];
async function test(name, fn) {
  try {await fn(); report.push([name, true]); console.log('PASS', name);} catch (error) {report.push([name, false]); console.error('FAIL', name, error.stack);}
}

const GENERAL = '120363000000000010@g.us', GROUP_A = '120363000000000011@g.us', MANAGEMENT = '120363000000000012@g.us', SPARE = '120363000000000013@g.us';

(async () => {
  let read, write, general, groupA, management, spare, propertyA, propertyB, tokenA, tokenB;
  const chat = id => get('SELECT * FROM whatsapp_chats WHERE id=?', id);
  const setRole = (target, role, enabled, who = owner) => panel('POST', '', {action: 'group_role', chat_id: target.id, role, enabled, expected_revision: chat(target.id).revision}, who);

  await test('migration adds the notice queue and the two group roles, all empty', () => {
    assert.equal(noticeCount(), 0);
    const columns = all('PRAGMA table_info(whatsapp_chats)').map(column => column.name);
    assert.ok(columns.includes('requests_default') && columns.includes('management_default'));
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  });

  await test('WhatsApp numbers are normalised to 55 + area code + number; anything else is refused', () => {
    const valid = {'(91) 98888-7777': NUMBER, '+55 91 98888-7777': NUMBER, '5591988887777': NUMBER, '091 98888 7777': NUMBER, '91988887777': NUMBER, '(91) 3222-1111': '559132221111', '91 8888-7777': '559188887777', '55 99999-8888': '5555999998888'};
    for (const [typed, expected] of Object.entries(valid)) assert.equal(model.normalizeWhatsapp(typed), expected, typed);
    for (const typed of ['', '98888-7777', '(00) 98888-7777', '(91) 18888-7777', '11 12345-6789', '+1 415 555 1234', '+351 912 345 678', '+44 11 98888-7777', '91 98888-777a', '9'.repeat(40), 'meu número']) assert.equal(model.normalizeWhatsapp(typed), null, typed);
    // Normalising a stored number gives the same number.
    for (const expected of Object.values(valid)) assert.equal(model.normalizeWhatsapp(expected), expected);
    assert.equal(model.whatsappJid(NUMBER), JID);
    // A stored number is only used for notices when it is normalised and came with the consent.
    assert.equal(model.consentedWhatsapp({whatsapp: NUMBER, whatsapp_consent: true}), NUMBER);
    for (const values of [{whatsapp: NUMBER, whatsapp_consent: false}, {whatsapp: NUMBER}, {whatsapp: '(91) 98888-7777', whatsapp_consent: true}, {whatsapp_consent: true}, {}]) assert.equal(model.consentedWhatsapp(values), null);
    assert.equal(model.maskWhatsapp(JID), MASKED);
    assert.equal(model.maskWhatsapp('559132221111'), '(••) ••••-1111');
    assert.equal(model.maskWhatsapp('not a number'), '');
    assert.equal(model.redactNumbers('Chat 5591988887777@c.us not found'), 'Chat ••••7777@c.us not found');
  });

  await test('both public forms accept a number only with the consent box, and ratings accept neither', () => {
    assert.equal(intakeModel.INTAKE_PRIVACY_VERSION, 'general-requests-v2');
    assert.equal(guestModel.GUEST_PRIVACY_VERSION, 'identified-v2');
    const parsers = [extra => intakeModel.parseIntakeValues('maintenance', intakeValues('maintenance', extra)), extra => guestModel.parseGuestValues(guestValues(extra))];
    for (const parse of parsers) {
      const none = parse({});
      assert.deepEqual([none.whatsapp, none.whatsapp_consent], ['', false]);
      const consented = parse(CONSENTED);
      assert.deepEqual([consented.whatsapp, consented.whatsapp_consent], [NUMBER, true]);
      // The free contact field is unchanged.
      assert.equal(consented.contact, CONTACT);
      // A ticked box with no number is not a consent to anything.
      assert.equal(parse({whatsapp: '  ', whatsapp_consent: true}).whatsapp_consent, false);
      assert.throws(() => parse({whatsapp: '(91) 98888-7777'}), error => error.status === 400 && error.message === model.WHATSAPP_CONSENT_REQUIRED);
      assert.throws(() => parse({whatsapp: '(91) 98888-7777', whatsapp_consent: false}), error => error.status === 400 && error.message === model.WHATSAPP_CONSENT_REQUIRED);
      for (const number of ['98888-7777', '+1 415 555 1234', 91988887777]) assert.throws(() => parse({whatsapp: number, whatsapp_consent: true}), error => error.status === 400 && error.message === model.WHATSAPP_INVALID);
      assert.throws(() => parse({whatsapp_consent: 'yes'}), error => error.status === 400);
      assert.throws(() => parse({privacy_version: parse === parsers[0] ? 'general-requests-v1' : 'identified-v1'}), error => error.status === 400);
      assert.throws(() => parse({whatsapp_number: NUMBER}), error => error.status === 400);
    }
    // A rating is an opinion, not a request: it takes no number and no consent.
    assert.deepEqual([guestModel.parseGuestValues(guestValues(rating)).whatsapp, guestModel.parseGuestValues(guestValues({...rating, whatsapp: '', whatsapp_consent: false})).whatsapp_consent], ['', false]);
    for (const extra of [CONSENTED, {whatsapp: '(91) 98888-7777'}, {whatsapp_consent: true}]) {
      assert.throws(() => guestModel.parseGuestValues(guestValues({...rating, ...extra})), error => error.status === 400 && /somente nos pedidos de manutenção e de material/.test(error.message));
    }
  });

  await test('form screens: the number needs the consent box; the rating form has no WhatsApp field', async () => {
    const intakeForm = harness('app/components/request-intake-form.tsx', {kind: 'maintenance'}, 'default', {stubPhotoPreparation: true});
    for (const [field, value] of [['Seu nome', 'Pessoa QA'], ['Sua função', 'Cliente'], ['Empresa onde trabalha', 'Empresa QA'], ['República / imóvel', 'Local QA'], ['Endereço do local', 'Rua QA, 123'], ['Descreva a solicitação', 'Texto QA'], ['Confirmo o envio', true]]) type(intakeForm, field, value);
    assert.equal(control(intakeForm, 'WhatsApp para receber avisos').props.required, undefined);
    assert.equal(label(intakeForm, 'Autorizo receber no WhatsApp'), undefined);
    type(intakeForm, 'WhatsApp para receber avisos', '98888-7777');
    submit(intakeForm);
    assert.ok(intakeForm.words.includes(model.WHATSAPP_INVALID));
    type(intakeForm, 'WhatsApp para receber avisos', '(91) 98888-7777');
    submit(intakeForm);
    assert.ok(intakeForm.words.includes(model.WHATSAPP_CONSENT_REQUIRED));
    assert.equal(intakeForm.requests.length, 0);
    type(intakeForm, 'Autorizo receber no WhatsApp', true);
    // Emptying the field takes the authorisation back, so it is not carried over to another number.
    type(intakeForm, 'WhatsApp para receber avisos', '');
    assert.equal(label(intakeForm, 'Autorizo receber no WhatsApp'), undefined);
    type(intakeForm, 'WhatsApp para receber avisos', '(91) 98888-7777');
    assert.equal(control(intakeForm, 'Autorizo receber no WhatsApp').props.checked, false);
    type(intakeForm, 'Autorizo receber no WhatsApp', true);
    submit(intakeForm);
    const sent = await postedValues(intakeForm);
    assert.deepEqual([sent.whatsapp, sent.whatsapp_consent, sent.contact], [NUMBER, true, '']);
    // The privacy notice says what goes to the WhatsApp group and what the number is used for.
    assert.match(intakeForm.words, /Um resumo do pedido \(tipo, local, descrição e protocolo\), sem o seu nome nem o seu contato, é enviado ao grupo de WhatsApp da operação\./);
    assert.match(intakeForm.words, /O WhatsApp para avisos, se informado, é usado só para avisar sobre este pedido\./);
    intakeForm.unmount();

    const channelForm = harness('app/components/guest-channel-form.tsx', {token: 'a'.repeat(64)}, 'default', {stubPhotoPreparation: true});
    channelForm.resolve(0, {property: {name: 'República QA', address: 'Rua QA', code: '01'}, channel_revision: 1, privacy_version: guestModel.GUEST_PRIVACY_VERSION});
    await channelForm.settle();
    assert.match(channelForm.words, /Nos pedidos de manutenção e de material, um resumo .* é enviado ao grupo de WhatsApp da operação\..*A avaliação da hospedagem não é enviada a nenhum grupo\./);
    type(channelForm, 'Seu nome', 'Pessoa QA');
    type(channelForm, 'WhatsApp para receber avisos', '(91) 98888-7777');
    assert.ok(label(channelForm, 'Autorizo receber no WhatsApp'));
    // Switching to a rating removes the field and the box, and nothing typed before is sent.
    channelForm.find(node => node.type === 'input' && node.props.type === 'radio' && node.props.value === 'rating')[0].props.onChange();
    channelForm.flush();
    assert.equal(label(channelForm, 'WhatsApp para receber avisos'), undefined);
    assert.equal(label(channelForm, 'Autorizo receber no WhatsApp'), undefined);
    channelForm.find(node => node.type === 'input' && node.props.name === 'score-cleanliness' && node.props.value === 5)[0].props.onChange();
    channelForm.flush();
    type(channelForm, 'Li e concordo', true);
    submit(channelForm);
    const opinion = await postedValues(channelForm);
    assert.deepEqual([opinion.kind, opinion.whatsapp, opinion.whatsapp_consent], ['rating', '', false]);
    channelForm.unmount();
  });

  await test('Central screen: role badges and controls, and the read-only notice list', async () => {
    const screen = 'app/whatsapp/whatsapp-central.tsx';
    const row = {id: '11111111-1111-4111-8111-111111111111', chat_jid: GENERAL, name: 'Solicitações gerais', participants_count: 8, monitored: 0, property_id: null, property_name: null, last_message_at: null, revision: 4, requests_default: 1, management_default: 0, messages_24h: 0, open_requests: 0};
    const groups = harness(screen, {data: {chats: [row, {...row, id: '22222222-2222-4222-8222-222222222222', name: 'Gestão Mobiliza', requests_default: 0, management_default: 1}, {...row, id: '33333333-3333-4333-8333-333333333333', name: 'Reserva', requests_default: 0}], chats_limited: false}, onOpenChat() {}}, 'ChatsPanel');
    // The harness does not expand nested components, so each group's badges are rendered here.
    assert.deepEqual(groups.find(node => typeof node.type === 'function' && node.type.name === 'RoleBadges').map(node => words(node.type(node.props))), ['Grupo geral de solicitações', 'Gestão', '']);
    groups.unmount();

    const group = harness(screen, {id: row.id, properties: [], onClose() {}, onDone() {}}, 'ChatPanel');
    group.timers();
    assert.match(group.requests[0].url, /view=chat&id=11111111/);
    group.resolve(0, {chat: row, messages: [], has_more: false, requests: [], summaries: [], can_manage: true});
    await group.settle();
    assert.ok(group.button('Deixar de usar como grupo geral'));
    // Giving a role asks first, because it takes the role from the group that has it.
    group.button('Usar como grupo da gestão (assistente Mobi)').props.onClick();
    assert.deepEqual([group.confirmCalls, group.requests.length], [1, 1]);
    group.confirm(true);
    group.button('Usar como grupo da gestão (assistente Mobi)').props.onClick();
    assert.deepEqual(JSON.parse(group.requests[1].init.body), {action: 'group_role', chat_id: row.id, role: 'management', enabled: true, expected_revision: 4});
    group.unmount();

    const list = harness(screen, {notices: [
      {id: 'n1', source: 'intake', source_id: 'intake-id', protocol: 'MAN-QA', event: 'received', target: 'requester', chat_name: null, requester: MASKED, status: 'failed', created_at: '2026-11-13T17:32:00.000Z', sent_at: null, error: 'Chat ••••7777@c.us not found', purged_at: null},
      {id: 'n2', source: 'guest', source_id: 'guest-id', protocol: 'SOL-QA', event: 'closed', target: 'group', chat_name: 'Alojamento A', requester: null, status: 'sent', created_at: '2026-11-13T17:32:00.000Z', sent_at: '2026-11-13T17:33:00.000Z', error: null, purged_at: null},
    ]}, 'NoticesPanel');
    for (const text of ['Avisos de solicitações', 'MAN-QA · Registro', 'Solicitante: ' + MASKED, 'Falhou', 'Chat ••••7777@c.us not found', 'SOL-QA · Encerramento', 'Grupo: Alojamento A', 'Enviado']) assert.ok(list.words.includes(text), text);
    assert.deepEqual(list.find(node => node.type === 'a').map(node => node.props.href), ['/solicitacoes?request_id=intake-id', '/solicitacoes?id=guest-id']);
    // Nothing to press: the list only shows.
    assert.equal(list.find(node => ['button', 'input', 'select', 'textarea'].includes(node.type)).length, 0);
    list.unmount();
  });

  await test('the form route answers a number without consent with a clear message and saves nothing', async () => {
    const submission = await intakeSubmission('maintenance', {whatsapp: '(91) 98888-7777'});
    const response = await intakeRoute.POST(new Request(ORIGIN + '/api/request-forms/maintenance', {method: 'POST', headers: {origin: ORIGIN, cookie: submission.cookie, 'cf-connecting-ip': randomUUID()}, body: submission.form}), {params: Promise.resolve({kind: 'maintenance'})});
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, model.WHATSAPP_CONSENT_REQUIRED);
    assert.equal(get('SELECT count(*) n FROM request_intakes').n, 0);
  });

  await test('message texts: the requester gets no form text; the group text is labelled, with no long number or link', () => {
    const request = {kind: 'Compra', protocol: 'COM-A1B2C3D4E5F6A7B8', property: 'República Alfa 01', declaredPlace: PLACE + ', bloco\nB', description: DESCRIPTION + ' CPF 123.456.789-09. ' + 'x'.repeat(400),
      items: [{name: ITEM, quantity: 1.5, unit: 'm'}, {name: 'Mesa www.marcador-link.example', quantity: 2, unit: ''}, ...Array.from({length: 12}, (_, index) => ({name: 'Item ' + index, quantity: 1, unit: 'caixa'}))],
      receivedAt: '2026-11-13T17:32:00.000Z', closedAt: '2026-11-15T02:05:00.000Z'};
    const facts = ['Protocolo: *COM-A1B2C3D4E5F6A7B8*', 'Tipo: Compra', 'Imóvel: República Alfa 01'];
    const group = model.noticeBody('received', 'group', request).split('\n');
    assert.deepEqual(group.slice(0, 5), ['*Nova solicitação*', ...facts, 'Local informado: República Marcador-Local, bloco B']);
    assert.match(group[5], /^Itens informados: Lona Marcador-Item \(1,5 m\); Mesa marcador-link\. example \(2\); Item 0 \(1 caixa\).*; mais 6 itens$/);
    assert.match(group[6], /^Descrição informada: Marcador-Descricao: lâmpada queimada\. Ligar para \[número omitido\] ou ver marcador-link\. example\/x CPF \[número omitido\]\. x+…$/);
    assert.ok(group[6].length <= 'Descrição informada: '.length + 280);
    // Dates follow Belém time (UTC-3), whatever the server's own time zone.
    assert.deepEqual(group.slice(7), ['Recebida em 13/11/2026 às 14:32', '_Horário de Belém._']);
    assert.deepEqual(model.noticeBody('closed', 'group', request).split('\n'), ['*Solicitação encerrada*', ...facts, 'Local informado: República Marcador-Local, bloco B', 'Recebida em 13/11/2026 às 14:32', 'Encerrada em 14/11/2026 às 23:05', '_Horário de Belém._']);
    assert.deepEqual(model.noticeBody('received', 'requester', request).split('\n'), ['*MOBILIZA FACILITIES*', 'Recebemos a sua solicitação.', '', ...facts, 'Recebida em 13/11/2026 às 14:32', '', 'Você receberá outro aviso por aqui quando o atendimento for encerrado.', '_Horário de Belém._']);
    assert.deepEqual(model.noticeBody('closed', 'requester', request).split('\n'), ['*MOBILIZA FACILITIES*', 'O atendimento da sua solicitação foi encerrado.', '', ...facts, 'Recebida em 13/11/2026 às 14:32', 'Encerrada em 14/11/2026 às 23:05', '_Horário de Belém._']);
    // With no registered property the requester's message has no place line at all.
    const unlinked = model.noticeBody('received', 'requester', {...request, property: null});
    assert.ok(!unlinked.includes('Imóvel') && !unlinked.includes('Local') && !unlinked.includes('Assunto'));
    // The subject is the label of an option of the QR form's fixed list, so both audiences get it, after the type.
    for (const event of ['received', 'closed']) {
      for (const target of ['group', 'requester']) assert.ok(model.noticeBody(event, target, {...request, subject: 'Ar-condicionado'}).includes('Tipo: Compra\nAssunto: Ar-condicionado\nImóvel: República Alfa 01\n'));
    }
    for (const event of ['received', 'closed']) {
      for (const property of ['República Alfa 01', null]) {
        without(model.noticeBody(event, 'requester', {...request, property}), [...FORM_TEXT, 'informad']);
        for (const target of ['group', 'requester']) assert.ok(!/https?:|www\.|\d{8}/.test(model.noticeBody(event, target, {...request, property})));
      }
    }
    assert.equal(model.declaredText('Zap 9 1 9 8 8 8 8 7 7 7 7, PIX 12345678, sala 12, dia 14/11/2026', 200), 'Zap [número omitido], PIX [número omitido], sala 12, dia 14/11/2026');
    // Invisible characters between the digits (zero-width space, right-to-left override) do not hide a number.
    const invisible = [0x200b, 0x202e].map(code => String.fromCharCode(code));
    assert.equal(model.declaredText('Ligue 9198' + invisible[0] + '888' + invisible[1] + '7777 hoje', 200), 'Ligue [número omitido] hoje');
    assert.equal(model.noticeKindLabel('guest', 'rating'), null);
    assert.deepEqual(['maintenance', 'material'].map(kind => model.noticeKindLabel('guest', kind)), ['Manutenção', 'Material']);
    assert.deepEqual(['maintenance', 'purchase'].map(kind => model.noticeKindLabel('intake', kind)), ['Manutenção', 'Compra']);
  });

  await test('with no group at all, only the authorised requester is notified', async () => {
    const silent = await intake();
    assert.equal(noticesOf(silent).length, 0);
    const row = await intake('maintenance', CONSENTED);
    const notices = noticesOf(row);
    assert.equal(notices.length, 1);
    assert.deepEqual([notices[0].target, notices[0].requester_jid, notices[0].chat_id, notices[0].status, notices[0].event], ['requester', JID, null, 'queued', 'received']);
    const stored = JSON.parse(row.values_json);
    assert.deepEqual([stored.whatsapp, stored.whatsapp_consent], [NUMBER, true]);
    drainQueue();
  });

  await test('group roles are set by a human administrator only, one group per owner for each role', async () => {
    read = await key('read'); write = await key('write');
    assert.equal((await n8n(write, 'POST', '', {action: 'sync_chats', chats: [{jid: GENERAL, name: 'Solicitações gerais'}, {jid: GROUP_A, name: 'Alojamento A'}, {jid: MANAGEMENT, name: 'Gestão Mobiliza'}, {jid: SPARE, name: 'Reserva'}]})).status, 200);
    [groupA, management, spare, general] = all('SELECT * FROM whatsapp_chats ORDER BY name');
    assert.deepEqual([groupA.chat_jid, management.chat_jid, spare.chat_jid, general.chat_jid], [GROUP_A, MANAGEMENT, SPARE, GENERAL]);
    const body = {action: 'group_role', chat_id: general.id, role: 'requests', enabled: true, expected_revision: 0};
    // Integration keys (even with write permission) and non-administrators cannot choose the groups.
    assert.equal((await n8n(write, 'POST', '', body)).status, 403);
    assert.equal((await panel('POST', '', body, manager)).status, 403);
    assert.equal((await panel('POST', '', body, null)).status, 401);
    for (const invalid of [{role: 'other'}, {role: undefined}, {enabled: 'yes'}, {enabled: undefined}]) assert.equal((await panel('POST', '', {...body, ...invalid})).status, 400);
    assert.equal((await panel('POST', '', {...body, expected_revision: 5})).status, 409);
    assert.equal((await panel('POST', '', {...body, chat_id: randomUUID()})).status, 409);
    assert.equal(chat(general.id).requests_default, 0);

    const marked = await panel('POST', '', body);
    assert.equal(marked.status, 200);
    assert.deepEqual([marked.data.chat.requests_default, marked.data.chat.management_default, marked.data.chat.revision], [1, 0, 1]);
    // Giving the role to another group takes it from the first, and both revisions move.
    assert.equal((await setRole(spare, 'requests', true)).status, 200);
    assert.deepEqual([chat(general.id).requests_default, chat(general.id).revision, chat(spare.id).requests_default], [0, 2, 1]);
    assert.throws(() => run('UPDATE whatsapp_chats SET requests_default=1 WHERE id=?', general.id), /UNIQUE/);
    // A stale screen changes nothing, not even for the group that has the role now.
    assert.equal((await panel('POST', '', {...body, expected_revision: 1})).status, 409);
    assert.equal(chat(spare.id).requests_default, 1);
    assert.equal((await setRole(spare, 'requests', false)).data.chat.requests_default, 0);
    assert.equal(get('SELECT count(*) n FROM whatsapp_chats WHERE requests_default=1').n, 0);
    assert.equal((await setRole(general, 'requests', true)).status, 200);

    // The managers' group follows the same rules and is independent of the general group.
    assert.equal((await n8n(write, 'POST', '', {...body, chat_id: management.id, role: 'management'})).status, 403);
    assert.equal((await setRole(management, 'management', true, manager)).status, 403);
    assert.equal((await setRole(spare, 'management', true)).status, 200);
    assert.equal((await setRole(management, 'management', true)).status, 200);
    assert.throws(() => run('UPDATE whatsapp_chats SET management_default=1 WHERE id=?', spare.id), /UNIQUE/);
    assert.deepEqual(all('SELECT name,requests_default,management_default FROM whatsapp_chats ORDER BY name').map(row => [row.name, row.requests_default, row.management_default]),
      [['Alojamento A', 0, 0], ['Gestão Mobiliza', 0, 1], ['Reserva', 0, 0], ['Solicitações gerais', 1, 0]]);
    // Both marks come in the overview (which the n8n reads with a read key) and in the group screen.
    for (const overview of [await panel('GET', 'view=overview'), await n8n(read, 'GET', 'view=overview')]) {
      assert.equal(overview.status, 200);
      assert.deepEqual(Object.fromEntries(overview.data.chats.map(row => [row.chat_jid, [row.requests_default, row.management_default]])), {[GENERAL]: [1, 0], [MANAGEMENT]: [0, 1], [GROUP_A]: [0, 0], [SPARE]: [0, 0]});
      // Groups with a role come first.
      assert.deepEqual(overview.data.chats.slice(0, 2).map(row => row.chat_jid).sort(), [GENERAL, MANAGEMENT]);
    }
    assert.equal((await panel('GET', 'view=chat&id=' + management.id)).data.chat.management_default, 1);
    // The mark is all the panel does with the managers' group: it queues nothing for it.
    assert.equal(get('SELECT count(*) n FROM whatsapp_outbox').n, 0);
    assert.equal(get('SELECT count(*) n FROM request_notices WHERE chat_id=?', management.id).n, 0);
  });

  await test('targets view lists only followed and role groups, in one light query', async () => {
    assert.equal((await panel('POST', '', {action: 'monitor', chat_id: groupA.id, monitored: true, confirmed: true, expected_revision: chat(groupA.id).revision})).status, 200);
    const expected = [
      {id: groupA.id, chat_jid: GROUP_A, name: 'Alojamento A', monitored: 1, requests_default: 0, management_default: 0},
      {id: management.id, chat_jid: MANAGEMENT, name: 'Gestão Mobiliza', monitored: 0, requests_default: 0, management_default: 1},
      {id: general.id, chat_jid: GENERAL, name: 'Solicitações gerais', monitored: 0, requests_default: 1, management_default: 0},
    ];
    for (const result of [await panel('GET', 'view=targets'), await panel('GET', 'view=targets', null, manager), await n8n(read, 'GET', 'view=targets')]) {
      assert.equal(result.status, 200);
      assert.deepEqual(result.data, {chats: expected});
    }
    assert.equal((await panel('GET', 'view=targets', null, null)).status, 401);
    assert.equal((await panel('GET', 'view=targets&extra=1')).status, 400);
  });

  await test('registering a general request notifies the general group and the authorised requester', async () => {
    const asker = person(), row = await intake('maintenance', asker.consent);
    assert.equal(row.property_id, null);
    const [group, requester] = noticesOf(row);
    assert.equal(noticesOf(row).length, 2);
    const event = get("SELECT id FROM request_intake_events WHERE intake_id=? AND action='received'", row.id);
    for (const notice of [group, requester]) assert.deepEqual([notice.source, notice.protocol, notice.event, notice.event_key, notice.status, notice.owner_id], ['intake', row.protocol, 'received', event.id, 'queued', OWNER]);
    assert.deepEqual([group.target, group.chat_id, group.requester_jid], ['group', general.id, null]);
    assert.deepEqual([requester.target, requester.chat_id, requester.requester_jid], ['requester', null, asker.jid]);
    const lines = group.body.split('\n');
    assert.deepEqual(lines.slice(0, 5), ['*Nova solicitação*', `Protocolo: *${row.protocol}*`, 'Tipo: Manutenção', 'Local informado: ' + PLACE, 'Descrição informada: Marcador-Descricao: lâmpada queimada. Ligar para [número omitido] ou ver marcador-link. example/x']);
    assert.match(lines[5], /^Recebida em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/);
    assert.equal(lines[6], '_Horário de Belém._');
    // Nobody in the group learns who asked or how to reach them; the phone and the link typed in the description are gone.
    without(group.body, [...IDENTITY, '97777', '6666', 'https://', 'marcador-link.example']);
    assert.deepEqual(requester.body.split('\n').slice(0, 5), ['*MOBILIZA FACILITIES*', 'Recebemos a sua solicitação.', '', `Protocolo: *${row.protocol}*`, 'Tipo: Manutenção']);
    without(requester.body, [...FORM_TEXT, ...IDENTITY, 'Local', 'Imóvel']);

    // A purchase lists its items for the group; a request with no number only notifies the group.
    const purchase = await intake('purchase');
    const notices = noticesOf(purchase);
    assert.deepEqual(notices.map(notice => notice.target), ['group']);
    assert.ok(notices[0].body.includes('Tipo: Compra\nLocal informado: ' + PLACE + '\nItens informados: Lona Marcador-Item (1,5 m); Mesa (2)\nDescrição informada: '));
    without(notices[0].body, IDENTITY);
  });

  await test('replays never duplicate a notice, and create the one a first attempt did not live to create', async () => {
    const submission = await intakeSubmission('maintenance', person().consent);
    const receipt = await sendIntake(submission), before = noticeCount();
    const again = await sendIntake(submission);
    assert.deepEqual([again.protocol, again.alreadySaved], [receipt.protocol, true]);
    assert.equal(noticeCount(), before);

    // The request is saved but the queue fails: the form still gets its protocol.
    const lost = await intakeSubmission('maintenance', person().consent);
    const {result, logged} = await withBrokenNotices(() => sendIntake(lost));
    assert.deepEqual(Object.keys(result), ['protocol', 'received_at']);
    const row = get('SELECT * FROM request_intakes WHERE protocol=?', result.protocol);
    assert.equal(row.status, 'received');
    assert.equal(noticesOf(row).length, 0);
    // The failure is logged once, and the log never shows a phone number.
    assert.equal(logged.length, 1);
    assert.match(logged[0], /^request-notices received /);
    assert.ok(!/\d{8}/.test(logged[0]));
    // The same submission sent again: the request is not duplicated and the notices now exist.
    const replay = await sendIntake(lost);
    assert.equal(replay.alreadySaved, true);
    assert.equal(get('SELECT count(*) n FROM request_intakes WHERE protocol=?', result.protocol).n, 1);
    assert.deepEqual(noticesOf(row).map(notice => [notice.target, notice.status]), [['group', 'queued'], ['requester', 'queued']]);
    await sendIntake(lost);
    assert.equal(noticesOf(row).length, 2);
  });

  await test('QR channel: the property group is notified, else the general group; ratings notify nobody', async () => {
    propertyA = seedProperty('República Alfa 01'); propertyB = seedProperty('República Beta 02');
    tokenA = await openChannel(propertyA); tokenB = await openChannel(propertyB);
    assert.equal((await panel('POST', '', {action: 'link_property', chat_id: groupA.id, property_id: propertyA, expected_revision: chat(groupA.id).revision})).status, 200);

    const asker = person(), row = await guest(tokenA, asker.consent);
    const [group, requester] = noticesOf(row);
    assert.equal(noticesOf(row).length, 2);
    assert.deepEqual([group.source, group.target, group.chat_id, group.event], ['guest', 'group', groupA.id, 'received']);
    // The subject is the label of the option picked in the form's fixed list, so it may go to both.
    assert.deepEqual(group.body.split('\n').slice(0, 6), ['*Nova solicitação*', `Protocolo: *${row.protocol}*`, 'Tipo: Manutenção', 'Assunto: Ar-condicionado', 'Imóvel: República Alfa 01', 'Local informado: Marcador-Quarto 3']);
    without(group.body, IDENTITY);
    // The requester's message names the registered property, never the room typed in the form.
    assert.equal(requester.requester_jid, asker.jid);
    assert.ok(requester.body.includes('Tipo: Manutenção\nAssunto: Ar-condicionado\nImóvel: República Alfa 01\nRecebida em '));
    without(requester.body, [...FORM_TEXT, ...IDENTITY, 'informad']);

    // Property without a linked group: the general group receives it, with the items of a material request.
    const supply = await guest(tokenB, material);
    const [fallback] = noticesOf(supply);
    assert.equal(noticesOf(supply).length, 1);
    assert.equal(fallback.chat_id, general.id);
    assert.ok(fallback.body.includes('Tipo: Material\nImóvel: República Beta 02\nLocal informado: Marcador-Quarto 3\nItens informados: Lona Marcador-Item (4 unidade)\nDescrição informada: '));

    // A rating never reaches a group or a phone, when it is registered or when its triage is closed.
    const before = noticeCount();
    const opinion = await guest(tokenA, rating);
    assert.equal(opinion.kind, 'rating');
    await guestManage.triageGuestRequest(ownerOp, guestAction(opinion, 'close'));
    assert.equal(get('SELECT status FROM guest_submissions WHERE id=?', opinion.id).status, 'closed');
    assert.equal(noticeCount(), before);
    await rejects(sendGuest(await guestSubmission(tokenA, {...rating, ...CONSENTED})), 400, /somente nos pedidos/);
    assert.equal(noticeCount(), before);

    // With no property group and no general group there is no group notice, and nothing fails.
    assert.equal((await setRole(general, 'requests', false)).status, 200);
    const quiet = await guest(tokenB);
    assert.equal(noticesOf(quiet).length, 0);
    const onlyRequester = await guest(tokenB, person().consent);
    assert.deepEqual(noticesOf(onlyRequester).map(notice => notice.target), ['requester']);
    assert.equal((await setRole(general, 'requests', true)).status, 200);
  });

  await test('closing notifies the property group set in triage and the requester, without the closing note', async () => {
    const asker = person(), row = await intake('maintenance', asker.consent);
    assert.equal(noticesOf(row, 'received')[0].chat_id, general.id);
    await intakeManage.triageIntake(ownerOp, intakeAction(row, 'assign', {property_id: propertyA, state_code: 'PA', responsible_user_id: ''}));
    await intakeManage.triageIntake(ownerOp, intakeAction(row, 'review'));
    assert.equal(noticesOf(row, 'closed').length, 0);

    const close = intakeAction(row, 'close');
    const saved = await intakeManage.triageIntake(ownerOp, close);
    const event = get('SELECT id FROM request_intake_events WHERE intake_id=? AND revision=?', row.id, saved.revision);
    const [group, requester] = noticesOf(row, 'closed');
    assert.equal(noticesOf(row, 'closed').length, 2);
    // The request was linked to a property in triage, so that property's group is told, not the general one.
    assert.deepEqual([group.target, group.chat_id, group.event_key, group.status], ['group', groupA.id, event.id, 'queued']);
    assert.deepEqual(group.body.split('\n').slice(0, 5), ['*Solicitação encerrada*', `Protocolo: *${row.protocol}*`, 'Tipo: Manutenção', 'Imóvel: República Alfa 01', 'Local informado: ' + PLACE]);
    assert.match(group.body, /\nRecebida em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}\nEncerrada em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}\n_Horário de Belém\._$/);
    without(group.body, [...IDENTITY, 'Marcador-Descricao']);
    assert.deepEqual([requester.target, requester.requester_jid, requester.event_key], ['requester', asker.jid, event.id]);
    assert.ok(requester.body.startsWith(`*MOBILIZA FACILITIES*\nO atendimento da sua solicitação foi encerrado.\n\nProtocolo: *${row.protocol}*\nTipo: Manutenção\nImóvel: República Alfa 01\nRecebida em `));
    without(requester.body, [...FORM_TEXT, ...IDENTITY, 'informad']);

    // The same close sent again is a replay: no new notice.
    assert.equal((await intakeManage.triageIntake(ownerOp, close)).alreadySaved, true);
    assert.equal(noticesOf(row, 'closed').length, 2);
    // Reopening says nothing; closing again is a new event with its own notices.
    await intakeManage.triageIntake(ownerOp, intakeAction(row, 'reopen'));
    assert.equal(noticesOf(row, 'closed').length, 2);
    await intakeManage.triageIntake(ownerOp, intakeAction(row, 'close'));
    const closed = noticesOf(row, 'closed');
    assert.equal(closed.length, 4);
    assert.equal(new Set(closed.map(notice => notice.event_key)).size, 2);
    assert.equal(noticesOf(row, 'received').length, 2);

    // A request never linked to a property closes into the general group.
    const purchase = await intake('purchase');
    await intakeManage.triageIntake(ownerOp, intakeAction(purchase, 'close'));
    assert.deepEqual(noticesOf(purchase, 'closed').map(notice => [notice.target, notice.chat_id]), [['group', general.id]]);

    // QR channel: same rules, through the other triage.
    const resident = person(), stay = await guest(tokenA, resident.consent);
    await guestManage.triageGuestRequest(ownerOp, guestAction(stay, 'review'));
    assert.equal(noticesOf(stay, 'closed').length, 0);
    const guestClose = guestAction(stay, 'close');
    await guestManage.triageGuestRequest(ownerOp, guestClose);
    const guestClosed = noticesOf(stay, 'closed');
    assert.deepEqual(guestClosed.map(notice => [notice.source, notice.target, notice.chat_id, notice.requester_jid]), [['guest', 'group', groupA.id, null], ['guest', 'requester', null, resident.jid]]);
    assert.ok(guestClosed[0].body.startsWith(`*Solicitação encerrada*\nProtocolo: *${stay.protocol}*\nTipo: Manutenção\nAssunto: Ar-condicionado\nImóvel: República Alfa 01\nLocal informado: Marcador-Quarto 3\nRecebida em `));
    without(guestClosed[0].body, IDENTITY);
    without(guestClosed[1].body, [...FORM_TEXT, ...IDENTITY, 'informad']);
    assert.equal((await guestManage.triageGuestRequest(ownerOp, guestClose)).alreadySaved, true);
    await guestManage.triageGuestRequest(ownerOp, guestAction(stay, 'reopen'));
    await guestManage.triageGuestRequest(ownerOp, guestAction(stay, 'close'));
    assert.equal(noticesOf(stay, 'closed').length, 4);
  });

  await test('a broken notice queue never fails the request or the triage, and a replay recovers the notice', async () => {
    const row = await intake('maintenance', person().consent);
    const close = intakeAction(row, 'close');
    const first = await withBrokenNotices(() => intakeManage.triageIntake(ownerOp, close));
    assert.equal(first.result.revision, 2);
    assert.equal(get('SELECT status FROM request_intakes WHERE id=?', row.id).status, 'closed');
    assert.equal(noticesOf(row, 'closed').length, 0);
    assert.match(first.logged[0], /^request-notices closed /);
    assert.equal((await intakeManage.triageIntake(ownerOp, close)).alreadySaved, true);
    assert.equal(noticesOf(row, 'closed').length, 2);

    const pending = await guestSubmission(tokenA, person().consent);
    const stay = await withBrokenNotices(() => sendGuest(pending));
    assert.match(stay.result.protocol, /^SOL-/);
    const saved = get('SELECT * FROM guest_submissions WHERE protocol=?', stay.result.protocol);
    assert.equal(noticesOf(saved).length, 0);
    const guestClose = guestAction(saved, 'close');
    const closed = await withBrokenNotices(() => guestManage.triageGuestRequest(ownerOp, guestClose));
    assert.equal(closed.result.revision, 2);
    assert.equal(get('SELECT status FROM guest_submissions WHERE id=?', saved.id).status, 'closed');
    assert.equal(noticesOf(saved).length, 0);
    // A replay of the close recovers the closing notices. The request is closed by now, so a late
    // replay of the form does not announce it as new.
    assert.equal((await guestManage.triageGuestRequest(ownerOp, guestClose)).alreadySaved, true);
    assert.equal((await sendGuest(pending)).alreadySaved, true);
    assert.deepEqual(noticesOf(saved).map(notice => [notice.event, notice.target]), [['closed', 'group'], ['closed', 'requester']]);
    assert.ok([...first.logged, ...stay.logged, ...closed.logged].every(line => !/\d{8}/.test(line)));

    // A close replayed after the request was reopened is not announced: it is not closed any more.
    const reopened = await intake('maintenance', person().consent);
    const stale = intakeAction(reopened, 'close');
    await withBrokenNotices(() => intakeManage.triageIntake(ownerOp, stale));
    await intakeManage.triageIntake(ownerOp, intakeAction(reopened, 'reopen'));
    assert.equal((await intakeManage.triageIntake(ownerOp, stale)).alreadySaved, true);
    assert.equal(noticesOf(reopened, 'closed').length, 0);
    // Only a close event produces closing notices, whatever revision the queue is asked about.
    await intakeManage.triageIntake(ownerOp, intakeAction(reopened, 'close'));
    assert.equal(noticesOf(reopened, 'closed').length, 2);
    for (const revision of [1, 2, 3]) await runtime.requestNotices.queueClosed(OWNER, 'intake', reopened.id, revision);
    assert.equal(noticesOf(reopened, 'closed').length, 2);
  });

  await test('a regional manager closing a request still queues the notices, and stays out of the Central', async () => {
    const asker = person(), row = await guest(tokenA, asker.consent);
    await asRegional(async () => {
      const op = await access.getOperator();
      assert.equal(region.isRegionalRequest(), true);
      await guestManage.triageGuestRequest(op, guestAction(row, 'close'));
    });
    assert.deepEqual(noticesOf(row, 'closed').map(notice => [notice.target, notice.chat_id, notice.requester_jid]), [['group', groupA.id, null], ['requester', null, asker.jid]]);
    await asRegional(async () => {
      for (const view of ['overview', 'targets', 'outbox']) assert.equal((await route.GET(new Request(ORIGIN + '/api/whatsapp?view=' + view, {headers: {origin: ORIGIN}}))).status, 403);
      const response = await route.POST(new Request(ORIGIN + '/api/whatsapp', {method: 'POST', headers: {origin: ORIGIN, 'content-type': 'application/json'}, body: JSON.stringify({action: 'group_role', chat_id: general.id, role: 'requests', enabled: false, expected_revision: chat(general.id).revision})}));
      assert.equal(response.status, 403);
    });
    assert.equal(chat(general.id).requests_default, 1);
  });

  await test('no requester notice carries anything typed in a form; no notice carries who asked', () => {
    const notices = all("SELECT target,body FROM request_notices WHERE body<>''");
    assert.ok(notices.filter(notice => notice.target === 'requester').length >= 10 && notices.filter(notice => notice.target === 'group').length >= 10);
    for (const notice of notices) {
      without(notice.body, IDENTITY);
      assert.ok(!/https?:|www\./.test(notice.body));
      if (notice.target === 'requester') without(notice.body, [...FORM_TEXT, 'informad', 'Local']);
    }
  });

  await test('outbox_claim delivers notices in the contract format, sharing the limit with panel sends', async () => {
    drainQueue();
    const totals = async () => (await panel('GET', '')).data.totals, totalsBefore = await totals();
    const asker = person(), row = await intake('maintenance', asker.consent);
    const [group, requester] = noticesOf(row);
    // The send totals of the overview count the notices too, so a stuck or failed one is seen there.
    assert.equal((await totals()).queued_outbox, totalsBefore.queued_outbox + 2);
    const sent = await panel('POST', '', {action: 'send', chat_id: groupA.id, body: 'Técnico chega às 14h.', request_id: randomUUID()});
    assert.equal(sent.status, 201);
    // Oldest first across both queues: the panel send, then the group notice, then the requester's.
    const ago = seconds => new Date(Date.now() - seconds * 1000).toISOString();
    run('UPDATE whatsapp_outbox SET created_at=? WHERE id=?', ago(30), sent.data.id);
    run('UPDATE request_notices SET created_at=? WHERE id=?', ago(20), group.id);
    run('UPDATE request_notices SET created_at=? WHERE id=?', ago(10), requester.id);
    const messagesBefore = get('SELECT count(*) n FROM whatsapp_messages').n;

    assert.equal((await panel('POST', '', {action: 'outbox_claim'})).status, 403);
    assert.equal((await n8n(read, 'POST', '', {action: 'outbox_claim'})).status, 403);
    // The item format is the one the n8n flow already reads: id, body and chat_jid, nothing else.
    assert.deepEqual(await claim(write, 2), [{id: sent.data.id, body: 'Técnico chega às 14h.', chat_jid: GROUP_A}, {id: group.id, body: group.body, chat_jid: GENERAL}]);
    assert.deepEqual(await claim(write, 2), [{id: requester.id, body: requester.body, chat_jid: asker.jid}]);
    assert.deepEqual(await claim(write), []);
    assert.deepEqual(noticesOf(row).map(notice => [notice.status, !!notice.claimed_at]), [['sending', true], ['sending', true]]);

    const delivered = await n8n(write, 'POST', '', {action: 'outbox_result', id: group.id, ok: true, wa_message_id: 'true_120363000000000010@g.us_NOTICE1'});
    assert.deepEqual([delivered.status, delivered.data], [200, {id: group.id, status: 'sent'}]);
    const stored = get('SELECT status,sent_at,wa_message_id,error FROM request_notices WHERE id=?', group.id);
    assert.deepEqual([stored.status, stored.wa_message_id, stored.error, !!stored.sent_at], ['sent', 'true_120363000000000010@g.us_NOTICE1', null, true]);
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: group.id, ok: true})).status, 409);
    // A failure is recorded with the n8n's reason, minus any phone number in it.
    const failed = await n8n(write, 'POST', '', {action: 'outbox_result', id: requester.id, ok: false, error: `Chat ${asker.jid} not found`});
    assert.deepEqual(failed.data, {id: requester.id, status: 'failed'});
    assert.deepEqual({...get('SELECT status,error FROM request_notices WHERE id=?', requester.id)}, {status: 'failed', error: `Chat ••••${asker.jid.slice(9, 13)}@c.us not found`});
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: requester.id, ok: true})).status, 409);
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: randomUUID(), ok: true})).status, 409);
    assert.equal((await panel('POST', '', {action: 'outbox_result', id: group.id, ok: true})).status, 403);
    // The panel send still settles as before. The notice went to a group that is not followed, so
    // its text is not kept in a history: the Central stores no message text of such groups.
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: sent.data.id, ok: true})).data.status, 'sent');
    assert.equal(get('SELECT count(*) n FROM whatsapp_messages').n, messagesBefore + 1);
    assert.equal(get("SELECT count(*) n FROM request_notices WHERE status IN ('queued','sending')").n, 0);
    const totalsAfter = await totals();
    assert.deepEqual([totalsAfter.queued_outbox, totalsAfter.failed_outbox], [totalsBefore.queued_outbox, totalsBefore.failed_outbox + 1]);

    // A notice delivered to a followed group enters that group's history, like a send written in the panel.
    const stay = await guest(tokenA);
    const [followed] = noticesOf(stay);
    assert.deepEqual([noticesOf(stay).length, followed.chat_id, chat(groupA.id).monitored], [1, groupA.id, 1]);
    assert.deepEqual(await claim(write), [{id: followed.id, body: followed.body, chat_jid: GROUP_A}]);
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: followed.id, ok: true, wa_message_id: 'true_120363000000000011@g.us_NOTICE2'})).data.status, 'sent');
    const history = get("SELECT chat_id,direction,sender_name,kind,body,analyzed_at FROM whatsapp_messages WHERE wa_message_id='true_120363000000000011@g.us_NOTICE2'");
    assert.deepEqual([history.chat_id, history.direction, history.sender_name, history.kind, history.body, !!history.analyzed_at], [groupA.id, 'out', 'Aviso de solicitação', 'text', followed.body, true]);
    assert.equal(get('SELECT count(*) n FROM whatsapp_messages').n, messagesBefore + 2);
    assert.ok(chat(groupA.id).last_message_at >= get('SELECT sent_at FROM request_notices WHERE id=?', followed.id).sent_at);
    assert.ok((await panel('GET', 'view=chat&id=' + groupA.id)).data.messages.some(message => message.sender_name === 'Aviso de solicitação' && message.body === followed.body));
  });

  await test('a request sent under the earlier privacy text never produces a notice, not even when closed later', async () => {
    // The texts in use cover the notices; a future version of a text has to be listed on purpose.
    assert.equal(model.noticesDisclosed('intake', {privacy_version: intakeModel.INTAKE_PRIVACY_VERSION}), true);
    assert.equal(model.noticesDisclosed('guest', {privacy_version: guestModel.GUEST_PRIVACY_VERSION}), true);
    for (const [source, version] of [['intake', 'general-requests-v1'], ['guest', 'identified-v1'], ['intake', guestModel.GUEST_PRIVACY_VERSION], ['guest', undefined]]) {
      assert.equal(model.noticesDisclosed(source, {privacy_version: version}), false);
    }
    // A request stored before the notices existed: its form said the content stays with management.
    // The stored payload even carries a number and the consent, to show the text is what decides.
    const id = randomUUID(), eventId = randomUUID(), protocol = 'MAN-' + randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
    const received = new Date(Date.now() - 86_400_000).toISOString(), fingerprint = 'a'.repeat(64);
    const stored = {...intakeValues('maintenance'), whatsapp: NUMBER, whatsapp_consent: true, privacy_version: 'general-requests-v1'};
    run("INSERT INTO request_intakes(id,owner_id,kind,protocol,values_json,received_at,status,revision,last_event_id,request_id,request_fingerprint) VALUES(?,?,'maintenance',?,?,?,'received',1,?,?,?)",
      id, OWNER, protocol, JSON.stringify(stored), received, eventId, randomUUID(), fingerprint);
    run("INSERT INTO request_intake_events(id,owner_id,intake_id,revision,state_code,action,before_status,after_status,note,actor_user_id,actor_name,request_id,request_fingerprint,created_at) VALUES(?,?,?,1,NULL,'received',NULL,'received','',NULL,'Identificação declarada pelo solicitante',?,?,?)",
      eventId, OWNER, id, 'public:' + id, fingerprint, received);
    const before = noticeCount(), legacy = {id, protocol};
    await runtime.requestNotices.queueReceived(OWNER, 'intake', protocol);
    await intakeManage.triageIntake(ownerOp, intakeAction(legacy, 'close'));
    assert.equal(get('SELECT status FROM request_intakes WHERE id=?', id).status, 'closed');
    assert.deepEqual([noticesOf(legacy).length, noticeCount()], [0, before]);
    // The same close on a request sent under the current text does notify the general group.
    const current = await intake('maintenance');
    await intakeManage.triageIntake(ownerOp, intakeAction(current, 'close'));
    assert.deepEqual(noticesOf(current).map(notice => [notice.event, notice.target, notice.chat_id].join(' ')).sort(), ['closed group ' + general.id, 'received group ' + general.id]);
  });

  await test('limits hold when two requests arrive at the same moment', async () => {
    drainQueue();
    const asker = person(), limit = model.NOTICE_NUMBER_DAILY_LIMIT;
    // The number already got one notice less than the daily limit allows.
    for (let sent = 0; sent < limit - 1; sent++) seedNotice({requester_jid: asker.jid});
    // Two requests saved while the queue was out, then notified together, as two simultaneous posts of the public form would be.
    const {result: [one, two]} = await withBrokenNotices(async () => [await intake('maintenance', asker.consent), await intake('maintenance', asker.consent)]);
    assert.equal(noticesOf(one).length + noticesOf(two).length, 0);
    await Promise.all([one, two].map(row => runtime.requestNotices.queueReceived(OWNER, 'intake', row.protocol)));
    // Only one of the two fits: the count is made by the statement that inserts, not read beforehand.
    assert.equal(get("SELECT count(*) n FROM request_notices WHERE target='requester' AND requester_jid=? AND status<>'cancelled'", asker.jid).n, limit);
    const toRequester = [...noticesOf(one), ...noticesOf(two)].filter(notice => notice.target === 'requester');
    assert.deepEqual(toRequester.map(notice => notice.status).sort(), ['cancelled', 'queued']);
    const blocked = toRequester.find(notice => notice.status === 'cancelled');
    assert.deepEqual([blocked.requester_jid, blocked.body, /limite diário/.test(blocked.error), !!blocked.purged_at], [null, '', true, true]);
    // Each request still has its own group notice: the number's limit does not touch them.
    assert.equal([...noticesOf(one), ...noticesOf(two)].filter(notice => notice.target === 'group').length, 2);
    clearSeeds();
    drainQueue();
  });

  await test('unconfirmed notices fail after the timeout; late and orphaned notices are never delivered', async () => {
    const row = await intake('maintenance', person().consent);
    const [group, requester] = noticesOf(row);
    assert.equal((await claim(write)).length, 2);
    // Claimed 11 minutes ago and never confirmed: failed, and not handed out again.
    run('UPDATE request_notices SET claimed_at=? WHERE id=?', new Date(Date.now() - 11 * 60000).toISOString(), group.id);
    assert.deepEqual(await claim(write), []);
    const expired = get('SELECT status,error FROM request_notices WHERE id=?', group.id);
    assert.equal(expired.status, 'failed');
    assert.match(expired.error, /não confirmado/);
    assert.equal(get('SELECT status FROM request_notices WHERE id=?', requester.id).status, 'sending');
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: group.id, ok: true})).status, 409);
    assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: requester.id, ok: true})).data.status, 'sent');

    // Queued for more than a day (the n8n was off): cancelled instead of arriving out of time.
    const late = await intake('maintenance', person().consent);
    run('UPDATE request_notices SET created_at=? WHERE source_id=?', new Date(Date.now() - (model.NOTICE_MAX_AGE_HOURS + 1) * 3600000).toISOString(), late.id);
    assert.deepEqual(await claim(write), []);
    assert.deepEqual(noticesOf(late).map(notice => notice.status), ['cancelled', 'cancelled']);
    assert.match(noticesOf(late)[0].error, /24 horas/);

    // The group is checked when the notice is claimed: one for a group that is gone is not delivered.
    assert.equal((await setRole(spare, 'requests', true)).status, 200);
    const orphan = await intake();
    assert.deepEqual(noticesOf(orphan).map(notice => notice.chat_id), [spare.id]);
    sqlite.exec('PRAGMA foreign_keys=OFF');
    run('DELETE FROM whatsapp_chats WHERE id=?', spare.id);
    sqlite.exec('PRAGMA foreign_keys=ON');
    assert.deepEqual(await claim(write), []);
    const gone = noticesOf(orphan)[0];
    assert.equal(gone.status, 'failed');
    assert.match(gone.error, /não existe mais/);
    assert.equal((await panel('GET', 'view=outbox')).data.notices.find(notice => notice.id === gone.id).chat_name, null);
    assert.equal((await setRole(general, 'requests', true)).status, 200);
  });

  await test('limits record a notice as cancelled, with nothing personal in it, instead of queueing it', async () => {
    const now = new Date().toISOString();
    const outcome = row => noticesOf(row).map(notice => [notice.target, notice.status, notice.body === '', notice.requester_jid, !!notice.purged_at]);
    assert.deepEqual([model.NOTICE_GROUP_HOURLY_LIMIT, model.NOTICE_NUMBER_DAILY_LIMIT, model.NOTICE_REQUESTER_HOURLY_LIMIT, model.NOTICE_QUEUE_LIMIT], [30, 6, 60, 200]);
    // Start from an empty day: nothing waiting and nothing recent.
    drainQueue();
    run("UPDATE request_notices SET created_at=? WHERE status<>'cancelled'", new Date(Date.now() - 3 * 86400000).toISOString());

    // One notice short of each limit, everything still goes out.
    for (let index = 0; index < model.NOTICE_GROUP_HOURLY_LIMIT - 1; index++) seedNotice({target: 'group', chat_id: general.id, created_at: now});
    for (let index = 0; index < model.NOTICE_NUMBER_DAILY_LIMIT - 1; index++) seedNotice({requester_jid: JID, created_at: new Date(Date.now() - 20 * 3600000).toISOString()});
    const allowed = await intake('maintenance', CONSENTED);
    assert.deepEqual(outcome(allowed), [['group', 'queued', false, null, false], ['requester', 'queued', false, JID, false]]);
    // Now the group's hour and the number's day are both full.
    const blocked = await intake('maintenance', CONSENTED);
    assert.deepEqual(outcome(blocked), [['group', 'cancelled', true, null, true], ['requester', 'cancelled', true, null, true]]);
    assert.match(noticesOf(blocked)[0].error, /limite de avisos por hora deste grupo/);
    assert.match(noticesOf(blocked)[1].error, /limite diário de avisos para este número/);
    // Another number is not affected by the first number's limit.
    const other = person(), neighbour = await intake('maintenance', other.consent);
    assert.deepEqual(outcome(neighbour)[1], ['requester', 'queued', false, other.jid, false]);
    // A cancelled notice is final: nothing delivers it. The request itself was saved normally.
    const delivered = (await claim(write)).map(item => item.id);
    assert.ok(delivered.length >= 3 && noticesOf(blocked).every(notice => !delivered.includes(notice.id)));
    assert.equal(blocked.status, 'received');
    clearSeeds();
    drainQueue();

    // All requesters together, per hour.
    for (let index = 0; index < model.NOTICE_REQUESTER_HOURLY_LIMIT; index++) seedNotice({requester_jid: `55919${10000000 + index}@c.us`, created_at: now});
    const crowded = await intake('maintenance', person().consent);
    assert.deepEqual(outcome(crowded), [['group', 'queued', false, null, false], ['requester', 'cancelled', true, null, true]]);
    assert.match(noticesOf(crowded)[1].error, /solicitantes por hora/);
    clearSeeds();
    drainQueue();

    // Too many notices waiting for the n8n: new ones are not piled on top.
    for (let index = 0; index < model.NOTICE_QUEUE_LIMIT; index++) seedNotice({requester_jid: `55919${20000000 + index}@c.us`, status: 'queued', created_at: new Date(Date.now() - 2 * 3600000).toISOString()});
    const piled = await intake('maintenance', person().consent);
    assert.deepEqual(outcome(piled), [['group', 'cancelled', true, null, true], ['requester', 'cancelled', true, null, true]]);
    assert.match(noticesOf(piled)[0].error, /avisos demais aguardando/);
    clearSeeds();
    drainQueue();
  });

  await test('retention erases the text and the number of old finished notices, and hides them before that', async () => {
    // An empty table, so the notices aged below still fit in the 50 the list shows.
    run('DELETE FROM request_notices');
    const row = await intake('maintenance', CONSENTED), waiting = await intake('maintenance', person().consent);
    const [group, requester] = noticesOf(row);
    // The WAHA's message id carries the chat id of whoever received it, so it is personal data too.
    for (const item of await claim(write)) if ([group.id, requester.id].includes(item.id)) assert.equal((await n8n(write, 'POST', '', {action: 'outbox_result', id: item.id, ok: true, wa_message_id: `true_${item.chat_jid}_3EB0QA`})).data.status, 'sent');
    assert.equal(get('SELECT wa_message_id FROM request_notices WHERE id=?', requester.id).wa_message_id, `true_${JID}_3EB0QA`);
    const fresh = (await panel('GET', 'view=outbox')).data.notices.find(notice => notice.id === requester.id);
    assert.deepEqual([fresh.requester, fresh.purged_at, fresh.status], [MASKED, null, 'sent']);

    const old = new Date(Date.now() - (whatsapp.WHATSAPP_RETENTION_DAYS + 3) * 86400000).toISOString();
    run('UPDATE request_notices SET created_at=? WHERE source_id IN (?,?)', old, row.id, waiting.id);
    // Before any cleanup has run, the list already hides the number of an expired notice.
    const hidden = (await panel('GET', 'view=outbox')).data.notices.find(notice => notice.id === requester.id);
    assert.deepEqual([hidden.requester, !!hidden.purged_at], [null, true]);
    assert.equal(get('SELECT requester_jid FROM request_notices WHERE id=?', requester.id).requester_jid, JID);
    // The hourly group sync cleans the table without needing a new message or a claim.
    assert.equal((await n8n(write, 'POST', '', {action: 'sync_chats', chats: [{jid: GENERAL, name: 'Solicitações gerais'}]})).status, 200);
    assert.deepEqual(noticesOf(row).map(notice => [notice.body, notice.requester_jid, notice.wa_message_id, notice.status, !!notice.purged_at, notice.protocol]), [['', null, null, 'sent', true, row.protocol], ['', null, null, 'sent', true, row.protocol]]);
    assert.ok(!JSON.stringify(all('SELECT * FROM request_notices WHERE source_id=?', row.id)).includes('988887777'));
    // A notice still with the n8n keeps what it needs; once it is cancelled for being late, it is erased too.
    assert.deepEqual(noticesOf(waiting).map(notice => [notice.status, notice.body !== '', notice.purged_at]), [['sending', true, null], ['sending', true, null]]);
    run("UPDATE request_notices SET status='queued',claimed_at=NULL WHERE source_id=?", waiting.id);
    assert.deepEqual(await claim(write), []);
    assert.deepEqual(noticesOf(waiting).map(notice => [notice.status, notice.body, notice.requester_jid, !!notice.purged_at]), [['cancelled', '', null, true], ['cancelled', '', null, true]]);
  });

  await test('the Central lists notices read-only and masked; request screens never get the full number', async () => {
    const row = await intake('maintenance', CONSENTED), stay = await guest(tokenA, CONSENTED);
    for (const result of [await panel('GET', 'view=outbox'), await panel('GET', 'view=outbox', null, manager), await n8n(read, 'GET', 'view=outbox')]) {
      assert.equal(result.status, 200);
      assert.ok(Array.isArray(result.data.items));
      assert.ok(result.data.notices.length > 0 && result.data.notices.length <= 50);
      const listed = result.data.notices.filter(notice => notice.source_id === row.id);
      assert.deepEqual(listed.map(notice => [notice.protocol, notice.source, notice.event, notice.target, notice.chat_name, notice.requester, notice.status, notice.error, notice.sent_at]).sort(),
        [[row.protocol, 'intake', 'received', 'group', 'Solicitações gerais', null, 'queued', null, null], [row.protocol, 'intake', 'received', 'requester', null, MASKED, 'queued', null, null]]);
      // No message text and no chat id of a person: only the masked number leaves the queue.
      for (const notice of result.data.notices) {
        assert.deepEqual(Object.keys(notice).sort(), ['chat_name', 'created_at', 'error', 'event', 'id', 'protocol', 'purged_at', 'requester', 'sent_at', 'source', 'source_id', 'status', 'target']);
        assert.ok(notice.requester === null || /^\(••\) •{4,5}-\d{4}$/.test(notice.requester));
      }
      const raw = JSON.stringify(result.data.notices);
      for (const secret of [NUMBER, '988887777', 'Marcador', 'Nova solicitação', 'MOBILIZA FACILITIES']) assert.ok(!raw.includes(secret), secret);
    }
    // There is no action on a notice: the only way out of the queue is the n8n contract.
    assert.equal((await panel('POST', '', {action: 'cancel_send', id: noticesOf(row)[0].id})).status, 409);
    assert.deepEqual(noticesOf(row).map(notice => notice.status), ['queued', 'queued']);

    // Request screens and the integration API show the number masked, like the Central.
    const detail = await intakeManage.intakeDetail(ownerOp, row.id);
    assert.deepEqual([detail.request.values.whatsapp, detail.request.values.whatsapp_consent, detail.request.values.contact], [MASKED, true, CONTACT]);
    const guestDetail = await guestManage.guestRequestDetail(ownerOp, stay.id);
    assert.equal(guestDetail.request.whatsapp, MASKED);
    const lists = [await intakeManage.intakeList(ownerOp, new URLSearchParams()), await guestManage.guestRequestList(ownerOp, new URLSearchParams())];
    for (const payload of [detail, guestDetail, ...lists]) assert.ok(!JSON.stringify(payload).includes('988887777'));
    // The original request is stored as it was sent and stays immutable.
    assert.equal(JSON.parse(get('SELECT values_json FROM request_intakes WHERE id=?', row.id).values_json).whatsapp, NUMBER);
    assert.throws(() => run('UPDATE request_intakes SET values_json=? WHERE id=?', '{}', row.id), /immutable/);
  });

  console.log(JSON.stringify({passed: report.filter(item => item[1]).length, total: report.length}));
  sqlite.close();
  if (report.some(item => !item[1])) process.exitCode = 1;
})();
