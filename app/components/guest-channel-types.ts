import type {GuestMaintenanceCategory} from '../../lib/guest-request-categories';
export type GuestRequestKind = 'maintenance' | 'material' | 'rating';
export type GuestScores = {cleanliness: number | null; comfort: number | null; service: number | null};
export type GuestItem = {name: string; quantity: number; unit: string};
export type GuestChannel = {
  property: {name: string; address: string; code: string};
  channel_revision: number;
  privacy_version: string;
};
export type GuestValues = {
  kind: GuestRequestKind; category: GuestMaintenanceCategory | ''; name: string; job_title: string; location: string;
  description: string; contact: string; company: string; cost_center: string;
  items: GuestItem[]; scores: GuestScores; unable_to_photo: boolean;
  privacy_accepted: true; privacy_version: string;
};
export type GuestReceipt = {protocol: string; received_at: string; alreadySaved?: boolean};
export const GUEST_KIND_LABELS: Record<GuestRequestKind, string> = {
  maintenance: 'Manutenção ou melhoria', material: 'Pedido de material', rating: 'Avaliar hospedagem',
};
export const GUEST_SCORE_LABELS: Record<keyof GuestScores, string> = {
  cleanliness: 'Limpeza', comfort: 'Conforto', service: 'Atendimento',
};
export function emptyGuestScores(): GuestScores {
  return {cleanliness: null, comfort: null, service: null};
}
export function guestDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('pt-BR', {timeZone: 'America/Belem', dateStyle: 'short', timeStyle: 'short'}) + ' (Belém)'
    : 'Data indisponível';
}
export function isGuestChannel(value: unknown): value is GuestChannel {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<GuestChannel>;
  return !!row.property && typeof row.property.name === 'string' && !!row.property.name.trim()
    && typeof row.property.address === 'string' && typeof row.property.code === 'string'
    && Number.isInteger(row.channel_revision) && (row.channel_revision ?? -1) >= 0
    && typeof row.privacy_version === 'string' && !!row.privacy_version;
}
export function isGuestReceipt(value: unknown): value is GuestReceipt {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<GuestReceipt>;
  return typeof row.protocol === 'string' && !!row.protocol.trim()
    && typeof row.received_at === 'string' && Number.isFinite(new Date(row.received_at).getTime());
}
export class GuestApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string = '') {
    super(message); this.name = 'GuestApiError';
  }
}
/** Every call has an explicit timeout, same-origin credentials and no referrer. No browser storage. */
export async function guestJson(url: string, options: RequestInit = {}, timeoutMs = 25000): Promise<unknown> {
  const controller = new AbortController();
  const caller = options.signal;
  const abort = () => controller.abort();
  caller?.addEventListener('abort', abort, {once: true});
  if (caller?.aborted) controller.abort();
  const timer = globalThis.setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, {...options, credentials: 'same-origin', cache: 'no-store',
      referrerPolicy: 'no-referrer', signal: controller.signal});
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = value && typeof value === 'object' ? value as {error?: unknown; code?: unknown} : {};
      throw new GuestApiError(typeof error.error === 'string' ? error.error : 'Não foi possível concluir agora.',
        response.status, typeof error.code === 'string' ? error.code : '');
    }
    return value;
  } finally {
    globalThis.clearTimeout(timer);
    caller?.removeEventListener('abort', abort);
  }
}
