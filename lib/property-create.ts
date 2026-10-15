import {propertyCapacityFromForm} from './property-capacity';
import {uppercasePropertyText} from './property-text';
import {first, db, bucket, clean} from './maintenance';
import {operatorGuard, recheckOperator, type Operator} from './app-access';
import {isRegionalRequest} from './regional-access';
import {RequestError} from './http-security';
import {propertyRegion, BRAZIL_STATES} from './property-region';
import {propertyCountsFromForm, PropertyDetailsError} from './property-details';
import {propertyType} from './property-type';
import {readPropertyFrontPhoto, PropertyFrontPhotoError} from './property-front-photo';
import {sanitizePhoto} from './photo-privacy';
import type {PrivateFrontPhoto} from './property-front-photo-data';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIELDS = new Set(['action', 'name', 'address', 'property_type', 'property_level', 'declared_slots', 'state_code', 'worksite_id', 'catalog_client_id', 'catalog_status', 'bedrooms', 'bathrooms', 'request_id', 'front_photo']);
const conflict = () => new RequestError('A empresa, o centro de custo ou seu acesso mudou. Atualize as opções antes de salvar.', 409);
const reused = () => new RequestError('Este formulário já foi usado com outros dados. Abra um novo cadastro.', 409);

export type CreatedProperty = {id: string; revision: number; control_number: number; front_photo: PrivateFrontPhoto | null; alreadySaved: boolean};

function field(form: FormData, key: string, max: number) {
  const value = form.get(key);
  if (value !== null && typeof value !== 'string') throw new RequestError('Confira os campos do imóvel.');
  return clean(value, max);
}

async function digest(value: unknown) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))]
    .map(n => n.toString(16).padStart(2, '0')).join('');
}

