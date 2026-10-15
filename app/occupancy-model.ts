import type {OccupancyDetail, OccupancyMetrics, OccupancyPropertySummary, OccupancyRoom, OccupancyStay} from '../lib/occupancy';

export type OccupancyEntry =
  | {action: 'room_create'}
  | {action: 'room_update'; room: OccupancyRoom}
  | {action: 'check_in'; room: OccupancyRoom}
  | {action: 'check_out'; stay: OccupancyStay}
  | {action: 'plan_checkout'; stay: OccupancyStay};

export type OccupancyDraft = {
  name: string; capacity: string; capacityConfirmed: boolean;
  personId: string; slot: string; shift: string; entryOn: string; entryUnknown: boolean; exitOn: string; plannedExitOn: string; confirmed: boolean;
};

export const occupancyText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export const occupancyError = (cause: unknown) => cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.';
export const occupancyPropertyUrl = (id: string) => '/imoveis/' + encodeURIComponent(id);
export const occupancyDate = (value: string | null) => value === null ? 'não informada' : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;

export function occupancyTotals(properties: OccupancyPropertySummary[]): OccupancyMetrics {
  const complete = properties.length > 0 && properties.every(property => property.capacity_total !== null);
  const confirmed = properties.reduce((total, property) => total + property.confirmed_capacity, 0);
  const occupied = properties.reduce((total, property) => total + property.occupied_count, 0);
  const capacity = complete ? properties.reduce((total, property) => total + (property.capacity_total ?? 0), 0) : null;
  return {
    room_count: properties.reduce((total, property) => total + property.room_count, 0),
    capacity_total: capacity, confirmed_capacity: confirmed,
    unknown_rooms: properties.reduce((total, property) => total + property.unknown_rooms, 0),
    occupied_count: occupied, available_count: capacity === null ? null : capacity - occupied,
    occupancy_rate: capacity === null || capacity === 0 ? null : occupied / capacity * 100,
  };
}

export function occupancySlots(room: OccupancyRoom, stays: OccupancyStay[]): number[] {
  if (room.capacity === null || !room.capacity_confirmed || !Number.isInteger(room.capacity) || room.capacity < 0 || room.capacity > 200) return [];
  const occupied = new Set(stays.filter(stay => stay.room_id === room.id && stay.exit_on === null).map(stay => stay.slot_number));
  // The API may cap long lists. Never infer a free slot from an incomplete roster.
  if (occupied.size !== room.occupied_count || [...occupied].some(slot => !Number.isInteger(slot) || slot < 1 || slot > room.capacity!)) return [];
  return Array.from({length: room.capacity}, (_, index) => index + 1).filter(slot => !occupied.has(slot));
}

