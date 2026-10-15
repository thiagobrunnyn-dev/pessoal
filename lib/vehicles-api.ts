import type {Operator} from './app-access';
import {boundedForm, requireSameOrigin, RequestError} from './http-security';
import {readVehicleFields, vehicleDigest, vehicleSnapshot, vehicleText, VEHICLE_CONFLICT, VEHICLE_UUID, type Vehicle, type VehicleAction, type VehicleSnapshot} from './vehicles';

type Guard = {sql: string; args: unknown[]};
export type VehicleDependencies = {
  getOperator: () => Promise<Operator | null>;
  recheckOperator: (op: Operator) => Promise<void>;
  operatorGuard: (op: Operator) => Guard;
  isRegionalRequest: () => boolean;
  first: <T>(sql: string, ...args: unknown[]) => Promise<T | null>;
  all: <T>(sql: string, ...args: unknown[]) => Promise<T[]>;
  db: () => D1Database;
  noCache: Record<string, string>;
};
type StoredEvent = {id: string; vehicle_id: string; revision: number; request_fingerprint: string};
type HistoryEvent = {id: string; action: VehicleAction; revision: number; before_snapshot: string; after_snapshot: string; reason: string; actor_name: string; created_at: string};
const columns = 'id,plate,brand,model,year,state_code,revision,archived_at,created_at,updated_at';
const pageSize = 50;

