/** Pure helpers for the proposed shared property fields. No I/O or authorization. */
export class PropertyDetailsError extends Error {}

export type PropertyCounts = {bedrooms: number | null; bathrooms: number | null};
export const COUNT_KEYS = ['bedrooms', 'bathrooms'] as const;
type CountKey = typeof COUNT_KEYS[number];
const labels: Record<CountKey, string> = {bedrooms: 'quartos', bathrooms: 'banheiros'};

export function optionalPropertyCount(value: unknown, key: CountKey): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    value = value.trim();
    if (value === '') return null;
    if (!/^\d+$/.test(value as string)) {
      throw new PropertyDetailsError(`Informe a quantidade de ${labels[key]} como inteiro a partir de zero ou deixe vazia.`);
    }
    value = Number(value);
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PropertyDetailsError(`Informe a quantidade de ${labels[key]} como inteiro a partir de zero ou deixe vazia.`);
  }
  return value === 0 ? 0 : value;
}

/** Omitted fields preserve existing values on correction; explicit blanks clear to NULL. */
export function propertyCounts(
  input: Record<string, unknown>,
  previous: PropertyCounts = {bedrooms: null, bathrooms: null},
): PropertyCounts {
  return Object.fromEntries(COUNT_KEYS.map(key => [
    key,
    Object.hasOwn(input, key) ? optionalPropertyCount(input[key], key) : previous[key],
  ])) as PropertyCounts;
}

/** Used by the current multipart property create forms. Reject duplicate field names. */
export function propertyCountsFromForm(form: FormData): PropertyCounts {
  const input: Record<string, unknown> = {};
  for (const key of COUNT_KEYS) {
    const values = form.getAll(key);
    if (values.length > 1) throw new PropertyDetailsError(`Envie somente uma quantidade de ${labels[key]}.`);
    if (values.length) input[key] = values[0];
  }
  return propertyCounts(input);
}

export type DetailsSnapshot = PropertyCounts & {
  version: 1;
  property_id: string;
  property_revision: number;
  state_code: string | null;
  front_photo_asset_id: string | null;
  captured_at: string;
};

/** Call only for a NEW handover, with the authenticated, scoped server-read property.
 * Bind its revision into the handover INSERT CAS. Never call to fill legacy history.
 * The caller must supply the authorized current asset ID, or NULL when it is hidden.
 */
export function newHandoverDetails(
  property: PropertyCounts & {id: string; revision: number; state_code: string | null},
  authorizedCurrentAssetId: string | null,
  capturedAt: string,
): DetailsSnapshot {
  if (!property.id || !Number.isSafeInteger(property.revision) || property.revision < 0 ||
      !Number.isFinite(Date.parse(capturedAt))) throw new PropertyDetailsError('Cadastro do imóvel inválido.');
  return {
    version: 1,
    property_id: property.id,
    property_revision: property.revision,
    state_code: property.state_code,
    ...propertyCounts(property),
    front_photo_asset_id: authorizedCurrentAssetId,
    captured_at: new Date(capturedAt).toISOString(),
  };
}

/** This validates persisted data, not authorization. A legacy NULL stays NULL. */
export function parseHandoverDetails(raw: unknown): DetailsSnapshot | null {
  if (raw === null || raw === undefined) return null;
  let parsed: unknown;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.version !== 1 || typeof value.property_id !== 'string' || !value.property_id ||
      typeof value.property_revision !== 'number' || !Number.isSafeInteger(value.property_revision) || value.property_revision < 0 ||
      !(value.state_code === null || typeof value.state_code === 'string') ||
      !(value.front_photo_asset_id === null || typeof value.front_photo_asset_id === 'string' && !!value.front_photo_asset_id) ||
      typeof value.captured_at !== 'string' || !Number.isFinite(Date.parse(value.captured_at)) ||
      !COUNT_KEYS.every(key => value[key] === null || typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && value[key] >= 0)) return null;
  return {
    version: 1,
    property_id: value.property_id,
    property_revision: value.property_revision,
    state_code: value.state_code as string | null,
    bedrooms: value.bedrooms as number | null,
    bathrooms: value.bathrooms as number | null,
    front_photo_asset_id: value.front_photo_asset_id as string | null,
    captured_at: value.captured_at,
  };
}

export const propertyCountLabel = (value: number | null | undefined) => value == null ? 'Não informado' : String(value);
