import {all} from './maintenance';
// Always use the request's existing scoped facade; no global/static catalog cache.
export async function clientCatalog(ownerId:string){const [clients,costCenters]=await Promise.all([
 all('SELECT id,name,entity_type FROM clients WHERE owner_id=? AND archived_at IS NULL ORDER BY name,id',ownerId),
 all('SELECT c.id,c.client_id,c.name FROM cost_centers c JOIN clients p ON p.id=c.client_id AND p.owner_id=c.owner_id WHERE c.owner_id=? AND c.archived_at IS NULL AND p.archived_at IS NULL ORDER BY c.name,c.id',ownerId),
]);return {clients,costCenters};}
