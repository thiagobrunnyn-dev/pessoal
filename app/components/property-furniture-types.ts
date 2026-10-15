import type {FurnitureDetails} from '../../lib/furniture-details';
import type {MobilizationEnvironment, MobilizationStage} from '../../lib/mobilizations';

export type FurnitureItem = FurnitureDetails & {id: string; label: string; environment_id: string | null; planned: number | null; checked: number | null; note: string; condition?: string; photo_count: number};
export type FurnitureSource = {id: string; client_name: string; cost_center_name: string; stage: MobilizationStage; version: number; created_at: string; updated_at: string};
export type Furniture = {source_kind?: 'property' | 'mobilization'; building_type?: 'house' | 'building'; id: string; property_id: string; property_name: string; client_name?: string; cost_center_name?: string; stage?: MobilizationStage; version: number; environments: MobilizationEnvironment[]; equipment: FurnitureItem[]; can_edit?: boolean; can_resume_preparation?: boolean; handover_id?: string | null};
export type FurnitureResponse = {property_id: string; source_kind?: 'property' | 'mobilization' | null; sources: FurnitureSource[]; selected_mobilization_id: string | null; furniture: Furniture | null};
export const furnitureEndpoint = (furniture: Furniture | null) => furniture?.source_kind === 'property' || !furniture ? '/api/property-furniture' : '/api/mobilizations';
export const furnitureMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.';

export function assertFurnitureSaved(body: unknown, furniture: Furniture | null, propertyId: string) {
  const value = body as {id?: unknown; event_id?: unknown; version?: unknown; property_id?: unknown; source_kind?: unknown} | null;
  if (!value || typeof value.id !== 'string' || !value.id || furniture && value.id !== furniture.id || typeof value.event_id !== 'string' || !value.event_id || value.version !== (furniture?.version ?? 0) + 1 || (!furniture || furniture.source_kind === 'property') && (value.property_id !== propertyId || value.source_kind !== 'property')) throw new Error('Não foi possível confirmar o salvamento. Tente novamente com este mesmo rascunho.');
}

export async function readFurniture<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {cache: 'no-store', credentials: 'same-origin', signal});
  let body: {error?: string};
  try { body = await response.json(); } catch { throw new Error(response.status === 401 || response.status === 403 ? 'Seu acesso precisa ser validado. Entre novamente e tente salvar o rascunho.' : 'A resposta não pôde ser confirmada. Tente novamente.'); }
  if (!response.ok) throw new Error(body.error || (response.status === 401 || response.status === 403 ? 'Seu acesso precisa ser validado. Entre novamente e tente salvar o rascunho.' : 'Não foi possível carregar os dados.'));
  return body as T;
}
