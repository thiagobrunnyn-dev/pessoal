import {VALID_SCHEDULE_CYCLE} from '../../../../lib/schedule-validity';
import {maintenanceEvidenceSql} from '../../../../lib/maintenance-evidence';
import {peopleForRecords} from '../../../../lib/service-people';
import {getVisit} from '../../../../lib/visit-security';
import {first,all,noCache} from '../../../../lib/maintenance';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const id=new URL(request.url).searchParams.get('id')||'',visit=await getVisit(request,id);if(!visit||!id)return Response.json({error:'Informe um código válido para acessar este aparelho.'},{status:401,headers:noCache});
 const item=await first('SELECT e.id,e.revision,e.name,e.location,e.brand_model,e.serial,e.checklist,CASE WHEN e.identification_photo_key IS NULL THEN 0 ELSE 1 END has_identification_photo,p.name property_name,p.address FROM equipment e JOIN properties p ON p.id=e.property_id WHERE e.id=? AND e.owner_id=?',visit.equipment_id,visit.owner_id);
 if(!item)return Response.json({error:'Acesso indisponível.'},{status:401,headers:noCache});
 const history=await all(`SELECT ${maintenanceEvidenceSql('maintenance')} evidence_complete,evidence_version,evidence_note,id,revision,equipment_snapshot,service_date,service_time,responsible,notes,checklist,photo_count,created_at,completion_status,recorded_via FROM maintenance WHERE equipment_id=? AND owner_id=? AND is_test=0 ORDER BY service_date DESC,service_time DESC,created_at DESC,id DESC`,visit.equipment_id,visit.owner_id);
 const photos=await all('SELECT p.id,p.maintenance_id,p.position,p.phase FROM photos p JOIN maintenance m ON m.id=p.maintenance_id WHERE m.equipment_id=? AND m.owner_id=? AND p.owner_id=? AND m.is_test=0 ORDER BY p.position',visit.equipment_id,visit.owner_id,visit.owner_id);
 const schedule=await first(`SELECT s.last_service_date,s.due_date FROM maintenance_schedule s JOIN equipment e ON e.id=s.equipment_id AND e.owner_id=s.owner_id WHERE s.equipment_id=? AND s.owner_id=? AND ${VALID_SCHEDULE_CYCLE}`,visit.equipment_id,visit.owner_id);
 return Response.json({item,history:await peopleForRecords(visit.owner_id,'maintenance',history,{visitView:true,grantId:visit.grant_id}),photos,schedule,access:{technician_name:visit.technician_name,expires_at:visit.expires_at}},{headers:noCache});
 }catch{return Response.json({error:'Não foi possível carregar o aparelho.'},{status:503,headers:noCache});}}
