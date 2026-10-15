import type {InspectionEnvironment, InspectionInput, InspectionItem, InspectionSnapshot, InspectionSource} from '../lib/property-inspections';

export const INSPECTION_LABELS = {entry: 'Entrada', return: 'Devolução', periodic: 'Periódica'} as const;
export type InspectionItemDraft = Omit<InspectionItem, 'quantity'> & {quantity: string};
export type InspectionDraft = Omit<InspectionInput, 'items'> & {items: InspectionItemDraft[]};
export type PendingInspectionPhoto = {id: string; item_id: string; caption: string; file: File};
export const MAX_NEW_INSPECTION_PHOTOS = 3;
export const newInspectionId = () => crypto.randomUUID();
export function blankInspectionItem(environmentId: string): InspectionItemDraft {
  return {id: newInspectionId(), environment_id: environmentId, name: '', source_item_id: null, quantity: '', condition: '', brand: '', model: '', material: '', color: '', description: '', note: '', pending: false, responsible: '', due_on: null};
}
export function makeInspectionDraft(source?: InspectionSnapshot): InspectionDraft {
  return source ? {
    inspection_type: source.inspection_type, inspected_on: source.inspected_on, inspector: source.inspector,
    lessor: source.lessor, lessee: source.lessee, keys: source.keys, water: source.water, energy: source.energy,
    contestation: source.contestation, notes: source.notes,
    environments: source.environments.map(value => ({...value})), items: source.items.map(value => ({...value, quantity: value.quantity == null ? '' : String(value.quantity)})),
    source_mobilization_id: source.source_mobilization_id, source_mobilization_version: source.source_mobilization_version,
    source_handover_id: source.source_handover_id, source_handover_revision: source.source_handover_revision,
    entry_inspection_id: source.entry_inspection_id, entry_inspection_version: source.entry_inspection_version,
  } : {inspection_type: 'entry', inspected_on: '', inspector: '', lessor: '', lessee: '', keys: '', water: '', energy: '', contestation: '', notes: '', environments: [], items: [], source_mobilization_id: null, source_mobilization_version: null, source_handover_id: null, source_handover_revision: null, entry_inspection_id: null, entry_inspection_version: null};
}
/** The declared source is a historical baseline, never proof of the new inspection. */
export function importInspectionSource(draft: InspectionDraft, source: InspectionSource): InspectionDraft {
  const environments = source.environments.map(value => ({...value}));
  let generalId = '';
  const environmentFor = (id: string | null) => {
    if (id && environments.some(value => value.id === id)) return id;
    if (!generalId) {generalId = newInspectionId(); environments.push({id: generalId, name: 'Geral do imóvel', parent_id: null});}
    return generalId;
  };
  return {...draft, source_mobilization_id: source.id, source_mobilization_version: source.version, environments,
    items: source.items.map(item => ({...blankInspectionItem(environmentFor(item.environment_id)), source_item_id: item.id, name: item.name}))};
}
export function inspectionDraftIssue(draft: InspectionDraft): string {
  if (!draft.inspected_on || !draft.inspector.trim()) return 'Informe a data da vistoria e o vistoriador declarado.';
  if (draft.environments.length > 100 || draft.items.length > 200) return 'Use até 100 ambientes e 200 itens por vistoria.';
  if (draft.environments.some(value => !value.name.trim())) return 'Dê um nome a cada ambiente.';
  if (draft.items.some(value => !value.name.trim())) return 'Dê um nome a cada item.';
  if (draft.items.some(value => value.quantity !== '' && (!/^\d+$/.test(value.quantity) || !Number.isSafeInteger(Number(value.quantity))))) return 'Use quantidades inteiras iguais ou maiores que zero, ou deixe em branco quando não informado.';
  if (draft.items.some(value => !draft.environments.some(environment => environment.id === value.environment_id))) return 'Selecione o ambiente de cada item.';
  return '';
}
export function inspectionPayload(draft: InspectionDraft): InspectionInput {
  return {...draft, items: draft.items.map(value => ({...value, quantity: value.quantity === '' ? null : Number(value.quantity)}))};
}
/** Stable display numbering follows parent/child order without changing stored IDs. */
export function numberedEnvironments(environments: InspectionEnvironment[]): Array<InspectionEnvironment & {number: string}> {
  const result: Array<InspectionEnvironment & {number: string}> = [], seen = new Set<string>();
  const append = (parent: string | null, prefix: string) => {
    environments.filter(value => value.parent_id === parent).forEach((value, index) => {
      if (seen.has(value.id)) return; seen.add(value.id);
      const number = prefix ? `${prefix}.${index + 1}` : String(index + 1);
      result.push({...value, number}); append(value.id, number);
    });
  };
  append(null, '');
  environments.filter(value => !seen.has(value.id)).forEach(value => result.push({...value, number: String(result.length + 1)}));
  return result;
}
export const inspectionPhotoUrl = (id: string) => '/api/property-inspection-photos/' + encodeURIComponent(id);
export const inspectionSignatureUrl = (id: string) => '/api/property-inspection-signatures/' + encodeURIComponent(id);
