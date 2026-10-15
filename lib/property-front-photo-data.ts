import {CONFIRMED_ROOM_CAPACITY_SQL,propertyLevel,declaredSlots} from './property-capacity';
import {first, db, bucket} from './maintenance';
import {getOperator, operatorGuard, recheckOperator, type Operator} from './app-access';
import {isRegionalRequest} from './regional-access';
import {RequestError} from './http-security';
import {sanitizePhoto} from './photo-privacy';
import {parseHandoverDetails, optionalPropertyCount} from './property-details';
import {
  readPropertyFrontPhoto, PropertyFrontPhotoError,
  FRONT_PHOTO_LIMIT, PRIVATE_FRONT_PHOTO_HEADERS,
} from './property-front-photo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FORM_FIELDS = new Set(['property_id', 'expected_revision', 'request_id', 'front_photo', 'reason', 'confirmed']);
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const INITIAL_REASON = 'Registro da foto da frente do imóvel';
const missingProperty = () => new RequestError('Imóvel não encontrado.', 404);
const missingPhoto = () => new RequestError('Foto não encontrada.', 404);
const conflict = () => new RequestError('O imóvel ou seu acesso mudou. Atualize antes de salvar.', 409);

export type PrivateFrontPhoto = {id: string; path: string; created_at: string};
export type PrivateHandoverDetails = {
  status: 'recorded'; bedrooms: number | null; bathrooms: number | null;
  front_photo: PrivateFrontPhoto | null; captured_at: string; property_revision: number;
} | {status: 'not_recorded' | 'property_changed' | 'unavailable'};

function visiblePhoto(row: {id: string; created_at: string} | null): PrivateFrontPhoto | null {
  return row && UUID.test(row.id) && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
    ? {id: row.id, path: `/api/property-front-photo/${row.id}`, created_at: new Date(row.created_at).toISOString()}
    : null;
}

/** Private DTO only. Never serialize the raw pointer: a scoped asset JOIN must authorize it. */
export async function currentPropertyDetails(op: Operator, id: string) {
  await recheckOperator(op);
  if (!UUID.test(id)) throw missingProperty();
  const row = await first(`SELECT p.id,p.revision,p.name,p.address,p.control_number,p.state_code,p.property_type,p.property_level,p.declared_slots,${CONFIRMED_ROOM_CAPACITY_SQL} confirmed_room_capacity,p.bedrooms,p.bathrooms,p.archived_at,p.caretaker_profile_id,c.name cost_center_name,n.name client_name,person.display_name caretaker_name,person.job_title caretaker_title,person.status caretaker_status,
    g.latitude,g.longitude,g.accuracy_m,g.updated_at,
    a.id photo_id,a.created_at photo_created_at
    FROM properties p LEFT JOIN cost_centers c ON c.id=p.worksite_id AND c.owner_id=p.owner_id LEFT JOIN clients n ON n.id=c.client_id AND n.owner_id=p.owner_id LEFT JOIN person_profiles person ON person.id=p.caretaker_profile_id AND person.owner_id=p.owner_id AND person.state_code IS p.state_code LEFT JOIN property_geolocations g ON g.property_id=p.id AND g.owner_id=p.owner_id LEFT JOIN property_front_photo_assets a
      ON a.id=p.front_photo_asset_id AND a.owner_id=p.owner_id AND a.property_id=p.id
    WHERE p.id=? AND p.owner_id=?`, id, op.ownerId);
  if (!row) throw missingProperty();
  return {
    id: row.id as string,
    revision: row.revision as number,
    name: row.name as string, address: row.address as string, control_number: row.control_number, state_code: row.state_code,
    latitude: row.latitude, longitude: row.longitude, accuracy_m: row.accuracy_m, updated_at: row.updated_at,
    property_type: row.property_type ?? null,
    property_level: propertyLevel(row.property_level), declared_slots: declaredSlots(row.declared_slots), confirmed_room_capacity: row.confirmed_room_capacity ?? null,
    client_name:row.client_name||null,cost_center_name:row.cost_center_name||null,caretaker_name:row.caretaker_name||null,caretaker_title:row.caretaker_title||null,caretaker_status:row.caretaker_status||null,can_edit_caretaker:row.archived_at===null,
    bedrooms: optionalPropertyCount(row.bedrooms, 'bedrooms'),
    bathrooms: optionalPropertyCount(row.bathrooms, 'bathrooms'),
    front_photo: visiblePhoto(row.photo_id ? {id: row.photo_id, created_at: row.photo_created_at} : null),
    can_edit_numbers: !isRegionalRequest(),
    can_edit_photo: row.archived_at === null,
  };
}

