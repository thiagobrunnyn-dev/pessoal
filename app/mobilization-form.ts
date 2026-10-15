import {furnitureApplies} from '../lib/furniture-details';
import {
  defaultMobilizationChecklist,
  type MobilizationChecklist, type MobilizationEquipment, type MobilizationEnvironment, type MobilizationStage,
} from '../lib/mobilizations';

export type EquipmentDraft = Omit<MobilizationEquipment, 'planned' | 'checked'> & {planned: string; checked: string; condition?: string};
export type MobilizationDraft = {
  property_id: string; client_id: string; cost_center_id: string;
  building_type: '' | 'house' | 'building'; environments: MobilizationEnvironment[];
  housing_type: 'republic' | 'lodging'; responsible: string; due_on: string;
  planned_slots: string; stage: MobilizationStage; equipment: EquipmentDraft[];
  checklist: MobilizationChecklist[]; notes: string; note: string; refresh_snapshot: boolean;
};
export type DraftSource = Omit<MobilizationDraft, 'equipment' | 'planned_slots' | 'due_on' | 'note' | 'refresh_snapshot'> & {
  equipment: MobilizationEquipment[]; planned_slots: number | null; due_on: string | null;
};
export function makeMobilizationDraft(source?: DraftSource): MobilizationDraft {
  return {
    property_id: source?.property_id ?? '', client_id: source?.client_id ?? '', cost_center_id: source?.cost_center_id ?? '',
    building_type: source?.building_type ?? '', environments: source?.environments.map(row => ({...row})) ?? [],
    housing_type: source?.housing_type ?? 'republic', responsible: source?.responsible ?? '',
    due_on: source?.due_on ?? '', planned_slots: source?.planned_slots == null ? '' : String(source.planned_slots),
    stage: source?.stage ?? 'new', equipment: source?.equipment.map(row => ({...row, planned: row.planned == null ? '' : String(row.planned), checked: row.checked == null ? '' : String(row.checked)})) ?? [],
    checklist: source?.checklist.map(row => ({...row})) ?? defaultMobilizationChecklist(),
    notes: source?.notes ?? '', note: '', refresh_snapshot: false,
  };
}
const count = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
export function equipmentShortfall(items: EquipmentDraft[]) {
  return items.filter(row => furnitureApplies(row) && count(row.planned) && count(row.checked) && Number(row.checked) < Number(row.planned));
}
export function equipmentUnknown(items: EquipmentDraft[]) { return items.filter(row => furnitureApplies(row) && (row.planned === '' || row.checked === '')); }
export function needsEquipmentNote(row: EquipmentDraft) { return furnitureApplies(row) && (row.planned === '' || row.checked === '' || Number(row.checked) < Number(row.planned)); }
export const ENVIRONMENT_KINDS = {bedroom: 'Quarto', living: 'Sala', kitchen: 'Cozinha', laundry: 'Lavanderia', common: 'Área de vivência', other: 'Outro ambiente'} as const;
export const ROOM_LEVELS = {staff: 'Staff', tecnico: 'Técnico', encarregado: 'Encarregado', operacional: 'Operacional'} as const;
/** A template applies to exactly one named room. Availability is always unknown. */
export function equipmentTemplate(environment: MobilizationEnvironment, buildingType: MobilizationDraft['building_type']): EquipmentDraft[] | null {
  let rows: [string, string][] | null = null;
  if (environment.kind === 'bedroom') {
    if (environment.level === 'staff') rows = [['Cama de casal', '1']];
    if (environment.level === 'tecnico' || environment.level === 'encarregado') rows = [['Cama de solteiro', '2']];
    if (environment.level === 'operacional' && environment.layout === 'single' && [2, 3].includes(environment.single_beds ?? 0)) rows = [['Cama de solteiro', String(environment.single_beds)]];
    if (environment.level === 'operacional' && environment.layout === 'bunk') rows = [['Beliche', '2'], ['Colchão de solteiro', '4']];
  } else if (environment.kind === 'common' && buildingType === 'building') rows = [['TV', ''], ['Bebedouro', ''], ['Cadeiras', '']];
  return rows?.map(([label, planned]) => ({id: crypto.randomUUID(), label, environment_id: environment.id, planned, checked: '', note: ''})) ?? null;
}
export function mobilizationDraftIssue(draft: MobilizationDraft, update: boolean): string {
  if (!draft.property_id || !draft.client_id || !draft.cost_center_id) return 'Escolha imóvel, empresa e centro de custo.';
  if (!draft.building_type) return 'Informe se o imóvel é uma casa ou um prédio.';
  if (!draft.responsible.trim()) return 'Informe o nome do responsável.';
  if (draft.planned_slots && !count(draft.planned_slots)) return 'Informe vagas previstas como um número inteiro igual ou maior que zero.';
  if (draft.environments.length > 100 || draft.equipment.length > 100 || draft.checklist.length > 100) return 'Use até 100 itens em cada lista.';
  if (draft.environments.some(row => !row.label.trim())) return 'Identifique cada ambiente com seu próprio nome.';
  if (draft.equipment.some(row => !row.label.trim() || (row.planned !== '' && !count(row.planned)) || (row.checked !== '' && !count(row.checked)))) return 'Informe o nome de cada item e use quantidades inteiras iguais ou maiores que zero, ou deixe a quantidade em branco.';
  if (draft.equipment.some(row => (row.condition?.length ?? 0) > 200)) return 'Use até 200 caracteres para a condição de cada item.';
  if (draft.checklist.some(row => !row.label.trim())) return 'Dê um nome a cada item do checklist.';
  if (draft.checklist.some(row => row.status === 'pending' && !row.note.trim())) return 'Explique cada item do checklist marcado com pendência.';
  if (draft.stage === 'inspection' && draft.equipment.some(row => needsEquipmentNote(row) && !row.note.trim())) return 'Na vistoria, explique cada falta ou quantidade ainda não informada.';
  if (draft.stage === 'ready' && (!draft.checklist.length || draft.checklist.some(row => !['done', 'na'].includes(row.status)) || equipmentShortfall(draft.equipment).length || equipmentUnknown(draft.equipment).length)) return 'Para ficar pronta, conclua o checklist (Conferido ou Não se aplica) e informe as quantidades necessárias e disponíveis, sem faltas.';
  if (update && !draft.note.trim()) return 'Informe o motivo desta atualização.';
  return '';
}
export function appendMobilizationDraft(form: FormData, draft: MobilizationDraft) {
  for (const key of ['property_id', 'client_id', 'cost_center_id', 'housing_type', 'building_type', 'responsible', 'due_on', 'planned_slots', 'stage', 'notes', 'note'] as const) form.set(key, draft[key]);
  form.set('environments', JSON.stringify(draft.environments));
  form.set('equipment', JSON.stringify(draft.equipment.map(row => ({...row, planned: row.planned === '' ? null : Number(row.planned), checked: row.checked === '' ? null : Number(row.checked)}))));
  form.set('checklist', JSON.stringify(draft.checklist));
  if (draft.refresh_snapshot) form.set('refresh_snapshot', 'yes');
}

/** Same 1600px JPEG preparation used by the existing cleaning evidence form.
 * Files remain local until the explicit Save. No data URL is stored. */
export async function prepareMobilizationPhoto(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Escolha fotos JPG, PNG ou WebP.');
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('Escolha uma foto de até 20 MB para preparar.');
  let bitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 64_000_000) throw new Error('Escolha uma foto com resolução menor.');
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível preparar a foto.')), 'image/jpeg', .82));
    if (!blob.size || blob.size > 4 * 1024 * 1024) throw new Error('A foto preparada ficou maior que 4 MB. Escolha outra imagem.');
    return new File([blob], 'evidencia-mobilizacao.jpg', {type: 'image/jpeg'});
  } catch (cause) {
    throw new Error(cause instanceof Error ? cause.message : 'Não foi possível preparar a foto. Escolha outra imagem.');
  } finally {
    bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
