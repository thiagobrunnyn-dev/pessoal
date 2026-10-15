// Server-only policy; never import this module from a client component.
export const MAPS_SITE_ORIGIN = 'https://mobiliza.example.invalid';
export const MAPS_CONFIG_OBJECT = 'private-config/google-maps/v1.json';
export const MAPS_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Cookie, Origin',
};
export class MapsError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export type MapsStatus = {configured: boolean; enabled: boolean; revision: number};
export type MapsConfig = {
  version: 1; browser_key: string; enabled: boolean; revision: number;
  declared_limits: string; consent: null | {at: string; actor: string; version: 1};
};
export type ConfigSnapshot = {config: MapsConfig | null; etag: string | null};
export interface ConfigStore {
  read(): Promise<ConfigSnapshot>;
  write(config: MapsConfig, previousEtag: string | null): Promise<boolean>;
}
export type MapsOperator = {actor: {userId: string}; ownerId: string};
export interface MapsDependencies {
  getOwnerId(): Promise<string | null>;
  getOperator(): Promise<MapsOperator | null>;
  recheckOperator(op: MapsOperator): Promise<void>;
  propertyAllowed(op: MapsOperator, propertyId: string): Promise<boolean>;
  readJson(request: Request, max: number): Promise<unknown>;
  store: ConfigStore;
  now?: () => string;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MapsError('Solicitação inválida.');
  return value as Record<string, unknown>;
}
export function localKeyFormat(value: unknown): value is string {
  // Syntax only: this cannot validate billing, API restrictions, referrers or quotas.
  return typeof value === 'string' && /^AIza[A-Za-z0-9_-]{35}$/.test(value);
}
export function parseStoredConfig(value: unknown): MapsConfig {
  const b = record(value);
  if (b.version !== 1 || !localKeyFormat(b.browser_key) || typeof b.enabled !== 'boolean' ||
      !Number.isSafeInteger(b.revision) || Number(b.revision) < 1 ||
      typeof b.declared_limits !== 'string' || b.declared_limits.length > 2000) {
    throw new MapsError('Configuração do mapa indisponível.', 503);
  }
  if (b.consent !== null) {
    const consent = record(b.consent);
    if (consent.version !== 1 || typeof consent.at !== 'string' || typeof consent.actor !== 'string') {
      throw new MapsError('Configuração do mapa indisponível.', 503);
    }
  }
  if (b.enabled && (!b.consent || !b.declared_limits.trim())) throw new MapsError('Configuração do mapa indisponível.', 503);
  return b as unknown as MapsConfig;
}
export function statusOf(config: MapsConfig | null): MapsStatus {
  return {configured: !!config, enabled: config?.enabled === true, revision: config?.revision ?? 0};
}
function checkWriteOrigin(request: Request) {
  if (new URL(request.url).origin !== MAPS_SITE_ORIGIN || request.headers.get('origin') !== MAPS_SITE_ORIGIN) {
    throw new MapsError('Origem inválida.', 403);
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') throw new MapsError('Origem inválida.', 403);
}
const reply = (data: unknown, status = 200) => Response.json(data, {status, headers: MAPS_HEADERS});
function failure(error: unknown) {
  // Intentionally never log errors, bodies, key values, URLs or R2 content.
  if (error instanceof MapsError) return reply({error: error.message}, error.status);
  // Only propagate existing HTTP guards' numeric status, never their input/message.
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
  return reply({error: 'Não foi possível concluir a solicitação do mapa.'}, [400, 401, 403, 404, 409, 413, 415].includes(status) ? status : 503);
}
export function createMapsApi(deps: MapsDependencies) {
  return {
    async settingsGet() {
      try {
        if (!await deps.getOwnerId()) throw new MapsError('Configuração exclusiva do proprietário.', 403);
        return reply(statusOf((await deps.store.read()).config));
      } catch (error) { return failure(error); }
    },
    async settingsPost(request: Request) {
      try {
        const ownerId = await deps.getOwnerId();
        if (!ownerId) throw new MapsError('Configuração exclusiva do proprietário.', 403);
        checkWriteOrigin(request);
        const b = record(await deps.readJson(request, 8192));
        const previous = await deps.store.read();
        if (!Number.isSafeInteger(b.expected_revision) || b.expected_revision !== (previous.config?.revision ?? 0)) {
          throw new MapsError('A configuração mudou. Atualize a página e confira antes de tentar novamente.', 409);
        }
        const revision = Number(b.expected_revision) + 1;
        if (!Number.isSafeInteger(revision)) throw new MapsError('Configuração indisponível.', 503);
        let next: MapsConfig;
        if (b.action === 'save_key') {
          if (!localKeyFormat(b.browser_key)) throw new MapsError('Formato de chave inválido. Cole a chave browser sem espaços.');
          // Replacing or even re-saving a key always disables Google until a separate activation.
          next = {version: 1, browser_key: b.browser_key, enabled: false, revision, declared_limits: '', consent: null};
        } else if (b.action === 'enable') {
          if (!previous.config) throw new MapsError('Salve a chave antes de ativar.');
          if (b.referrers_confirmed !== true || b.api_confirmed !== true || b.quotas_confirmed !== true ||
              b.costs_confirmed !== true || b.data_sharing_confirmed !== true || b.browser_visibility_confirmed !== true) {
            throw new MapsError('Confira e confirme todas as condições antes de ativar.');
          }
          if (typeof b.declared_limits !== 'string' || !b.declared_limits.trim() || b.declared_limits.length > 2000) {
            throw new MapsError('Descreva as quotas e os limites definidos por você no Google, até 2.000 caracteres.');
          }
          next = {...previous.config, enabled: true, revision, declared_limits: b.declared_limits.trim(),
            consent: {at: deps.now?.() ?? new Date().toISOString(), actor: ownerId, version: 1}};
        } else if (b.action === 'disable') {
          if (!previous.config) throw new MapsError('Nenhuma chave configurada.');
          next = {...previous.config, enabled: false, revision};
        } else throw new MapsError('Ação inválida.');
        if (!await deps.store.write(next, previous.etag)) throw new MapsError('Outra alteração ocorreu. Atualize a página.', 409);
        return reply(statusOf(next));
      } catch (error) { return failure(error); }
    },
    async bootstrapPost(request: Request) {
      try {
        const op = await deps.getOperator();
        if (!op) throw new MapsError('Entre com uma conta de gestão autorizada.', 401);
        checkWriteOrigin(request);
        const b = record(await deps.readJson(request, 1024));
        if (b.action !== 'load_google_map' || b.data_sharing_confirmed !== true) {
          throw new MapsError('Confirme o carregamento e o envio da área do mapa ao Google.');
        }
        if (typeof b.property_id !== 'string' || !b.property_id || b.property_id.length > 200 ||
            !await deps.propertyAllowed(op, b.property_id)) throw new MapsError('Imóvel não encontrado.', 404);
        const {config} = await deps.store.read();
        if (!config?.enabled) throw new MapsError('Google Maps não está ativado. Você pode usar OpenStreetMap.', 409);
        await deps.recheckOperator(op);
        // Recheck the scoped property after config I/O: revoked or changed regional scope must fail closed.
        if (!await deps.propertyAllowed(op, b.property_id)) throw new MapsError('Imóvel não encontrado.', 404);
        // This is the ONLY key-bearing response. The browser SDK necessarily exposes a browser API key.
        return reply({browser_key: config.browser_key, revision: config.revision});
      } catch (error) { return failure(error); }
    },
  };
}