export function createVehiclesApi(d: VehicleDependencies) {
  const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: d.noCache});
  const target = (id: string, op: Operator) => d.first<Vehicle>('SELECT ' + columns + ' FROM vehicles WHERE id=? AND owner_id=?', id, op.ownerId);
  async function assertAccess(op: Operator) {
    await d.recheckOperator(op);
    const guard = d.operatorGuard(op);
    if (!await d.first('SELECT 1 permitted WHERE ' + guard.sql, ...guard.args)) throw new RequestError('O acesso ou cadastro mudou. Atualize a página.', 409);
  }
  async function GET(request: Request) {
    try {
      const op = await d.getOperator();
      if (!op) return reply({error: 'Acesso restrito à gestão autorizada.'}, 401);
      const query = new URL(request.url).searchParams;
      for (const key of query.keys()) if (!['id', 'history', 'status', 'q', 'page'].includes(key) || query.getAll(key).length !== 1) throw new RequestError('Consulta inválida.');
      const id = query.get('id');
      if (id) {
        if (!VEHICLE_UUID.test(id)) throw new RequestError('Veículo não encontrado.', 404);
        const vehicle = await target(id, op);
        if (!vehicle) throw new RequestError('Veículo não encontrado.', 404);
        const events = query.get('history') === 'yes' ? await d.all<HistoryEvent>('SELECT id,action,revision,before_snapshot,after_snapshot,reason,actor_name,created_at FROM vehicle_events WHERE vehicle_id=? AND owner_id=? ORDER BY revision DESC LIMIT 101', id, op.ownerId) : [];
        await assertAccess(op);
        return reply({vehicle, events: events.slice(0, 100).map(event => ({...event, before_snapshot: JSON.parse(event.before_snapshot), after_snapshot: JSON.parse(event.after_snapshot)})), history_limited: events.length > 100});
      }
      const status = query.get('status') || 'active';
      const search = (query.get('q') || '').trim();
      const rawPage = query.get('page') || '0';
      if (!['active', 'archived', 'all'].includes(status) || search.length > 100 || !/^\d{1,5}$/.test(rawPage)) throw new RequestError('Confira os filtros da lista.');
      const page = Number(rawPage), args: unknown[] = [op.ownerId];
      let where = 'owner_id=?';
      if (status !== 'all') where += status === 'active' ? ' AND archived_at IS NULL' : ' AND archived_at IS NOT NULL';
      if (search) {
        const term = '%' + search.replace(/[\\%_]/g, character => '\\' + character) + '%';
        const plateTerm = '%' + search.toUpperCase().replace(/[\s-]/g, '').replace(/[\\%_]/g, character => '\\' + character) + '%';
        where += " AND (plate LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\' OR state_code LIKE ? ESCAPE '\\')";
        args.push(plateTerm, term, term, term);
      }
      const vehicles = await d.all<Vehicle>('SELECT ' + columns + ' FROM vehicles WHERE ' + where + ' ORDER BY plate,id LIMIT ? OFFSET ?', ...args, pageSize + 1, page * pageSize);
      await assertAccess(op);
      return reply({vehicles: vehicles.slice(0, pageSize), regional: d.isRegionalRequest(), page, has_more: vehicles.length > pageSize});
    } catch (error) {
      return reply({error: error instanceof RequestError ? error.message : 'Não foi possível carregar os veículos.'}, error instanceof RequestError ? error.status : 503);
    }
  }

  async function POST(request: Request) {
    try {
      const op = await d.getOperator();
      if (!op) return reply({error: 'Acesso restrito à gestão autorizada.'}, 401);
      requireSameOrigin(request);
      const form = await boundedForm(request, 16 * 1024);
      const action = vehicleText(form, 'action', 20, true) as VehicleAction;
      const id = vehicleText(form, 'id', 80, true);
      const requestId = vehicleText(form, 'request_id', 80, true);
      const rawRevision = vehicleText(form, 'expected_revision', 16, true);
      const expected = Number(rawRevision);
      const reason = vehicleText(form, 'reason', 1000) || (action === 'create' ? 'Cadastro inicial' : '');
      if (!['create', 'update', 'archive', 'restore'].includes(action) || !VEHICLE_UUID.test(id) || !VEHICLE_UUID.test(requestId) || !/^\d+$/.test(rawRevision) || !Number.isSafeInteger(expected) || expected < 0 || action === 'create' && expected !== 0 || action !== 'create' && expected < 1 || form.get('confirmed') !== 'yes' || !reason) throw new RequestError('Confira os dados e confirme a alteração.');
      const editing = action === 'create' || action === 'update';
      const allowed = new Set(['action', 'id', 'request_id', 'expected_revision', 'reason', 'confirmed', ...(editing ? ['plate', 'brand', 'model', 'year', 'state_code'] : [])]);
      for (const [key, value] of form.entries()) if (!allowed.has(key) || form.getAll(key).length !== 1 || typeof value !== 'string') throw new RequestError('Envie somente os campos do veículo.');
      await assertAccess(op);
      const regional = d.isRegionalRequest();
      const fields = editing ? readVehicleFields(form, regional) : null;
      const original = action === 'create' ? null : await target(id, op);
      if (action !== 'create' && !original) throw new RequestError('Veículo não encontrado.', 404);
      const fingerprint = await vehicleDigest(JSON.stringify({action, id, expected_revision: expected, reason, actor: op.actor.userId, fields}));
      async function replay() {
        const prior = await d.first<StoredEvent>('SELECT id,vehicle_id,revision,request_fingerprint FROM vehicle_events WHERE owner_id=? AND request_id=?', op!.ownerId, requestId);
        if (!prior) return null;
        if (prior.request_fingerprint !== fingerprint || prior.vehicle_id !== id) throw new RequestError(VEHICLE_CONFLICT, 409);
        if (!await target(id, op!)) throw new RequestError('Veículo não encontrado.', 404);
        await assertAccess(op!);
        return reply({id, revision: prior.revision, event_id: prior.id, alreadySaved: true});
      }
      const previous = await replay();
      if (previous) return previous;
      if (original && original.revision !== expected) throw new RequestError('Este cadastro mudou em outra sessão. Atualize antes de salvar.', 409);
      if (original && regional && original.state_code !== 'PA') throw new RequestError('Veículo não encontrado.', 404);
      if (original && (action === 'archive' && original.archived_at || action === 'restore' && !original.archived_at)) {
        await assertAccess(op);
        return reply({id, revision: original.revision, unchanged: true});
      }
      const now = new Date().toISOString(), eventId = crypto.randomUUID();
      const before = original ? vehicleSnapshot(original) : null;
      const after: VehicleSnapshot = { ...(fields || before!), revision: expected + 1, archived_at: action === 'archive' ? now : action === 'restore' ? null : before?.archived_at || null};
      const guard = d.operatorGuard(op);
      const safe = guard.sql + ' AND NOT EXISTS(SELECT 1 FROM vehicle_events WHERE owner_id=? AND request_id=?)';
      const safeArgs = [...guard.args, op.ownerId, requestId];
      const mutation = action === 'create'
        ? d.db().prepare('INSERT INTO vehicles (id,owner_id,plate,brand,model,year,state_code,revision,archived_at,last_event_id,created_by,created_at,updated_by,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ' + safe + ' AND NOT EXISTS(SELECT 1 FROM vehicles WHERE id=? OR (owner_id=? AND plate=?))').bind(id, op.ownerId, after.plate, after.brand, after.model, after.year, after.state_code, after.revision, after.archived_at, eventId, op.actor.userId, now, op.actor.userId, now, ...safeArgs, id, op.ownerId, after.plate)
        : d.db().prepare('UPDATE vehicles SET plate=?,brand=?,model=?,year=?,state_code=?,revision=?,archived_at=?,last_event_id=?,updated_by=?,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND state_code IS ?' + (regional ? " AND state_code='PA'" : '') + ' AND ' + safe + ' AND NOT EXISTS(SELECT 1 FROM vehicles WHERE owner_id=? AND plate=? AND id<>?)').bind(after.plate, after.brand, after.model, after.year, after.state_code, after.revision, after.archived_at, eventId, op.actor.userId, now, id, op.ownerId, expected, before!.state_code, ...safeArgs, op.ownerId, after.plate, id);
      const event = d.db().prepare('INSERT INTO vehicle_events (id,owner_id,vehicle_id,revision,action,state_code,previous_state_code,before_snapshot,after_snapshot,reason,actor_user_id,actor_name,request_id,request_fingerprint,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM vehicles WHERE id=? AND owner_id=? AND last_event_id=?)').bind(eventId, op.ownerId, id, after.revision, action, after.state_code, before?.state_code || null, JSON.stringify(before), JSON.stringify(after), reason, op.actor.userId, op.actor.fullName || op.actor.displayName || 'Gestão autorizada', requestId, fingerprint, now, id, op.ownerId, eventId);
      let changes: number;
      try {
        const result = await d.db().batch([mutation, event]);
        changes = result[0].meta.changes;
      } catch (error) {
        if (String(error).includes('UNIQUE constraint failed')) {
          const raced = await replay();
          if (raced) return raced;
          throw new RequestError(VEHICLE_CONFLICT, 409);
        }
        throw error;
      }
      if (!changes) {
        const raced = await replay();
        if (raced) return raced;
        throw new RequestError(VEHICLE_CONFLICT, 409);
      }
      await assertAccess(op);
      return reply({id, revision: after.revision, event_id: eventId});
    } catch (error) {
      return reply({error: error instanceof RequestError ? error.message : 'Não foi possível confirmar o salvamento. Mantenha o formulário e tente novamente.'}, error instanceof RequestError ? error.status : 503);
    }
  }
  return {GET, POST};
}