/** Call from management handover DTOs only; legacy cycles remain unknown.
 * Re-read through the scoped facade so an accidental raw caller cannot expose a snapshot.
 * The persisted JSON, origin property ID/state and internal asset fields are never returned.
 */
export async function privateHandoverDetails(ownerId: string, record: {id: string}): Promise<PrivateHandoverDetails> {
  const op = await getOperator();
  if (!op || op.ownerId !== ownerId) throw new RequestError('Acesso restrito à gestão autorizada.', 401);
  await recheckOperator(op);
  if (!record || typeof record.id !== 'string' || !UUID.test(record.id)) return {status: 'unavailable'};
  const row = await first(`SELECT h.property_id,h.property_details_snapshot
    FROM housing_handovers h JOIN properties p ON p.id=h.property_id AND p.owner_id=h.owner_id
    WHERE h.id=? AND h.owner_id=?`, record.id, ownerId);
  if (!row) return {status: 'unavailable'};
  const snapshot = parseHandoverDetails(row.property_details_snapshot);
  if (!snapshot || !UUID.test(snapshot.property_id) ||
      snapshot.front_photo_asset_id !== null && !UUID.test(snapshot.front_photo_asset_id)) return {status: 'not_recorded'};
  if (snapshot.property_id !== row.property_id) return {status: 'property_changed'};
  if (isRegionalRequest() && snapshot.state_code !== 'PA') return {status: 'unavailable'};
  const photo = snapshot.front_photo_asset_id ? await first(`SELECT a.id,a.created_at
    FROM property_front_photo_assets a JOIN properties p ON p.id=a.property_id AND p.owner_id=a.owner_id
    WHERE a.id=? AND a.owner_id=? AND a.property_id=?`, snapshot.front_photo_asset_id, ownerId, row.property_id) : null;
  // Recheck after the separate asset read, including regional moves and corrections to another property.
  await recheckOperator(op);
  const stillVisible = await first(`SELECT 1 present FROM housing_handovers h
    JOIN properties p ON p.id=h.property_id AND p.owner_id=h.owner_id
    WHERE h.id=? AND h.owner_id=? AND h.property_id=? AND h.property_details_snapshot=?`,
  record.id, ownerId, row.property_id, row.property_details_snapshot);
  if (!stillVisible) return {status: 'unavailable'};
  return {
    status: 'recorded', bedrooms: snapshot.bedrooms, bathrooms: snapshot.bathrooms,
    front_photo: visiblePhoto(photo), captured_at: new Date(snapshot.captured_at).toISOString(),
    property_revision: snapshot.property_revision,
  };
}

function textField(form: FormData, name: string, max: number, required = false) {
  const value = form.get(name);
  if (value !== null && typeof value !== 'string') throw new RequestError('Confira os campos da foto.');
  const text = (value || '').trim();
  if (text.length > max || required && !text) throw new RequestError('Confira os campos obrigatórios da foto.');
  return text;
}

function validateFields(form: FormData) {
  const seen = new Set<string>();
  for (const [key] of form) {
    if (!FORM_FIELDS.has(key) || seen.has(key)) throw new RequestError('Envie somente os campos da foto, uma vez cada.');
    seen.add(key);
  }
  const propertyId = textField(form, 'property_id', 36, true);
  const requestId = textField(form, 'request_id', 36, true);
  const revision = textField(form, 'expected_revision', 16, true);
  const suppliedReason = textField(form, 'reason', 1000);
  if (!UUID.test(propertyId)) throw missingProperty();
  if (!UUID.test(requestId) || form.get('confirmed') !== 'yes') throw new RequestError('Confirme a foto e atualize o formulário.');
  const expected = Number(revision);
  if (!/^\d+$/.test(revision) || !Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER) {
    throw new RequestError('Revisão inválida. Atualize o imóvel.', 409);
  }
  return {propertyId, requestId, expected, suppliedReason, reason: suppliedReason || INITIAL_REASON};
}

async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}

