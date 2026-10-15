import {db,bucket,noCache} from './maintenance';
import {sanitizePhoto} from './photo-privacy';
import {maintenanceEvidenceSql,maintenanceCompletion} from './maintenance-evidence';
import {RequestError} from './http-security';
export const publicEquipmentHeaders={...noCache,'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','Cross-Origin-Resource-Policy':'same-origin'};
// The complete random UUID already printed on the label is a bearer link.
// No lookup by the short printed code, serial, property or partial UUID exists.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const enabled=`e.public_history_enabled=1 AND e.archived_at IS NULL AND p.archived_at IS NULL`;
export async function publicEquipmentAccess(id:string){
 if(!uuid.test(id))throw new RequestError('Consulta indisponível.',404);
 const row=await db().prepare(`SELECT e.id,e.owner_id,e.public_history_revision,e.name,e.location FROM equipment e JOIN properties p ON p.id=e.property_id AND p.owner_id=e.owner_id WHERE e.id=? AND ${enabled}`).bind(id).first<any>();
 if(!row)throw new RequestError('Consulta indisponível.',404);return row;
}
async function recheck(row:any){const current=await publicEquipmentAccess(row.id);if(current.owner_id!==row.owner_id||current.public_history_revision!==row.public_history_revision)throw new RequestError('Consulta atualizada. Abra novamente o QR.',404);}
export async function equipmentPublicData(id:string,page=0){
 if(!Number.isSafeInteger(page)||page<0||page>1000)throw new RequestError('Página inválida.');
 const access=await publicEquipmentAccess(id),offset=page*20;
 const rows=(await db().prepare(`SELECT m.id,m.revision,m.service_date,m.service_time,m.completion_status,m.checklist,m.evidence_version,${maintenanceEvidenceSql('m')} evidence_complete FROM maintenance m WHERE m.owner_id=? AND m.equipment_id=? AND m.is_test=0 ORDER BY m.service_date DESC,m.service_time DESC,m.created_at DESC,m.id DESC LIMIT 21 OFFSET ?`).bind(access.owner_id,id,offset).all<any>()).results;
 const more=rows.length>20;if(more)rows.pop();const ids=rows.map(r=>r.id);
 const photos=ids.length?(await db().prepare(`SELECT ph.id,ph.maintenance_id,ph.phase,ph.position FROM photos ph JOIN maintenance m ON m.id=ph.maintenance_id AND m.owner_id=ph.owner_id WHERE m.owner_id=? AND m.equipment_id=? AND m.is_test=0 AND m.id IN (${ids.map(()=>'?').join(',')}) ORDER BY ph.position,ph.id`).bind(access.owner_id,id,...ids).all<any>()).results:[];
 const history=rows.map(row=>{let checklist:any[]=[];try{const parsed=JSON.parse(row.checklist);if(Array.isArray(parsed))checklist=parsed.slice(0,20).flatMap(x=>typeof x==='string'?[{item:x.slice(0,300),status:'done'}]:x&&typeof x.item==='string'&&['done','pending','not_applicable'].includes(x.status)?[{item:x.item.slice(0,300),status:x.status}]:[]);}catch{}
 const images=photos.filter(p=>p.maintenance_id===row.id),legacy=row.evidence_version===1;
 return {id:row.id,date:row.service_date,time:row.service_time,completion:maintenanceCompletion(row.completion_status,row.evidence_version,images),evidence:legacy?'legacy':row.evidence_complete?'complete':'pending',checklist,photos:images.map(p=>({id:p.id,phase:legacy?'legacy':p.phase,position:p.position}))};});
 await recheck(access);
 if(rows.length){const current=(await db().prepare(`SELECT m.id,m.revision FROM maintenance m JOIN equipment e ON e.id=m.equipment_id AND e.owner_id=m.owner_id JOIN properties p ON p.id=e.property_id AND p.owner_id=e.owner_id WHERE m.equipment_id=? AND m.owner_id=? AND m.is_test=0 AND e.public_history_revision=? AND ${enabled} AND m.id IN (${ids.map(()=>'?').join(',')})`).bind(id,access.owner_id,access.public_history_revision,...ids).all<any>()).results;if(current.length!==rows.length||rows.some(row=>!current.some(c=>c.id===row.id&&c.revision===row.revision)))throw new RequestError('Histórico atualizado. Atualize a consulta.',409);}
 return {equipment:{code:id.slice(0,8).toUpperCase(),name:access.name,location:access.location},history,page,nextPage:more?page+1:null};
}
export async function equipmentPublicPhoto(equipmentId:string,photoId:string){
 const access=await publicEquipmentAccess(equipmentId);if(!uuid.test(photoId))throw new RequestError('Foto indisponível.',404);
 const sql=`SELECT ph.object_key,ph.content_type FROM photos ph JOIN maintenance m ON m.id=ph.maintenance_id AND m.owner_id=ph.owner_id WHERE ph.id=? AND m.equipment_id=? AND m.owner_id=? AND m.is_test=0`;
 const photo=await db().prepare(sql).bind(photoId,equipmentId,access.owner_id).first<any>();if(!photo)throw new RequestError('Foto indisponível.',404);
 const object=await bucket().get(photo.object_key);if(!object)throw new RequestError('Foto indisponível.',404);
 const bytes=sanitizePhoto(await object.arrayBuffer(),photo.content_type);
 await recheck(access);const final=await db().prepare(`SELECT ph.object_key,ph.content_type FROM photos ph JOIN maintenance m ON m.id=ph.maintenance_id AND m.owner_id=ph.owner_id JOIN equipment e ON e.id=m.equipment_id AND e.owner_id=m.owner_id JOIN properties p ON p.id=e.property_id AND p.owner_id=e.owner_id WHERE ph.id=? AND m.equipment_id=? AND m.owner_id=? AND m.is_test=0 AND e.public_history_revision=? AND ${enabled}`).bind(photoId,equipmentId,access.owner_id,access.public_history_revision).first<any>();if(!final||final.object_key!==photo.object_key||final.content_type!==photo.content_type)throw new RequestError('Foto indisponível.',404);
 return new Response(bytes.buffer as ArrayBuffer,{headers:{...publicEquipmentHeaders,'Content-Type':photo.content_type,'Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