/** One shared transaction for both create forms. No direct asset IDs or public URLs are inputs. */
export async function createProperty(op: Operator, form: FormData): Promise<CreatedProperty> {
  await recheckOperator(op);
  const seen = new Set<string>();
  for (const [key] of form) {
    if (!FIELDS.has(key) || seen.has(key)) throw new RequestError('Envie os campos do imóvel e somente uma foto, uma vez cada.');
    seen.add(key);
  }
  if (form.has('catalog_status') && form.get('catalog_status') !== 'ready') {
    throw new RequestError('Atualize as opções de empresa e centro de custo antes de salvar.');
  }
  const name = field(form, 'name', 120), address = field(form, 'address', 300);
  if (!name || !address) throw new RequestError('Informe nome e endereço do imóvel.');
  const type = propertyType(form.get('property_type'));
  let counts, capacity;
  try { counts = propertyCountsFromForm(form); capacity = propertyCapacityFromForm(form); }
  catch (error) { if (error instanceof PropertyDetailsError) throw new RequestError(error.message); throw error; }
  const state = field(form, 'state_code', 80).toUpperCase(), worksite = field(form, 'worksite_id', 80) || null;
  const client = form.has('catalog_client_id') ? field(form, 'catalog_client_id', 80) || null : undefined;
  if (state && !Object.hasOwn(BRAZIL_STATES, state)) throw new RequestError('Selecione um estado válido ou deixe a confirmar.');
  if (isRegionalRequest() && state !== 'PA') throw new RequestError('Seu acesso permite cadastrar imóveis somente no Pará.', 403);

  // Native unselected file inputs parse as an unnamed empty File (or an empty string).
  const selected = form.get('front_photo');
  const hasPhoto = selected !== null && selected !== '' && !(selected instanceof File && selected.size === 0 && selected.name === '');
  const suppliedRequest = field(form, 'request_id', 80);
  if (form.has('request_id') && !UUID.test(suppliedRequest) || hasPhoto && !UUID.test(suppliedRequest)) {
    throw new RequestError('Atualize o formulário antes de salvar o imóvel.');
  }
  // Older no-photo clients remain compatible. Current forms always supply their stable UUID.
  const requestId = suppliedRequest || crypto.randomUUID();
  let photo: Awaited<ReturnType<typeof readPropertyFrontPhoto>> | null = null;
  if (hasPhoto) {
    try { photo = await readPropertyFrontPhoto(form, sanitizePhoto); }
    catch (error) { if (error instanceof PropertyFrontPhotoError) throw new RequestError(error.message); throw error; }
  }
  const fingerprint = await digest({version: 1, owner: op.ownerId, actor: op.actor.userId, name, address, property_type: type,
    state_code: state || null, worksite_id: worksite, catalog_client_id: client,
    ...counts, ...(form.has('property_level') || form.has('declared_slots') ? capacity : {}), photo: photo ? {content_type: photo.contentType, sha256: photo.sha256} : null});

  async function replay(): Promise<CreatedProperty | null> {
    await recheckOperator(op);
    // Both the original ledger scope and the live property scope are enforced by the facade.
    const row = await first(`SELECT r.property_id,r.property_revision,r.request_fingerprint,r.actor_user_id,p.control_number,
      p.revision live_revision,p.state_code live_state_code,p.worksite_id live_worksite_id,
      r.front_photo_asset_id,a.id photo_id,a.created_at photo_created_at
      FROM property_creation_requests r JOIN properties p ON p.id=r.property_id AND p.owner_id=r.owner_id
      LEFT JOIN property_front_photo_assets a ON a.id=r.front_photo_asset_id AND a.property_id=p.id AND a.owner_id=p.owner_id
      WHERE r.owner_id=? AND r.request_id=?`, op.ownerId, requestId);
    if (!row) return null;
    if (row.actor_user_id !== op.actor.userId || row.request_fingerprint !== fingerprint) throw reused();
    if (row.front_photo_asset_id && !row.photo_id) throw conflict();
    // Do not return private identifiers from a read whose property or actor changed while awaiting it.
    await recheckOperator(op);
    const access = operatorGuard(op);
    const stillVisible = await first(`SELECT 1 present FROM property_creation_requests r
      JOIN properties p ON p.id=r.property_id AND p.owner_id=r.owner_id
      WHERE r.owner_id=? AND r.request_id=? AND r.property_id=? AND r.front_photo_asset_id IS ?
        AND p.revision=? AND p.state_code IS ? AND p.worksite_id IS ? AND ${access.sql}`,
      op.ownerId, requestId, row.property_id, row.front_photo_asset_id,
      row.live_revision, row.live_state_code, row.live_worksite_id, ...access.args);
    if (!stillVisible) throw conflict();
    return {id: row.property_id, revision: row.property_revision, control_number: row.control_number,
      front_photo: row.photo_id ? {id: row.photo_id, path: `/api/property-front-photo/${row.photo_id}`, created_at: row.photo_created_at} : null,
      alreadySaved: true};
  }
  const prior = await replay();
  if (prior) return prior;
  const storedName=uppercasePropertyText(name),storedAddress=uppercasePropertyText(address);
  if(storedName.length>120||storedAddress.length>300)throw new RequestError('Nome ou endereço ultrapassou o limite de caracteres.');
  // Resolve the current catalog only for a new creation. A successful retry can survive an archived catalog.
  const region = await propertyRegion(op.ownerId, state, worksite, client);
  const id = crypto.randomUUID(), assetId = photo ? crypto.randomUUID() : null;
  const objectKey = assetId ? `property-front/${op.ownerId}/${id}/${assetId}` : null;
  const now = new Date().toISOString(), revision = photo ? 1 : 0;
  const guard = operatorGuard(op);
  const insert = db().prepare(`INSERT INTO properties
    (id,owner_id,name,address,property_type,created_at,state_code,worksite_id,bedrooms,bathrooms,property_level,declared_slots,revision,front_photo_asset_id)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql} AND ${region.guard.sql}
      AND NOT EXISTS(SELECT 1 FROM property_creation_requests WHERE owner_id=? AND request_id=?)`)
    .bind(id, op.ownerId, storedName, storedAddress, type, now, region.state_code, region.worksite_id, counts.bedrooms, counts.bathrooms, capacity.property_level, capacity.declared_slots,
      revision, assetId, ...guard.args, ...region.guard.args, op.ownerId, requestId);
  const statements = [insert];
  if (photo && assetId && objectKey) {
    // The inserted UUID is a transaction-local marker; do not repeat epoch guards after property triggers.
    statements.push(db().prepare(`INSERT INTO property_front_photo_assets
      (id,owner_id,property_id,state_code,worksite_id,object_key,content_type,size,sha256,created_at,
       uploaded_by_user_id,uploaded_by_name,reason,property_revision,previous_asset_id,request_id,request_fingerprint)
      SELECT ?,p.owner_id,p.id,p.state_code,p.worksite_id,?,?,?,?,?,?,?,?,p.revision,NULL,?,?
      FROM properties p WHERE p.id=? AND p.owner_id=? AND p.front_photo_asset_id=? AND p.revision=?`)
      .bind(assetId, objectKey, photo.contentType, photo.size, photo.sha256, now, op.actor.userId,
        op.actor.fullName || op.actor.displayName, 'Registro da foto da frente do imóvel', assetId, fingerprint,
        id, op.ownerId, assetId, revision));
  }
  statements.push(db().prepare(`INSERT INTO property_creation_requests
    (id,owner_id,request_id,actor_user_id,request_fingerprint,property_id,property_revision,state_code,worksite_id,front_photo_asset_id,created_at)
    SELECT ?,p.owner_id,?,?,?,p.id,p.revision,p.state_code,p.worksite_id,p.front_photo_asset_id,?
    FROM properties p WHERE p.id=? AND p.owner_id=?`)
    .bind(crypto.randomUUID(), requestId, op.actor.userId, fingerprint, now, id, op.ownerId));

  let uploaded = false, batchAttempted = false, batchReturned = false, ownsUpload = false;
  try {
    if (photo && objectKey) {
      uploaded = true; // R2 may store bytes even if its response is lost.
      await bucket().put(objectKey, photo.bytes, {httpMetadata: {contentType: photo.contentType, cacheControl: 'private, no-store'}});
    }
    await recheckOperator(op);
    batchAttempted = true;
    const result = await db().batch(statements);
    batchReturned = true;
    if (result[0]?.meta?.changes > 0) ownsUpload = true;
    const committed = await replay();
    if (!committed) throw conflict();
    return {...committed, alreadySaved: !ownsUpload};
  } catch (error) {
    // A D1 response can be lost after its atomic commit. Replay only through current authorization.
    if (!(error instanceof RequestError)) {
      try { const committed = await replay(); if (committed) return committed; }
      catch (replayError) { if (replayError instanceof RequestError) throw replayError; }
    }
    throw error;
  } finally {
    if (uploaded && objectKey && !ownsUpload) {
      try {
        // Existence/ownership only, never returned. A unique winning ledger proves a competing batch
        // cannot later commit. Without that proof an uncertain batch must retain its private object.
        const saved = await db().prepare(`SELECT CASE WHEN property_id=? AND front_photo_asset_id=? THEN 1 ELSE 0 END owns_upload
          FROM property_creation_requests WHERE owner_id=? AND request_id=?`)
          .bind(id, assetId, op.ownerId, requestId).first<{owns_upload: number}>();
        if (!saved?.owns_upload && (!batchAttempted || batchReturned || saved)) await bucket().delete(objectKey);
      } catch { console.error('Property creation temporary photo cleanup deferred'); }
    }
  }
}