/** Separate namespaces; this cleanup cannot delete visit counters. Replay does not consume quota. */
async function limitUpload(op: Operator, propertyId: string) {
  const now = Math.floor(Date.now() / 1000), window = Math.floor(now / 3600), expires = (window + 1) * 3600;
  const counters = [
    {key: `property-front:${op.ownerId}:${op.actor.userId}:${window}`, max: 30},
    {key: `property-front-target:${op.ownerId}:${propertyId}:${window}`, max: 15},
  ];
  for (const counter of counters) {
    const result = await db().prepare(`INSERT INTO visit_rate_limits (id,attempts,expires_at) VALUES (?,1,?)
      ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts`).bind(counter.key, expires).first<{attempts: number}>();
    if (!result || result.attempts > counter.max) throw new RequestError('Muitos envios de foto. Aguarde até uma hora e tente novamente.', 429);
  }
  await db().prepare(`DELETE FROM visit_rate_limits WHERE id IN (SELECT id FROM visit_rate_limits
    WHERE expires_at<? AND (id LIKE 'property-front:%' OR id LIKE 'property-front-target:%') LIMIT 100)`).bind(now - 3600).run();
}

export async function savePropertyFrontPhoto(op: Operator, form: FormData) {
  await recheckOperator(op);
  const {propertyId, requestId, expected, suppliedReason, reason} = validateFields(form);
  // The internal previous pointer is audit data only. It must never enter a response.
  const original = await first(`SELECT p.id,p.revision,p.archived_at,p.front_photo_asset_id,
    a.id authorized_photo_id FROM properties p LEFT JOIN property_front_photo_assets a
      ON a.id=p.front_photo_asset_id AND a.owner_id=p.owner_id AND a.property_id=p.id
    WHERE p.id=? AND p.owner_id=?`, propertyId, op.ownerId);
  if (!original) throw missingProperty();
  let photo: Awaited<ReturnType<typeof readPropertyFrontPhoto>>;
  try { photo = await readPropertyFrontPhoto(form, sanitizePhoto); }
  catch (error) { if (error instanceof PropertyFrontPhotoError) throw new RequestError(error.message); throw error; }
  const requestFingerprint = await fingerprint({
    owner: op.ownerId, actor: op.actor.userId, property_id: propertyId,
    expected_revision: expected, reason, content_type: photo.contentType, sha256: photo.sha256,
  });
  async function replay() {
    await recheckOperator(op);
    const prior = await first(`SELECT a.id,a.property_id,a.property_revision,a.created_at,a.request_fingerprint
      FROM property_front_photo_assets a JOIN properties p ON p.id=a.property_id AND p.owner_id=a.owner_id
      WHERE a.owner_id=? AND a.request_id=?`, op.ownerId, requestId);
    if (!prior) return null;
    if (prior.request_fingerprint !== requestFingerprint || prior.property_id !== propertyId) {
      throw new RequestError('Este formulário já foi usado com outros dados. Abra uma nova edição.', 409);
    }
    return {id: propertyId, revision: prior.property_revision as number, front_photo: visiblePhoto(prior), alreadySaved: true};
  }
  const prior = await replay();
  if (prior) return prior;
  if (original.archived_at !== null) throw new RequestError('Restaure o imóvel antes de alterar a foto.', 409);
  if (original.revision !== expected) throw conflict();
  if (original.authorized_photo_id && !suppliedReason) throw new RequestError('Informe o motivo da troca da foto.');
  await limitUpload(op, propertyId);
  await recheckOperator(op);
  const regional = isRegionalRequest(), guard = operatorGuard(op);
  const assetId = crypto.randomUUID(), objectKey = `property-front/${op.ownerId}/${propertyId}/${assetId}`;
  const now = new Date().toISOString();
  const mutation = db().prepare(`UPDATE properties SET front_photo_asset_id=?,revision=revision+1
    WHERE id=? AND owner_id=? AND revision=? AND archived_at IS NULL${regional ? " AND state_code='PA'" : ''}
    AND ${guard.sql} AND NOT EXISTS(SELECT 1 FROM property_front_photo_assets WHERE request_id=?)`)
    .bind(assetId, propertyId, op.ownerId, expected, ...guard.args, requestId);
  // The marker is from this transaction. Do not repeat a regional epoch guard after an UPDATE trigger.
  const insert = db().prepare(`INSERT INTO property_front_photo_assets
    (id,owner_id,property_id,state_code,worksite_id,object_key,content_type,size,sha256,created_at,
     uploaded_by_user_id,uploaded_by_name,reason,property_revision,previous_asset_id,request_id,request_fingerprint)
    SELECT ?,p.owner_id,p.id,p.state_code,p.worksite_id,?,?,?,?,?,?,?,?,p.revision,?,?,?
    FROM properties p WHERE p.id=? AND p.owner_id=? AND p.front_photo_asset_id=? AND p.revision=?`)
    .bind(assetId, objectKey, photo.contentType, photo.size, photo.sha256, now, op.actor.userId,
      op.actor.fullName || op.actor.displayName, reason, original.front_photo_asset_id || null, requestId, requestFingerprint,
      propertyId, op.ownerId, assetId, expected + 1);
  let needsCleanup = false, batchAttempted = false, batchReturned = false;
  try {
    // A put with a lost response may have stored bytes, so mark it before awaiting R2.
    needsCleanup = true;
    await bucket().put(objectKey, photo.bytes, {httpMetadata: {contentType: photo.contentType, cacheControl: 'private, no-store'}});
    batchAttempted = true;
    const result = await db().batch([mutation, insert]);
    batchReturned = true;
    if (!result[0]?.meta || result[0].meta.changes < 1) {
      await recheckOperator(op);
      const repeated = await replay();
      if (repeated) return repeated;
      throw conflict();
    }
    // A confirmed mutation owns its upload even if access changes before replay.
    needsCleanup = false;
    // Positive D1 changes alone is not proof that a readable asset row exists.
    await recheckOperator(op);
    const committed = await replay();
    if (!committed) throw missingPhoto();
    needsCleanup = false;
    return {...committed, alreadySaved: false};
  } catch (error) {
    // Recover a successful transaction whose response was lost, without bypassing current ACLs.
    if (!(error instanceof RequestError)) {
      try { await recheckOperator(op); const repeated = await replay(); if (repeated) return repeated; }
      catch (replayError) { if (replayError instanceof RequestError) throw replayError; }
    }
    throw error;
  } finally {
    // A lost batch response can hide a late commit. Preserve its upload rather than infer rollback.
    if (needsCleanup && (!batchAttempted || batchReturned)) {
      try {
        // The only raw content-table read: existence only, our fresh UUID+owner+property only.
        // Preserve the object if committed even when ACL changes make scoped replay invisible.
        const committed = await db().prepare(`SELECT 1 present FROM property_front_photo_assets
          WHERE id=? AND owner_id=? AND property_id=?`).bind(assetId, op.ownerId, propertyId).first();
        if (!committed) await bucket().delete(objectKey);
      } catch { console.error('Property front photo temporary cleanup deferred'); }
    }
  }
}

