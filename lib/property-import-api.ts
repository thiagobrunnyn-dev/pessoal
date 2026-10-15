import type {Operator} from './app-access';
import {boundedJson, requireSameOrigin, RequestError} from './http-security';
import {
  PROPERTY_IMPORT_BODY_LIMIT, PROPERTY_IMPORT_FORMAT, PROPERTY_IMPORT_HEADERS,
  ImportError, addressKey, classifyRows, digest, exactKeys, isObject, normalizeRows, readDocument, requestId, stableJson,
  type ExistingProperty, type ImportRow, type ImportView,
} from './property-imports';

type Guard = {sql: string; args: unknown[]};
type Dependencies = {
  db: () => D1Database;
  getOperator: () => Promise<Operator | null>;
  recheckOperator: (op: Operator) => Promise<void>;
  requireGlobalCatalog: () => void;
  globalGuard: (op: Operator) => Guard;
};
type StoredBatch = {
  id: string; owner_id: string; preview_request_id: string; request_fingerprint: string;
  document_hash: string; source_format: string; status: string; review_hash: string;
  catalog_snapshot: string; catalog_counter: number; created_by: string; created_at: string;
  confirm_request_id: string | null; confirm_fingerprint: string | null; completed_at: string | null;
};
type StoredRow = {
  id: string; position: number; source_key: string; original_json: string; normalized_json: string;
  status: ImportRow['status']; issues_json: string; duplicate_json: string | null;
  result_status: ImportRow['result']['status']; property_id: string | null; control_number: number | null;
};
type Catalog = {catalog_snapshot: string; catalog_counter: number};
// A single ordered snapshot statement reads both data and the global numbering counter.
// Compare this exact expression only in the FIRST statement of a confirm transaction.
const catalogSql = `COALESCE((SELECT json_group_array(json_array(p.id,p.name,p.address,p.state_code,p.control_number,p.revision,p.archived_at,p.archive_event_id,p.worksite_id,p.bedrooms,p.bathrooms,p.front_photo_asset_id,p.last_correction_id,p.created_at,p.owner_id)) FROM (SELECT * FROM properties WHERE owner_id=? ORDER BY id) p),'[]')`;
const counterSql = '(SELECT last_number FROM property_number_counter WHERE id=1)';
const stale = () => new ImportError('Os imóveis cadastrados mudaram desde a prévia. Prepare uma nova prévia e revise antes de confirmar.', 409, 'review_stale');
const conflict = () => new ImportError('Este identificador já foi usado para outra solicitação. Reabra a prévia.', 409, 'request_conflict');
function propertiesIn(catalog: Catalog): ExistingProperty[] {
  return (JSON.parse(catalog.catalog_snapshot) as unknown[][]).map(p => ({id: p[0] as string, name: p[1] as string, address: p[2] as string, state_code: p[3] as string | null, control_number: p[4] as number | null}));
}
function reviewHash(batch: Pick<StoredBatch, 'id' | 'document_hash' | 'catalog_snapshot' | 'catalog_counter'>, rows: ImportRow[]) {
  return digest({format: PROPERTY_IMPORT_FORMAT, batch_id: batch.id, document_hash: batch.document_hash,
    catalog_snapshot: batch.catalog_snapshot, catalog_counter: batch.catalog_counter,
    rows: rows.map(row => ({row_id: row.row_id, position: row.position, source_key: row.source_key,
      original: row.original, normalized: row.normalized, status: row.status, issues: row.issues, duplicate_of: row.duplicate_of}))});
}

