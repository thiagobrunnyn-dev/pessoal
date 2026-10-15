import {BRAZIL_STATES} from './brazil-states';
import {RequestError} from './http-security';

export type VehicleAction = 'create' | 'update' | 'archive' | 'restore';
export type VehicleFields = {plate: string; brand: string | null; model: string | null; year: number | null; state_code: string | null};
export type VehicleSnapshot = VehicleFields & {revision: number; archived_at: string | null};
export type Vehicle = VehicleSnapshot & {id: string; created_at: string; updated_at: string};
export type VehicleEvent = {id: string; action: VehicleAction; revision: number; before_snapshot: VehicleSnapshot | null; after_snapshot: VehicleSnapshot; reason: string; actor_name: string; created_at: string};
export const VEHICLE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VEHICLE_CONFLICT = 'Não foi possível salvar este cadastro. Confira a placa e atualize a lista.';

export function vehicleText(form: FormData, key: string, max: number, required = false) {
  const values = form.getAll(key);
  if (values.length > 1 || values.some(value => typeof value !== 'string')) throw new RequestError('Confira os campos do veículo.');
  const value = (values[0] as string | undefined)?.trim() || '';
  if (value.length > max || required && !value) throw new RequestError('Confira os campos obrigatórios e o tamanho dos dados.');
  return value;
}

export function normalizePlate(value: string) {
  const plate = value.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(plate)) throw new RequestError('Informe uma placa válida, como ABC1234 ou ABC1D23.');
  return plate;
}

export function readVehicleFields(form: FormData, regional: boolean): VehicleFields {
  const plate = normalizePlate(vehicleText(form, 'plate', 20, true));
  const brand = vehicleText(form, 'brand', 100) || null;
  const model = vehicleText(form, 'model', 100) || null;
  const rawYear = vehicleText(form, 'year', 4);
  if (rawYear && (!/^\d{4}$/.test(rawYear) || Number(rawYear) < 1886 || Number(rawYear) > new Date().getUTCFullYear() + 1)) throw new RequestError('Informe um ano válido ou deixe o campo vazio.');
  const inputState = vehicleText(form, 'state_code', 2).toUpperCase();
  if (inputState && !Object.hasOwn(BRAZIL_STATES, inputState)) throw new RequestError('Selecione uma UF válida.');
  if (regional && inputState !== 'PA') throw new RequestError('Este acesso mantém os veículos no Pará.', 403);
  return {plate, brand, model, year: rawYear ? Number(rawYear) : null, state_code: regional ? 'PA' : inputState || null};
}

export function vehicleSnapshot(row: VehicleSnapshot): VehicleSnapshot {
  return {plate: row.plate, brand: row.brand, model: row.model, year: row.year, state_code: row.state_code, revision: row.revision, archived_at: row.archived_at};
}

export async function vehicleDigest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
