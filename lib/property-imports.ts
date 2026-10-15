import {BRAZIL_STATES} from './brazil-states';
import {RequestError} from './http-security';

export const PROPERTY_IMPORT_FORMAT = 'mbl-properties-v1';
export const PROPERTY_IMPORT_BODY_LIMIT = 256 * 1024;
export const PROPERTY_IMPORT_ROW_LIMIT = 100;
export const PROPERTY_IMPORT_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
};
export type ImportIssue = {code: string; message: string};
export type ImportNormalized = {
  name: string; address: string; city: string | null; state_code: string | null;
  source_company: string | null; source_slots: number | null;
  source_delivered_on: string | null; source_reference: string | null;
};
export type ImportDuplicate = {kind: 'row' | 'property'; id: string; control_number?: number};
export type ImportRow = {
  row_id: string; position: number; source_key: string;
  status: 'valid' | 'duplicate' | 'invalid'; original: Record<string, unknown>;
  normalized: ImportNormalized; issues: ImportIssue[]; duplicate_of: ImportDuplicate | null;
  result: {status: 'pending' | 'created' | 'ignored'; property_id: string | null; control_number: number | null};
};
export type ImportView = {
  batch_id: string; status: 'preview' | 'completed'; review_hash: string;
  created_at: string; completed_at: string | null;
  summary: {total: number; valid: number; duplicate: number; invalid: number; created: number; ignored: number};
  rows: ImportRow[];
};
export class ImportError extends RequestError {
  constructor(message: string, status = 400, public code?: string) {super(message, status);}
}
export const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new ImportError('A solicitação contém campos não permitidos.');
}
export function requestId(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(value)) throw new ImportError('Identificador da solicitação inválido.');
  return value;
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (isObject(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : stableJson(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
// Keep token boundaries and every digit: 12/3 must never collapse into 123.
// No abbreviations, company/name matching, geocoding, or fuzzy merging.
export function addressKey(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function trailingPlaceIndex(address: string, place: string) {
  const target = addressKey(place);
  if (!target) return -1;
  const full = addressKey(address);
  if (full !== target && !full.endsWith(' ' + target)) return -1;
  for (let index = 0; index < address.length; index++) {
    if (index && !/[\s\p{P}]/u.test(address[index - 1])) continue;
    if (addressKey(address.slice(index)) === target) return index;
  }
  return -1;
}
function splitStateSuffix(address: string) {
  // Only explicit UF abbreviations are unambiguous here: names such as
  // Rio de Janeiro and São Paulo can be the city and must remain in the key.
  for (const code of Object.keys(BRAZIL_STATES)) {
    const index = trailingPlaceIndex(address, code);
    if (index <= 0) continue;
    const base = address.slice(0, index).replace(/[\s,;/–—-]+$/u, '');
    // A terminal unit label can coincide with a UF; preserve it as a unit.
    if (/\b(?:apto|apartamento|lote|quadra|bloco|casa|sala|andar|rua|avenida)\.?$/iu.test(base)) continue;
    return {base, suffix: address.slice(index).replace(/^[\s,;/–—-]+/u, ''), code};
  }
  return {base: address, suffix: null, code: null};
}
// Properties have one address column. Include only explicitly supplied place data,
// while retaining source spelling and never assigning a UF from address/city text.
export function composeImportAddress(address: string, city: string | null, state: string | null) {
  if (!address) return {address, conflict: false};
  const parts = splitStateSuffix(address);
  let result = address;
  if (city && trailingPlaceIndex(parts.base, city) < 0) {
    result = [parts.base, city, parts.suffix].filter(Boolean).join(', ');
  }
  if (state && !parts.suffix) result += ', ' + state;
  return {address: result, conflict: !!(state && parts.code && state !== parts.code)};
}
function placeKeys(address: string, city: string | null) {
  const withoutState = splitStateSuffix(address).base;
  const cityIndex = city ? trailingPlaceIndex(withoutState, city) : -1;
  return {key: addressKey(withoutState), baseKey: addressKey(cityIndex > 0 ? withoutState.slice(0, cityIndex) : withoutState), city: city ? addressKey(city) : null};
}
const rowKeys = ['source_key', 'name', 'address', 'city', 'state_code', 'source_company', 'source_slots', 'source_delivered_on', 'source_reference'];
export function readDocument(value: unknown) {
  if (!isObject(value)) throw new ImportError('Selecione um arquivo JSON de imóveis.');
  exactKeys(value, ['format', 'rows']);
  if (value.format !== PROPERTY_IMPORT_FORMAT || !Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > PROPERTY_IMPORT_ROW_LIMIT || value.rows.some(row => !isObject(row))) {
    throw new ImportError('O arquivo deve usar mbl-properties-v1 e conter de 1 a 100 linhas.');
  }
  return {format: PROPERTY_IMPORT_FORMAT, rows: value.rows as Record<string, unknown>[]};
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return !isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function normalizeRows(originals: Record<string, unknown>[]): ImportRow[] {
  const rows = originals.map((original, index): ImportRow => {
    const issues: ImportIssue[] = [];
    const error = (code: string, message: string) => issues.push({code, message});
    const field = (key: string, max: number, required = false) => {
      const raw = original[key];
      if (raw == null && !required) return null;
      if (typeof raw !== 'string') {error('invalid_' + key, 'Confira o campo ' + key + '.'); return required ? '' : null;}
      const text = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
      if (text.length > max || (required && !text)) error('invalid_' + key, 'Confira o campo ' + key + ' (limite de ' + max + ' caracteres).');
      return text || (required ? '' : null);
    };
    if (Object.keys(original).some(key => !rowKeys.includes(key))) error('unexpected_fields', 'A linha contém campos não permitidos. Não informe códigos ou vínculos do imóvel.');
    const source_key = field('source_key', 120, true) || '';
    const name = field('name', 120, true) || '';
    const address = field('address', 300, true) || '';
    if (address && !addressKey(address)) error('invalid_address', 'Informe um endereço identificável.');
    const state = field('state_code', 2);
    const state_code = state?.toUpperCase() || null;
    if (state_code && !Object.hasOwn(BRAZIL_STATES, state_code)) error('invalid_state_code', 'A UF deve ser uma sigla brasileira válida ou ficar vazia.');
    const source_delivered_on = field('source_delivered_on', 10);
    if (source_delivered_on && !validDate(source_delivered_on)) error('invalid_source_delivered_on', 'Confira a data de origem no formato AAAA-MM-DD.');
    const slots = original.source_slots;
    if (slots != null && (typeof slots !== 'number' || !Number.isSafeInteger(slots) || slots < 0 || slots > 100000)) error('invalid_source_slots', 'As vagas de origem devem ser um número inteiro entre 0 e 100000 ou ficar vazias.');
    const city = field('city', 120);
    const composed = composeImportAddress(address, city, state_code);
    if (composed.conflict) error('state_address_conflict', 'A UF informada diverge da UF escrita no endereço. Confira a origem.');
    if (composed.address.length > 300) error('invalid_address', 'O endereço completo, incluindo cidade e UF, deve ter até 300 caracteres.');
    const normalized: ImportNormalized = {name, address: composed.address, city, state_code,
      source_company: field('source_company', 200), source_slots: typeof slots === 'number' ? slots : null,
      source_delivered_on, source_reference: field('source_reference', 300)};
    const status = issues.length ? 'invalid' : 'valid';
    if (!state_code) issues.push({code: 'state_missing', message: 'UF não informada: cadastro visível somente à gestão geral até ser revisado.'});
    return {row_id: crypto.randomUUID(), position: index + 1, source_key, original, normalized, status,
      issues, duplicate_of: null, result: {status: 'pending', property_id: null, control_number: null}};
  });
  const frequencies = new Map<string, number>();
  for (const row of rows) frequencies.set(row.source_key, (frequencies.get(row.source_key) || 0) + 1);
  for (const row of rows) if (row.source_key && frequencies.get(row.source_key)! > 1) {
    row.status = 'invalid'; row.issues.push({code: 'duplicate_source_key', message: 'O identificador de origem se repete no arquivo.'});
  }
  return rows;
}
export type ExistingProperty = {id: string; name: string; address: string; state_code: string | null; control_number: number | null};
export function classifyRows(rows: ImportRow[], existing: ExistingProperty[]) {
  const candidates: {key: string; baseKey: string; city: string | null; state: string | null; duplicate: ImportDuplicate}[] = existing.map(property => ({
    ...placeKeys(property.address, null), state: property.state_code?.trim().toUpperCase() || null,
    duplicate: {kind: 'property', id: property.id, ...(property.control_number ? {control_number: property.control_number} : {})},
  }));
  for (const row of rows) {
    if (row.status !== 'valid') continue;
    const keys = placeKeys(row.normalized.address, row.normalized.city), state = row.normalized.state_code;
    const match = candidates.find(item => (item.state === state || !item.state || !state) &&
      (item.key === keys.key ||
        (keys.city && !item.city && item.key === keys.baseKey) ||
        (!keys.city && item.city && keys.key === item.baseKey)));
    if (match) {
      row.status = 'duplicate'; row.duplicate_of = match.duplicate;
      row.issues.push({code: !state || !match.state ? 'duplicate_uncertain_state' : match.key !== keys.key ? 'duplicate_uncertain_city' : 'duplicate_address', message: !state || !match.state
        ? 'Há o mesmo endereço com UF ausente. Confira os cadastros antes de importar esta linha.'
        : match.key !== keys.key ? 'Há o mesmo endereço com cidade ausente em uma das origens. Confira os cadastros antes de importar esta linha.'
        : 'O endereço já aparece no cadastro ou em uma linha anterior do arquivo.'});
    } else candidates.push({...keys, state, duplicate: {kind: 'row', id: row.row_id}});
  }
  return rows;
}
