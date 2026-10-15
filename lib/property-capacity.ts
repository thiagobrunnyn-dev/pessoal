/** Current property registration only. Never infer or rewrite historical handovers. */
import {PropertyDetailsError} from './property-details';
export const PROPERTY_LEVELS = {
  operational: 'OPERACIONAL', technical: 'TÉCNICO', foreman: 'ENCARREGADO', staff: 'STAFF',
  engineering_coordination: 'ENGENHARIA E COORDENAÇÃO', supervisors: 'SUPERVISORES',
} as const;
export type PropertyLevel = keyof typeof PROPERTY_LEVELS;
export type PropertyCapacity = {property_level: PropertyLevel | null; declared_slots: number | null};
export function propertyLevel(value: unknown): PropertyLevel | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !Object.hasOwn(PROPERTY_LEVELS, value)) throw new PropertyDetailsError('Selecione um nível válido ou deixe não informado.');
  return value as PropertyLevel;
}
export function declaredSlots(value: unknown): number | null {
  if (value === undefined || value === null || typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) value = Number(value.trim());
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new PropertyDetailsError('Informe a quantidade total de vagas como inteiro a partir de zero ou deixe vazia.');
  return value === 0 ? 0 : value;
}
export function propertyCapacity(input: Record<string, unknown>, previous: PropertyCapacity = {property_level:null,declared_slots:null}): PropertyCapacity {
  return {property_level:Object.hasOwn(input,'property_level')?propertyLevel(input.property_level):previous.property_level,
    declared_slots:Object.hasOwn(input,'declared_slots')?declaredSlots(input.declared_slots):previous.declared_slots};
}
export function propertyCapacityFromForm(form: FormData): PropertyCapacity {
  const input: Record<string,unknown> = {};
  for(const key of ['property_level','declared_slots']) {
    if(form.getAll(key).length > 1) throw new PropertyDetailsError('Envie nível e quantidade total de vagas uma vez cada.');
    if(form.has(key)) input[key] = form.get(key);
  }
  return propertyCapacity(input);
}
export const propertyLevelLabel = (value: unknown) => typeof value === 'string' && Object.hasOwn(PROPERTY_LEVELS,value) ? PROPERTY_LEVELS[value as PropertyLevel] : 'Não informado';
export const propertyCapacityDiffers = (declared: number | null | undefined, rooms: number | null | undefined) => declared != null && rooms != null && declared !== rooms;
/** Correlated to an authorized properties alias p. Only current-scope, fully confirmed rooms form a known total. */
export const CONFIRMED_ROOM_CAPACITY_SQL = `(SELECT CASE WHEN count(*)>0 AND count(*)=count(CASE WHEN r.capacity_confirmed=1 AND r.capacity IS NOT NULL THEN 1 END) THEN sum(r.capacity) ELSE NULL END FROM occupancy_rooms r WHERE r.property_id=p.id AND r.owner_id=p.owner_id AND r.state_code IS p.state_code AND r.worksite_id IS p.worksite_id AND r.scope_version=COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0))`;
