// All rows and object bytes below are synthetic and exist only in memory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {stripTypeScriptTypes} = require('node:module');
const {DatabaseSync} = require('node:sqlite');
const {randomUUID} = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const OWNER = 'synthetic-owner';
const sql = new DatabaseSync(':memory:');
sql.exec(`
  CREATE TABLE clients(id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, archived_at TEXT);
  CREATE TABLE cost_centers(id TEXT PRIMARY KEY, owner_id TEXT, client_id TEXT, name TEXT, archived_at TEXT);
  CREATE TABLE person_profiles(id TEXT PRIMARY KEY, owner_id TEXT, display_name TEXT, directory TEXT,
    status TEXT, name_pending INTEGER, city TEXT, state_code TEXT, client_id TEXT, cost_center_id TEXT,
    current_photo_asset_id TEXT, private_cpf TEXT, private_contact TEXT, job_title TEXT, app_member_user_id TEXT);
  CREATE TABLE person_photo_assets(id TEXT PRIMARY KEY, owner_id TEXT, profile_id TEXT, object_key TEXT,
    content_type TEXT, size INTEGER);
`);
const queryLog = [], objects = new Map(), approvedIds = [];
let bucketReads = 0;
let afterGet = null, failDb = false;
const d1 = {prepare(statement) {
  assert.match(statement.trim(), /^SELECT\s/i, 'Public handlers may only read');
  queryLog.push(statement);
  const query = {bind(...args) {return {
    async all() {if (failDb) throw Error('synthetic database failure'); return {results: sql.prepare(statement).all(...args)};},
    async first() {if (failDb) throw Error('synthetic database failure'); return sql.prepare(statement).get(...args) || null;},
  };}};
  return query;
}};
const bucket = {async get(key) {
  bucketReads++;
  const bytes = objects.get(key);
  if (afterGet) {const callback = afterGet; afterGet = null; callback();}
  return bytes ? {size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer} : null;
}};
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (file === path.join(root, 'lib', 'maintenance.ts')) return {db: () => d1, bucket: () => bucket, noCache: {'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff'}};
  if (file === path.join(root, 'lib', 'owner-access.ts')) return {SITE_OWNER_ID: OWNER};
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cache.has(file)) return cache.get(file).exports;
  const module = {exports: {}};
  cache.set(file, module);
  const stripped = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), {mode: 'transform'});
  const exported = [...stripped.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([\w$]+)/gm)].map(match => match[1]);
  const js = stripped
    .replace(/import\s+\{([^}]+)\}\s+from\s+(['"][^'"]+['"]);?/g, 'const {$1} = require($2);')
    .replace(/import\s+(\w+)\s+from\s+(['"][^'"]+['"]);?/g, 'const $1 = require($2);')
    .replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)/gm, '')
    + '\nObject.assign(module.exports, {' + exported.join(',') + '});';
  const req = id => {
    if (id.startsWith('.')) {const target = path.resolve(path.dirname(file), id); return load(target + (path.extname(target) ? '' : '.ts'));}
    return require(id);
  };
  new Function('require', 'module', 'exports', js)(req, module, module.exports);
  return module.exports;
}
const policy = load('lib/request-directory-policy.ts');
const realRequesterScope = policy.requesterScope;
assert.deepEqual(realRequesterScope(), {ids: [], sql: '0'}, 'The public export must deny unconfigured requester identities');
assert.deepEqual(realRequesterScope([]), {ids: [], sql: '0'}, 'An empty approval list must still fail closed');
policy.requesterScope = () => realRequesterScope(approvedIds);
const directory = load('app/api/request-directory/route.ts');
const photo = load('app/api/request-directory/photos/[id]/route.ts');
const model = load('lib/request-directory-model.ts');
const insert = (table, values) => {const keys = Object.keys(values); sql.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(values));};
const profile = (extra = {}) => {const value = {id: randomUUID(), owner_id: OWNER, display_name: 'Colaborador sintético', directory: 'collaborator', status: 'active', name_pending: 0, city: 'Parauapebas', state_code: 'PA', client_id: null, cost_center_id: null, current_photo_asset_id: null, private_cpf: 'PRIVATE_DOCUMENT_QA', private_contact: 'PRIVATE_PHONE_QA', job_title: 'PRIVATE_JOB_QA', app_member_user_id: 'PRIVATE_ACCOUNT_QA', ...extra}; insert('person_profiles', value); approvedIds.push(value.id); return value;};
const getPhoto = id => photo.GET(new Request('https://panel.example/api/request-directory/photos/' + id), {params: Promise.resolve({id})});
function crc(bytes) {let value = 0xffffffff; for (const byte of bytes) {value ^= byte; for (let n = 0; n < 8; n++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;} return (value ^ 0xffffffff) >>> 0;}
function chunk(name, bytes) {const type = Buffer.from(name), output = Buffer.alloc(bytes.length + 12); output.writeUInt32BE(bytes.length); type.copy(output, 4); bytes.copy(output, 8); output.writeUInt32BE(crc(Buffer.concat([type, bytes])), bytes.length + 8); return output;}
function image() {const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6; return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('tEXt', Buffer.from('Comment\0PRIVATE_METADATA_QA')), chunk('IDAT', zlib.deflateSync(Buffer.from([0,255,128,0,255]))), chunk('IEND', Buffer.alloc(0))]);}
function addPhoto(person, extra = {}) {const row = {id: randomUUID(), owner_id: OWNER, profile_id: person.id, object_key: 'private-photo/' + randomUUID(), content_type: 'image/png', size: image().length, ...extra}; insert('person_photo_assets', row); objects.set(row.object_key, image()); sql.prepare('UPDATE person_profiles SET current_photo_asset_id=? WHERE id=?').run(row.id, person.id); return row;}
const clientA = randomUUID(), clientB = randomUUID(), archivedClient = randomUUID(), foreignClient = randomUUID();
for (const [id, owner, archived, name] of [[clientA,OWNER,null,'Cliente A'],[clientB,OWNER,null,'Cliente B'],[archivedClient,OWNER,'2026-01-01','Arquivado'],[foreignClient,'other-owner',null,'Outro proprietário']]) insert('clients', {id, owner_id: owner, name, archived_at: archived});
const GEO003 = '55555555-5555-4555-8555-555555555555', GEO004 = '66666666-6666-4666-8666-666666666666';
for (const [id, client, archived, name, owner] of [[GEO003,clientA,null,'GEO003 - Nome anterior',OWNER],[GEO004,clientB,null,'GEO004 - Curionópolis',OWNER],[randomUUID(),clientA,'2026-01-01','Centro arquivado',OWNER],[randomUUID(),archivedClient,null,'Cliente arquivado',OWNER],[randomUUID(),foreignClient,null,'Outro proprietário',OWNER]]) insert('cost_centers', {id, owner_id: owner, client_id: client, name, archived_at: archived});
const visible = profile({client_id: clientA, cost_center_id: GEO003});
const asset = addPhoto(visible);
const mismatch = profile({display_name: 'Relação divergente', client_id: clientB, cost_center_id: GEO003, city: null});
const retiredRelation = profile({display_name: 'Relação arquivada', client_id: archivedClient, state_code: 'XX'});
const hidden = [profile({directory: 'guest'}), profile({directory: 'provider'}), profile({status: 'inactive'}), profile({owner_id: 'other-owner'}), profile({name_pending: 1}), profile({display_name: '  '})];
for (const person of hidden) addPhoto(person, {owner_id: person.owner_id});
const tests = [];
async function check(name, action) {try {await action(); tests.push({name, pass: true}); console.log('PASS', name);} catch (error) {tests.push({name, pass: false}); console.error('FAIL', name, error.stack);}}
(async () => {
  await check('public directory is minimal, owner scoped and excludes inactive, guest and pending identities', async () => {
    const response = await directory.GET(); assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const value = await response.json(); assert.deepEqual(Object.keys(value), ['people','clients','costCenters','cities']);
    assert.deepEqual(new Set(value.people.map(row => row.id)), new Set([visible.id, mismatch.id, retiredRelation.id]));
    for (const person of value.people) assert.deepEqual(Object.keys(person), ['id','name','photoUrl','city','clientId','costCenterId']);
    for (const client of value.clients) assert.deepEqual(Object.keys(client), ['id','name']);
    for (const center of value.costCenters) assert.deepEqual(Object.keys(center), ['id','name','clientId']);
    assert.equal(value.clients.length, 2); assert.equal(value.costCenters.length, 2);
    assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|object_key|current_photo_asset_id|owner_id|synthetic-owner|private-photo/);
  });
  await check('only compatible active relationships and explicit profile cities are projected', async () => {
    const value = await (await directory.GET()).json();
    const a = value.people.find(row => row.id === visible.id), b = value.people.find(row => row.id === mismatch.id), c = value.people.find(row => row.id === retiredRelation.id);
    assert.equal(a.clientId, clientA); assert.equal(a.costCenterId, GEO003); assert.equal(a.city, 'Parauapebas - PA');
    assert.equal(b.clientId, clientB); assert.equal(b.costCenterId, null); assert.equal(b.city, null);
    assert.equal(c.clientId, null); assert.equal(c.city, null);
    assert.ok(value.cities.some(row => row.name === 'Curionópolis - PA'));
    assert.ok(value.cities.length > 5000);
    const custom = model.projectRequestDirectory([{...visible, city: 'Localidade sintética', has_photo: 0}], [], [], []);
    assert.equal(custom.cities[0].name, 'Localidade sintética - PA');
  });
  await check('uppercase profile city uses the matching IBGE spelling and remains selectable', async () => {
    const uppercase = profile({display_name: 'Cidade em maiúsculas QA', city: 'MARIANA', state_code: 'MG'});
    const value = await (await directory.GET()).json();
    const person = value.people.find(row => row.id === uppercase.id);
    assert.equal(person.city, 'Mariana - MG');
    assert.ok(new Set(value.cities.map(row => row.name)).has(person.city));
    assert.equal(value.cities.filter(row => row.name.toLocaleLowerCase('pt-BR') === 'mariana - mg').length, 1);
    const custom = model.projectRequestDirectory([{...uppercase, city: 'LOCALIDADE LIVRE QA', has_photo: 0}], [], [], value.cities);
    assert.equal(custom.people[0].city, 'LOCALIDADE LIVRE QA - MG');
    assert.ok(custom.cities.some(row => row.name === custom.people[0].city));
  });
  await check('GEO003 label changes without mutating catalog or GEO004 links', async () => {
    const value = await (await directory.GET()).json();
    assert.deepEqual(value.costCenters.find(row => row.id === GEO003), {id: GEO003, name: 'GEO003 - Vila Paulo Fonteles', clientId: clientA});
    assert.deepEqual(value.costCenters.find(row => row.id === GEO004), {id: GEO004, name: 'GEO004 - Curionópolis', clientId: clientB});
    assert.equal(sql.prepare('SELECT name FROM cost_centers WHERE id=?').get(GEO003).name, 'GEO003 - Nome anterior');
  });
  await check('current authorized photo strips metadata and has private no-store response headers', async () => {
    const response = await getPhoto(visible.id); assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('cache-control'), /private.*no-store/); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.doesNotMatch(Buffer.from(await response.arrayBuffer()).toString(), /PRIVATE_METADATA_QA/);
  });
  await check('photo lookup rejects asset IDs, hidden profiles and invalid IDs', async () => {
    assert.equal((await getPhoto(asset.id)).status, 404);
    assert.equal((await getPhoto('../request-intake-files/anything')).status, 404);
    for (const person of hidden) assert.equal((await getPhoto(person.id)).status, 404);
  });
  await check('cross-profile, cross-owner, unsupported MIME and malformed bytes never serve', async () => {
    for (const extra of [{profile_id: randomUUID()}, {owner_id: 'other-owner'}, {content_type: 'image/svg+xml'}, {content_type: 'image/webp'}]) {
      const person = profile(); addPhoto(person, extra); assert.equal((await getPhoto(person.id)).status, 404);
      const value = await (await directory.GET()).json(); assert.equal(value.people.find(row => row.id === person.id).photoUrl, null);
    }
    const malformed = profile(), bad = addPhoto(malformed); objects.set(bad.object_key, Buffer.from('not PNG'));
    assert.equal((await getPhoto(malformed.id)).status, 404);
    const invalidName = profile({display_name: '123456789'}); addPhoto(invalidName); assert.equal((await getPhoto(invalidName.id)).status, 404);
  });
  await check('deactivation and replacement while reading prevent old photo disclosure', async () => {
    const person = profile(), old = addPhoto(person);
    afterGet = () => sql.prepare("UPDATE person_profiles SET status='inactive' WHERE id=?").run(person.id);
    assert.equal((await getPhoto(person.id)).status, 404);
    sql.prepare("UPDATE person_profiles SET status='active' WHERE id=?").run(person.id);
    afterGet = () => addPhoto(person);
    assert.equal((await getPhoto(person.id)).status, 404);
    assert.equal((await getPhoto(old.id)).status, 404);
    assert.equal((await getPhoto(person.id)).status, 200);
  });
  await check('unapproved maintenance and excluded roles expose neither names nor direct photos', async () => {
    const maintenance = profile({display_name: 'Manutenção não aprovada QA', job_title: 'MANUTENÇÃO'});
    const excluded = profile({display_name: 'Cargo fora do escopo QA', job_title: 'ZELADOR'});
    addPhoto(maintenance); addPhoto(excluded);
    for (const person of [maintenance, excluded]) approvedIds.splice(approvedIds.indexOf(person.id), 1);
    const value = await (await directory.GET()).json();
    for (const person of [maintenance, excluded]) assert.ok(!value.people.some(row => row.id === person.id));
    const reads = bucketReads;
    for (const person of [maintenance, excluded]) assert.equal((await getPhoto(person.id)).status, 404);
    assert.equal(bucketReads, reads, 'Unapproved IDs must be rejected before bucket access');
  });
  await check('empty approval list hides all people and photos while preserving public catalogs', async () => {
    const saved = approvedIds.splice(0);
    try {
      const value = await (await directory.GET()).json();
      assert.deepEqual(value.people, []); assert.equal(value.clients.length, 2); assert.equal(value.costCenters.length, 2); assert.ok(value.cities.length > 5000);
      const reads = bucketReads;
      assert.equal((await getPhoto(visible.id)).status, 404);
      assert.equal(bucketReads, reads);
    } finally { approvedIds.push(...saved); }
  });
  await check('database failure returns generic 503 and all public statements remain reads', async () => {
    failDb = true;
    const response = await directory.GET(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /synthetic database failure/);
    assert.equal((await getPhoto(visible.id)).status, 503); failDb = false;
    assert.ok(queryLog.every(statement => /^SELECT\s/i.test(statement.trim())));
    assert.ok(queryLog.every(statement => !/private_cpf|private_contact|job_title|app_member_user_id|request_intake_files/.test(statement)));
  });
  console.log(`${tests.filter(test => test.pass).length}/${tests.length} request-directory checks passed`);
  if (tests.some(test => !test.pass)) process.exitCode = 1;
  sql.close();
})();