import {clientCatalog} from './client-catalog';
import {peopleForRecords} from './service-people';
import {isRegionalRequest} from './regional-access';
import {all} from './maintenance';
export async function handoverData(ownerId:string){const [catalog,properties,handovers]=await Promise.all([clientCatalog(ownerId),all('SELECT id,name,address,control_number,state_code FROM properties WHERE owner_id=? AND archived_at IS NULL ORDER BY name',ownerId),all('SELECT id,revision,property_id,client_id,cost_center_id,property_name,address,client_name,cost_center_name,slots,level,delivered_on,returned_on,created_at,returned_at FROM housing_handovers WHERE owner_id=? ORDER BY delivered_on DESC,created_at DESC,id DESC',ownerId)]);return {regional:isRegionalRequest(),...catalog,properties,handovers:await peopleForRecords(ownerId,'handover',handovers)};}
