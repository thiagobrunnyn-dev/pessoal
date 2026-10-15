/** Explicit public projection approved for the request form. Never spread database rows here. */
export type DirectoryPersonRow = {
  id: string;
  display_name: string;
  city: string | null;
  state_code: string | null;
  client_id: string | null;
  cost_center_id: string | null;
  has_photo: number;
};
export type DirectoryClientRow = {id: string; name: string};
export type DirectoryCenterRow = {id: string; name: string; client_id: string};
export type DirectoryCity = {id: string; name: string};

export const REQUEST_DIRECTORY_PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REQUEST_DIRECTORY_PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;
const GEO003_ID = '55555555-5555-4555-8555-555555555555';
const states = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export function directoryLabel(value: unknown) {
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const name = value.trim();
  return name && /\p{L}/u.test(name) ? name : null;
}

export function profileDirectoryCity(city: unknown, state: unknown) {
  const name = directoryLabel(city);
  return name && typeof state === 'string' && states.has(state) ? `${name} - ${state}` : null;
}

export function projectRequestDirectory(
  peopleRows: readonly DirectoryPersonRow[],
  clientRows: readonly DirectoryClientRow[],
  centerRows: readonly DirectoryCenterRow[],
  catalogCities: readonly DirectoryCity[],
) {
  const clients = clientRows.flatMap(row => {
    const name = directoryLabel(row.name);
    return name ? [{id: row.id, name}] : [];
  });
  const clientIds = new Set(clients.map(row => row.id));
  const costCenters = centerRows.flatMap(row => {
    const name = row.id === GEO003_ID ? 'GEO003 - Vila Paulo Fonteles' : directoryLabel(row.name);
    return name && clientIds.has(row.client_id) ? [{id: row.id, name, clientId: row.client_id}] : [];
  });
  const centers = new Map(costCenters.map(row => [row.id, row]));
  const people = peopleRows.flatMap(row => {
    const name = directoryLabel(row.display_name);
    if (!name) return [];
    const clientId = row.client_id && clientIds.has(row.client_id) ? row.client_id : null;
    const center = row.cost_center_id ? centers.get(row.cost_center_id) : undefined;
    // A conflicting or absent profile relationship is never inferred from the name/city.
    const costCenterId = center && center.clientId === clientId ? center.id : null;
    return [{
      id: row.id,
      name,
      photoUrl: row.has_photo === 1 && REQUEST_DIRECTORY_PHOTO_ID.test(row.id)
        ? `/api/request-directory/photos/${row.id}` : null,
      city: profileDirectoryCity(row.city, row.state_code),
      clientId,
      costCenterId,
    }];
  });
  const cities = new Map(catalogCities.map(row => [row.name.normalize('NFC').toLocaleLowerCase('pt-BR'), {id: row.id, name: row.name}]));
  // The panel permits manually entered localities as well as its IBGE catalog.
  for (const person of people) if (person.city) {
    const key = person.city.normalize('NFC').toLocaleLowerCase('pt-BR');
    if (!cities.has(key)) cities.set(key, {id: `locality:${encodeURIComponent(key)}`, name: person.city});
    person.city = cities.get(key)!.name;
  }
  return {people, clients, costCenters, cities: [...cities.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))};
}
