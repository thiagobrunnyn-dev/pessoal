import {maintenanceEvidenceSql} from './maintenance-evidence';
import {db} from './maintenance';
// Run in the same D1 batch as the insert/classification. Candidates are read inside
// that transaction, so concurrent visits cannot be overwritten by a stale JS read.
export function recomputeSchedule(ownerId:string,equipmentId:string,now:string,requiredRecordId?:string,authorization?:{sql:string;args:(string|number)[]}){
 const statement=`WITH candidates AS (
 SELECT service_date last_date,id cycle_id,service_time sort_time,created_at sort_created,1 priority FROM maintenance m WHERE equipment_id=? AND owner_id=? AND is_test=0 AND completion_status='completed' AND ${maintenanceEvidenceSql('m')}
 UNION ALL
 SELECT baseline_date,'baseline:'||id||':'||baseline_date,'','',0 FROM equipment WHERE id=? AND owner_id=? AND baseline_date IS NOT NULL
 ), chosen AS (SELECT last_date,cycle_id FROM candidates ORDER BY last_date DESC,priority DESC,sort_time DESC,sort_created DESC,cycle_id DESC LIMIT 1)
 UPDATE maintenance_schedule SET last_service_date=(SELECT last_date FROM chosen),due_date=(SELECT date(last_date,'+90 days') FROM chosen),alert_date=(SELECT date(last_date,'+85 days') FROM chosen),cycle_id=(SELECT cycle_id FROM chosen),updated_at=? WHERE equipment_id=? AND owner_id=?${requiredRecordId?' AND EXISTS(SELECT 1 FROM maintenance WHERE id=? AND owner_id=? AND equipment_id=?)':''}${authorization?' AND '+authorization.sql:''}`;
 return db().prepare(statement).bind(equipmentId,ownerId,equipmentId,ownerId,now,equipmentId,ownerId,...(requiredRecordId?[requiredRecordId,ownerId,equipmentId]:[]),...(authorization?.args||[]));
}