export function makeOccupancyDraft(entry: OccupancyEntry, today: string): OccupancyDraft {
  const room = entry.action === 'room_update' ? entry.room : null;
  return {name: room?.name ?? '', capacity: room?.capacity == null ? '' : String(room.capacity), capacityConfirmed: false,
    personId: '', slot: '', shift: '', entryOn: '', entryUnknown: false, exitOn: today, plannedExitOn: 'stay' in entry ? entry.stay.planned_exit_on || '' : '', confirmed: false};
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function occupancyDraftIssue(entry: OccupancyEntry, draft: OccupancyDraft, data: OccupancyDetail): string {
  if (data.property.archived_at) return 'Este imóvel está arquivado. Os registros ficam disponíveis para consulta.';
  if ('room' in entry && entry.room.scope_changed || 'stay' in entry && entry.stay.scope_changed) return 'Este registro pertence à região anterior do imóvel e está disponível para consulta.';
  if (entry.action === 'room_create' || entry.action === 'room_update') {
    if (!draft.name.trim()) return 'Informe o nome do quarto.';
    if (draft.name.trim().length > 100) return 'Use até 100 caracteres no nome do quarto.';
    if (draft.capacity.trim() !== '') {
      if (!/^\d+$/.test(draft.capacity.trim()) || Number(draft.capacity) > 200) return 'Informe uma capacidade inteira de 0 a 200 vagas, ou deixe em branco.';
      if (!draft.capacityConfirmed) return 'Confirme a capacidade operacional informada para este quarto.';
      if (entry.action === 'room_update' && data.stays.some(stay => stay.room_id === entry.room.id && stay.exit_on === null && stay.slot_number > Number(draft.capacity))) {
        return 'Há uma pessoa em vaga acima desta capacidade. Registre a saída antes de reduzir as vagas.';
      }
    } else if (entry.action === 'room_update' && entry.room.occupied_count > 0) {
      return 'Este quarto tem pessoas hospedadas. Mantenha a capacidade confirmada enquanto houver ocupação.';
    }
  }
  if (entry.action === 'check_in') {
    if (!entry.room.capacity_confirmed || entry.room.capacity === null) return 'Confirme a capacidade do quarto antes de registrar uma entrada.';
    if (!data.people.some(person => person.id === draft.personId)) return 'Selecione uma pessoa ativa do cadastro.';
    if (!/^\d+$/.test(draft.slot) || !occupancySlots(entry.room, data.stays).includes(Number(draft.slot))) return 'Selecione uma vaga disponível neste quarto.';
    if (!draft.entryUnknown && (!validDate(draft.entryOn) || draft.entryOn > data.today)) return 'Informe uma data de entrada válida, até hoje.';
    if (draft.shift.trim().length > 80) return 'Use até 80 caracteres no turno.';
  }
  if ((entry.action === 'check_in' || entry.action === 'plan_checkout') && draft.plannedExitOn && (!validDate(draft.plannedExitOn) || draft.plannedExitOn < data.today)) return 'A previsão de saída deve ser uma data válida de hoje em diante.';
  if (entry.action === 'plan_checkout' && draft.plannedExitOn === (entry.stay.planned_exit_on || '')) return 'Altere a previsão ou limpe a data para retirar a previsão.';
  if (entry.action === 'check_out') {
    if (entry.stay.exit_on !== null) return 'Esta saída já foi registrada. Atualize a consulta.';
    if (!validDate(draft.exitOn) || draft.exitOn < (entry.stay.entry_on || new Intl.DateTimeFormat('en-CA',{timeZone:'America/Belem'}).format(new Date(entry.stay.recorded_at))) || draft.exitOn > data.today) return 'A saída deve ser na data da entrada ou depois dela, até hoje.';
  }
  return draft.confirmed ? '' : 'Confira os dados e marque a confirmação antes de salvar.';
}

export function occupancyPayload(entry: OccupancyEntry, draft: OccupancyDraft, data: OccupancyDetail) {
  const base = {action: entry.action, property_id: data.property.id, property_revision: data.property.revision, confirmed: true};
  if (entry.action === 'room_create' || entry.action === 'room_update') {
    return {...base, ...(entry.action === 'room_update' ? {room_id: entry.room.id, expected_revision: entry.room.revision} : {}),
      name: draft.name.trim(), capacity: draft.capacity.trim() === '' ? null : Number(draft.capacity), capacity_confirmed: draft.capacity.trim() !== '' && draft.capacityConfirmed};
  }
  if (entry.action === 'check_in') {
    const person = data.people.find(item => item.id === draft.personId);
    return {...base, room_id: entry.room.id, expected_revision: entry.room.revision, person_profile_id: draft.personId,
      person_revision: person?.revision, slot_number: Number(draft.slot), shift: draft.shift.trim(), entry_on: draft.entryUnknown?null:draft.entryOn, ...(draft.entryUnknown?{entry_unknown:true}:{}), exit_on: null, planned_exit_on: draft.plannedExitOn || null};
  }
  if (entry.action === 'plan_checkout') return {...base, stay_id: entry.stay.id, expected_revision: entry.stay.revision, planned_exit_on: draft.plannedExitOn || null};
  return {...base, stay_id: entry.stay.id, expected_revision: entry.stay.revision, exit_on: draft.exitOn};
}
