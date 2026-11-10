const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sqlite = new DatabaseSync(':memory:');
const { entries } = require('../drizzle/meta/_journal.json');
for (const { tag } of entries) {
  sqlite.exec(fs.readFileSync(path.join(root, 'drizzle', tag + '.sql'), 'utf8'));
}

let beforeBatch;
let dropCommitResponse = false;
class Statement {
  constructor(sql, args = []) {
    this.sql = sql;
    this.args = args;
  }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return sqlite.prepare(this.sql).get(...this.args) ?? null; }
}
const d1 = {
  prepare: sql => new Statement(sql),
  async batch(statements) {
    const hook = beforeBatch;
    beforeBatch = undefined;
    await hook?.();
    sqlite.exec('BEGIN IMMEDIATE');
    let results;
    try {
      results = statements.map(({ sql, args }) => ({ meta: sqlite.prepare(sql).run(...args) }));
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
    if (dropCommitResponse) {
      dropCommitResponse = false;
      throw new Error('Response lost after commit');
    }
    return results;
  },
};

const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  function resolve(id) {
    if (id === 'cloudflare:workers') return { env: { DB: d1 } };
    if (id.endsWith('app/chatgpt-auth')) return {};
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
    return require(id);
  }
  new Function('require', 'module', 'exports', outputText)(resolve, module, module.exports);
  return module.exports;
}

const { saveMaintenance } = load(path.join(root, 'lib', 'maintenance-record.ts'));
const { saveCleaning } = load(path.join(root, 'lib', 'cleaning-record.ts'));
const { serviceSubmissionFingerprint } = load(path.join(root, 'lib', 'service-submission.ts'));
const ownerId = 'owner-qa';
const equipmentId = 'equipment-qa';
const locationId = 'location-qa';
const date = '2020-01-02';
sqlite.prepare('INSERT INTO properties (id,owner_id,name,address,created_at) VALUES (?,?,?,?,?)')
  .run('property-qa', ownerId, 'Imóvel QA', 'Rua QA', date);
sqlite.prepare('INSERT INTO equipment (id,owner_id,property_id,name,location,checklist,created_at) VALUES (?,?,?,?,?,?,?)')
  .run(equipmentId, ownerId, 'property-qa', 'Aparelho QA', 'Sala QA', '["Filtro"]', date);
sqlite.prepare('INSERT INTO cleaning_locations (id,owner_id,property_id,name,catalog,created_at) VALUES (?,?,?,?,?,?)')
  .run(locationId, ownerId, 'property-qa', 'Sala QA', '[{"id":"floor","label":"Piso","frequency":"daily","enabled":true}]', date);

function formFor(type, requestId, notes = 'Observação original') {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    request_id: requestId, confirmed: 'yes', responsible: 'Pessoa QA', service_date: date, service_time: '12:00', notes,
    ...type,
  })) form.set(name, value);
  return form;
}

async function verify(table, save, fields) {
  const lookup = sqlite.prepare('SELECT id,notes,request_fingerprint FROM ' + table + ' WHERE request_id=?');
  const requestId = randomUUID();
  dropCommitResponse = true;
  const saved = await save(formFor(fields, requestId));
  assert.equal(saved.alreadySaved, true);
  assert.equal((await save(formFor(fields, requestId))).id, saved.id);
  await assert.rejects(save(formFor(fields, requestId, 'Observação alterada')), { status: 409 });
  assert.match(lookup.get(requestId).request_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(lookup.get(requestId).notes, 'Observação original');

  const concurrent = randomUUID();
  beforeBatch = () => save(formFor(fields, concurrent));
  await assert.rejects(save(formFor(fields, concurrent, 'Envio divergente')), { status: 409 });
  assert.equal(lookup.get(concurrent).notes, 'Observação original');

  const identical = randomUUID();
  beforeBatch = () => save(formFor(fields, identical));
  assert.equal((await save(formFor(fields, identical))).id, lookup.get(identical).id);

  // Historical records have no fingerprint and must not confirm unverifiable retries.
  sqlite.prepare('UPDATE ' + table + ' SET request_fingerprint=NULL WHERE request_id=?').run(requestId);
  await assert.rejects(save(formFor(fields, requestId)), { status: 409 });
}

async function main() {
  await verify('maintenance', form => saveMaintenance(form, { ownerId, equipmentId }), {
    checklist_results: '[{"item":"Filtro","status":"done"}]', evidence_pending: 'yes', evidence_note: 'Foto pendente',
  });
  await verify('cleaning_records', form => saveCleaning(form, ownerId, locationId), {
    frequency: 'daily', results: '[{"id":"floor","status":"done"}]',
  });
  const original = new FormData();
  original.set('photos', new File(['bytes-a'], 'foto.jpg', { type: 'image/jpeg' }));
  const changed = new FormData();
  changed.set('photos', new File(['bytes-b'], 'foto.jpg', { type: 'image/jpeg' }));
  assert.notEqual(await serviceSubmissionFingerprint(original), await serviceSubmissionFingerprint(changed));
  console.log('PASS service submissions: identical replay, changed fields or photos, concurrent commits and historical records');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => sqlite.close());