/** Management only. Historical assets remain usable through the same live property/asset ACL. */
export async function privatePropertyFrontPhoto(op: Operator, id: string) {
  await recheckOperator(op);
  if (!UUID.test(id)) throw missingPhoto();
  const readAsset = () => first(`SELECT a.id,a.property_id,a.object_key,a.content_type,a.size
    FROM property_front_photo_assets a JOIN properties p ON p.id=a.property_id AND p.owner_id=a.owner_id
    WHERE a.id=? AND a.owner_id=?`, id, op.ownerId);
  const asset = await readAsset();
  if (!asset || !PHOTO_TYPES.has(asset.content_type) || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > FRONT_PHOTO_LIMIT) throw missingPhoto();
  const object = await bucket().get(asset.object_key);
  if (!object) throw missingPhoto();
  if (object.size > FRONT_PHOTO_LIMIT) throw missingPhoto();
  const input = await object.arrayBuffer();
  if (input.byteLength > FRONT_PHOTO_LIMIT) throw missingPhoto();
  let bytes: Uint8Array;
  try { bytes = sanitizePhoto(input, asset.content_type); } catch { throw missingPhoto(); }
  await recheckOperator(op);
  const current = await readAsset();
  if (!current || current.property_id !== asset.property_id || current.object_key !== asset.object_key || current.content_type !== asset.content_type) throw missingPhoto();
  return new Response(new Uint8Array(bytes).buffer, {headers: {...PRIVATE_FRONT_PHOTO_HEADERS, 'Content-Type': asset.content_type}});
}
