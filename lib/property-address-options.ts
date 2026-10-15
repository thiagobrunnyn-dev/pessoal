type Property = {id: string; address: string; control_number?: number | null};
type History = {property_id: string; address: string};
export type PropertyAddressOption = {id: string; address: string; control_number: number | null; historical: boolean; addresses: string[]};
const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
// Both inputs already belong to the authenticated scope. Keep old addresses searchable
// without replacing the address saved in any delivery cycle.
export function propertyAddressOptions(properties: Property[], history: History[]) {
  const options = new Map<string, PropertyAddressOption>();
  for (const property of properties) options.set(property.id, {id: property.id, address: property.address, control_number: property.control_number ?? null, historical: false, addresses: [property.address]});
  for (const row of history) {
    const existing = options.get(row.property_id);
    if (existing) {if (!existing.addresses.includes(row.address)) existing.addresses.push(row.address);}
    else options.set(row.property_id, {id: row.property_id, address: row.address, control_number: null, historical: true, addresses: [row.address]});
  }
  return [...options.values()].sort((a, b) => a.address.localeCompare(b.address, 'pt-BR') || a.id.localeCompare(b.id));
}
export function matchPropertyAddress(option: PropertyAddressOption, query: string) {
  const words = normalized(query).split(/\s+/).filter(Boolean);
  return option.addresses.some(address => words.every(word => normalized(address).includes(word)));
}