export function createPropertyImportApi(deps: Dependencies) {
  const database = () => deps.db();
  const first = <T>(sql: string, ...args: unknown[]) => database().prepare(sql).bind(...args).first<T>();
  async function recheck(op: Operator) {
    deps.requireGlobalCatalog();
    await deps.recheckOperator(op);
    const guard = deps.globalGuard(op);
    if (!await first('SELECT 1 allowed WHERE ' + guard.sql, ...guard.args)) throw new ImportError('Acesso geral encerrado. Atualize a página.', 403, 'access_denied');
  }
  async function authorize() {
    const op = await deps.getOperator();
    if (!op) throw new ImportError('Entre com uma conta da gestão autorizada.', 401, 'sign_in_required');
    await recheck(op);
    return op;
  }
  async function findBatch(op: Operator, column: 'id' | 'preview_request_id' | 'confirm_request_id', id: string) {
    const guard = deps.globalGuard(op);
    return first<StoredBatch>('SELECT * FROM property_import_batches WHERE owner_id=? AND ' + column + '=? AND ' + guard.sql, op.ownerId, id, ...guard.args);
  }
  async function rowsFor(op: Operator, id: string): Promise<ImportRow[]> {
    const guard = deps.globalGuard(op);
    const {results} = await database().prepare('SELECT r.* FROM property_import_rows r JOIN property_import_batches b ON b.id=r.batch_id WHERE b.id=? AND b.owner_id=? AND ' + guard.sql + ' ORDER BY r.position').bind(id, op.ownerId, ...guard.args).all<StoredRow>();
    return results.map(row => ({row_id: row.id, position: row.position, source_key: row.source_key,
      original: JSON.parse(row.original_json), normalized: JSON.parse(row.normalized_json),
      status: row.status, issues: JSON.parse(row.issues_json), duplicate_of: row.duplicate_json ? JSON.parse(row.duplicate_json) : null,
      result: {status: row.result_status, property_id: row.property_id, control_number: row.control_number}}));
  }
  async function view(op: Operator, batch: StoredBatch): Promise<ImportView> {
    // A confirmation may commit between the header and row reads. Refresh once
    // across that one-way transition so a completed receipt never has pending rows.
    let rows = await rowsFor(op, batch.id);
    const latest = await findBatch(op, 'id', batch.id);
    if (!latest) {await recheck(op); throw new ImportError('Lote não encontrado.', 404);}
    if (latest.status !== batch.status) {batch = latest; rows = await rowsFor(op, batch.id);}
    await recheck(op);
    if (batch.status !== 'preview' && batch.status !== 'completed') throw new ImportError('A confirmação está em andamento. Verifique o resultado com este mesmo lote.', 409, 'commit_pending');
    return {batch_id: batch.id, status: batch.status, review_hash: batch.review_hash, created_at: batch.created_at, completed_at: batch.completed_at,
      summary: {total: rows.length, valid: rows.filter(r => r.status === 'valid').length, duplicate: rows.filter(r => r.status === 'duplicate').length,
        invalid: rows.filter(r => r.status === 'invalid').length, created: rows.filter(r => r.result.status === 'created').length, ignored: rows.filter(r => r.result.status === 'ignored').length}, rows};
  }
  async function snapshot(op: Operator) {
    const catalog = await first<Catalog>('SELECT ' + catalogSql + ' catalog_snapshot,' + counterSql + ' catalog_counter', op.ownerId);
    if (!catalog || !Number.isSafeInteger(catalog.catalog_counter)) throw new Error('Property numbering unavailable');
    return catalog;
  }
  async function preview(op: Operator, body: Record<string, unknown>) {
    exactKeys(body, ['action', 'request_id', 'document']);
    const request_id = requestId(body.request_id), document = readDocument(body.document);
    const document_hash = await digest(document), fingerprint = await digest({document_hash, actor: op.actor.userId});
    const replay = async () => {
      const saved = await findBatch(op, 'preview_request_id', request_id);
      if (!saved) return null;
      if (saved.request_fingerprint !== fingerprint) throw conflict();
      return view(op, saved);
    };
    const previous = await replay(); if (previous) return previous;
    const catalog = await snapshot(op), id = crypto.randomUUID(), created_at = new Date().toISOString();
    const rows = classifyRows(normalizeRows(document.rows), propertiesIn(catalog));
    const review_hash = await reviewHash({id, document_hash, ...catalog}, rows);
    await recheck(op);
    const guard = deps.globalGuard(op);
    const statements = [database().prepare(`INSERT INTO property_import_batches
      (id,owner_id,preview_request_id,request_fingerprint,document_hash,source_format,review_hash,catalog_snapshot,catalog_counter,created_by,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql}
      ON CONFLICT(owner_id,preview_request_id) DO NOTHING`).bind(id, op.ownerId, request_id, fingerprint, document_hash, PROPERTY_IMPORT_FORMAT,
      review_hash, catalog.catalog_snapshot, catalog.catalog_counter, op.actor.userId, created_at, ...guard.args)];
    for (const row of rows) statements.push(database().prepare(`INSERT INTO property_import_rows
      (id,batch_id,position,source_key,original_json,normalized_json,address_key,state_code,status,issues_json,duplicate_json)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_import_batches WHERE id=? AND owner_id=?)`).bind(
      row.row_id, id, row.position, row.source_key, stableJson(row.original), stableJson(row.normalized), addressKey(row.normalized.address), row.normalized.state_code,
      row.status, stableJson(row.issues), row.duplicate_of ? stableJson(row.duplicate_of) : null, id, op.ownerId));
    try {await database().batch(statements);} catch (error) {
      // A transport timeout may happen after commit. Never repeat with a new request ID.
      await recheck(op);
      const recovered = await replay(); if (recovered) return recovered;
      throw error;
    }
    await recheck(op);
    const saved = await replay();
    if (!saved) throw new ImportError('Não foi possível preparar o lote. Tente novamente com a mesma solicitação.', 503);
    return saved;
  }
  async function confirm(op: Operator, body: Record<string, unknown>) {
    exactKeys(body, ['action', 'batch_id', 'review_hash', 'selected_row_ids', 'request_id', 'confirmed']);
    const batch_id = requestId(body.batch_id), request_id = requestId(body.request_id);
    if (body.confirmed !== true) throw new ImportError('Revise as linhas selecionadas e confirme o cadastro.');
    if (typeof body.review_hash !== 'string' || !/^[a-f0-9]{64}$/.test(body.review_hash)) throw new ImportError('Revisão inválida. Reabra a prévia.');
    if (!Array.isArray(body.selected_row_ids) || body.selected_row_ids.length < 1 || body.selected_row_ids.length > 100 || body.selected_row_ids.some(id => typeof id !== 'string') || new Set(body.selected_row_ids).size !== body.selected_row_ids.length) throw new ImportError('Selecione de 1 a 100 linhas válidas, sem repetições.');
    const selected = (body.selected_row_ids as string[]).map(requestId).sort();
    const fingerprint = await digest({batch_id, review_hash: body.review_hash, selected, actor: op.actor.userId});
    const batch = await findBatch(op, 'id', batch_id);
    if (!batch) {await recheck(op); throw new ImportError('Lote não encontrado.', 404);}
    const replay = async () => {
      const current = await findBatch(op, 'id', batch_id);
      if (!current) return null;
      if (current.status === 'completed') {
        if (current.confirm_fingerprint !== fingerprint) throw new ImportError('Este lote já foi concluído. Consulte o recibo; envie o arquivo novamente para preparar outro lote.', 409, 'batch_completed');
        return view(op, current);
      }
      return null;
    };
    const alreadySaved = await replay(); if (alreadySaved) return alreadySaved;
    const usedRequest = await findBatch(op, 'confirm_request_id', request_id);
    if (usedRequest && (usedRequest.id !== batch_id || usedRequest.confirm_fingerprint !== fingerprint)) throw conflict();
    if (batch.status !== 'preview' || batch.review_hash !== body.review_hash) throw stale();
    const rows = await rowsFor(op, batch_id);
    if (await reviewHash(batch, rows) !== batch.review_hash) throw stale();
    const selectedRows = selected.map(id => rows.find(row => row.row_id === id));
    if (selectedRows.some(row => !row || row.status !== 'valid' || row.result.status !== 'pending')) {
      const concurrent = await replay(); if (concurrent) return concurrent;
      throw new ImportError('A seleção contém uma linha inválida, duplicada ou de outro lote.');
    }
    const catalog = await snapshot(op);
    if (catalog.catalog_snapshot !== batch.catalog_snapshot || catalog.catalog_counter !== batch.catalog_counter) {
      const concurrent = await replay(); if (concurrent) return concurrent;
      throw stale();
    }
    const revalidated = normalizeRows(rows.map(row => row.original)).map((row, index) => ({...row, row_id: rows[index].row_id}));
    classifyRows(revalidated, propertiesIn(catalog));
    if (selected.some(id => revalidated.find(row => row.row_id === id)?.status !== 'valid')) throw stale();
    await recheck(op);
    const guard = deps.globalGuard(op), token = crypto.randomUUID(), completed_at = new Date().toISOString();
    // The write lock is acquired here. Check all catalog changes BEFORE any property
    // insert increments its native counter. Later statements only trust this token.
    const statements = [database().prepare(`UPDATE property_import_batches SET status='committing',commit_token=?,confirm_request_id=?,confirm_fingerprint=?,confirmed_by=?,selected_row_ids_json=?,selected_count=?
      WHERE id=? AND owner_id=? AND status='preview' AND review_hash=? AND catalog_snapshot=? AND catalog_counter=?
      AND ${catalogSql}=? AND ${counterSql}=? AND ${guard.sql}`).bind(token, request_id, fingerprint, op.actor.userId, stableJson(selected), selected.length,
      batch_id, op.ownerId, body.review_hash, catalog.catalog_snapshot, catalog.catalog_counter, op.ownerId, catalog.catalog_snapshot, catalog.catalog_counter, ...guard.args)];
    for (const row of (selectedRows as ImportRow[]).sort((a, b) => a.position - b.position)) {
      const property_id = crypto.randomUUID();
      statements.push(database().prepare(`INSERT INTO properties(id,owner_id,name,address,state_code,worksite_id,bedrooms,bathrooms,created_at)
        SELECT ?,b.owner_id,json_extract(r.normalized_json,'$.name'),json_extract(r.normalized_json,'$.address'),r.state_code,NULL,NULL,NULL,?
        FROM property_import_rows r JOIN property_import_batches b ON b.id=r.batch_id
        WHERE b.id=? AND b.owner_id=? AND b.status='committing' AND b.commit_token=? AND r.id=? AND r.status='valid' AND r.result_status='pending'`).bind(
        property_id, completed_at, batch_id, op.ownerId, token, row.row_id));
      // If a selected INSERT is unexpectedly skipped, the NOT NULL/CHECK/FK
      // combination aborts the whole batch; zero-row partial success is impossible.
      statements.push(database().prepare(`UPDATE property_import_rows SET result_status='created',property_id=?,control_number=(SELECT control_number FROM properties WHERE id=? AND owner_id=?)
        WHERE id=? AND batch_id=? AND result_status='pending' AND EXISTS(SELECT 1 FROM property_import_batches WHERE id=? AND owner_id=? AND status='committing' AND commit_token=?)`).bind(
        property_id, property_id, op.ownerId, row.row_id, batch_id, batch_id, op.ownerId, token));
    }
    statements.push(database().prepare(`UPDATE property_import_rows SET result_status='ignored' WHERE batch_id=? AND result_status='pending'
      AND EXISTS(SELECT 1 FROM property_import_batches WHERE id=? AND owner_id=? AND status='committing' AND commit_token=?)`).bind(batch_id, batch_id, op.ownerId, token));
    statements.push(database().prepare(`UPDATE property_import_batches SET status='completed',completed_at=?,created_count=(SELECT count(*) FROM property_import_rows WHERE batch_id=? AND result_status='created')
      WHERE id=? AND owner_id=? AND status='committing' AND commit_token=?`).bind(completed_at, batch_id, batch_id, op.ownerId, token));
    try {await database().batch(statements);} catch (error) {
      await recheck(op);
      const recovered = await replay(); if (recovered) return recovered;
      const collision = await findBatch(op, 'confirm_request_id', request_id);
      if (collision) throw conflict();
      throw error;
    }
    await recheck(op);
    const receipt = await replay(); if (receipt) return receipt;
    throw stale();
  }
  const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: PROPERTY_IMPORT_HEADERS});
  const errorReply = (error: unknown) => reply({error: error instanceof RequestError ? error.message : 'Não foi possível concluir. Verifique o resultado ou tente novamente com a mesma solicitação.',
    ...(error instanceof ImportError && error.code ? {code: error.code} : {})}, error instanceof RequestError ? error.status : 503);
  return {
    async GET(request: Request) {
      try {
        const op = await authorize(), params = new URL(request.url).searchParams;
        if (Array.from(params.keys()).some(key => key !== 'id') || params.getAll('id').length !== 1) throw new ImportError('Informe somente o identificador do lote.');
        const batch = await findBatch(op, 'id', requestId(params.get('id')));
        if (!batch) {await recheck(op); throw new ImportError('Lote não encontrado.', 404);}
        return reply(await view(op, batch));
      } catch (error) {return errorReply(error);}
    },
    async POST(request: Request) {
      try {
        const op = await authorize(); requireSameOrigin(request);
        const body: unknown = await boundedJson(request, PROPERTY_IMPORT_BODY_LIMIT);
        if (!isObject(body)) throw new ImportError('Solicitação inválida.');
        if (body.action === 'preview') return reply(await preview(op, body));
        if (body.action === 'confirm') return reply(await confirm(op, body));
        throw new ImportError('Ação inválida.');
      } catch (error) {return errorReply(error);}
    },
  };
}
