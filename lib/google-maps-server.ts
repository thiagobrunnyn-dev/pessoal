import {bucket, first} from './maintenance';
import {getOwnerUser} from './owner-access';
import {getOperator, recheckOperator, type Operator} from './app-access';
import {boundedJson} from './http-security';
import {createMapsApi, MAPS_CONFIG_OBJECT, MapsError, parseStoredConfig, type ConfigStore} from './google-maps-policy';

// Existing Sites R2 binding is private; no generic key/path download route is introduced.
// The D1 schema, property snapshots and general readers never receive this object or key.
const store: ConfigStore = {
  async read() {
    const object = await bucket().get(MAPS_CONFIG_OBJECT);
    if (!object) return {config: null, etag: null};
    if (object.size > 8192) throw new MapsError('Configuração do mapa indisponível.', 503);
    return {config: parseStoredConfig(await object.json()), etag: object.etag};
  },
  async write(config, previousEtag) {
    const body = JSON.stringify(config);
    if (new TextEncoder().encode(body).byteLength > 8192) throw new MapsError('Reduza o texto dos limites antes de salvar.', 413);
    const result = await bucket().put(MAPS_CONFIG_OBJECT, body, {
      onlyIf: previousEtag ? {etagMatches: previousEtag} : {etagDoesNotMatch: '*'},
      httpMetadata: {contentType: 'application/json', cacheControl: 'private, no-store'},
    });
    return result !== null;
  },
};
export const googleMapsApi = createMapsApi({
  getOwnerId: async () => (await getOwnerUser())?.userId ?? null,
  getOperator,
  recheckOperator: op => recheckOperator(op as Operator),
  propertyAllowed: async (op, propertyId) => !!await first(
    'SELECT id FROM properties WHERE id=? AND owner_id=? AND archived_at IS NULL', propertyId, op.ownerId,
  ),
  readJson: boundedJson,
  store,
});
