import {maintenanceEvidenceSql} from './maintenance-evidence';
import {hubRequests,type HubRequestRow} from './hub-requests';
import {first} from './maintenance';
import {resolveOperationFilters,operationPropertyPredicate,type ResolvedOperationFilters} from './operation-filters';

export type OccupancyChartRow={property_id:string;control_number:number|null;name:string;guests:number;available:number|null;capacity:number|null;room_count:number};
export type ServiceSource='orders'|'air'|'cleaning';
export type ServiceStatus='open'|'in_progress'|'pending'|'completed'|'not_performed';
export type ServiceChartRow={status:ServiceStatus;orders:number;air:number;cleaning:number;total:number};
export type HubSummary=ResolvedOperationFilters&{
 requests:HubRequestRow[];
 counts:{equipment:number;properties:number;completed:number;overdue:number};
 charts:{occupancy:OccupancyChartRow[];services:ServiceChartRow[]};
 occupancy:{guests:number;available:number|null;confirmed_capacity:number;unknown_properties:number;room_count:number};
 pending:{total:number;orders:number;air:number;cleaning:number};
 nextMaintenance:null|{equipment_id:string;equipment_name:string;property_name:string;location:string;due_date:string};
 today:string;asOf:string;
};
const validCycle=`((e.baseline_date IS NOT NULL AND s.cycle_id='baseline:'||e.id||':'||e.baseline_date)
 OR EXISTS(SELECT 1 FROM maintenance m WHERE m.id=s.cycle_id AND m.owner_id=s.owner_id
 AND m.equipment_id=e.id AND m.is_test=0 AND m.completion_status='completed' AND ${maintenanceEvidenceSql('m')}))`;
const scheduleFrom=`FROM maintenance_schedule s JOIN equipment e ON e.id=s.equipment_id AND e.owner_id=s.owner_id
 JOIN properties p ON p.id=e.property_id AND p.owner_id=e.owner_id
 WHERE s.owner_id=? AND e.archived_at IS NULL AND p.archived_at IS NULL AND s.due_date IS NOT NULL AND ${validCycle}`;
const number=(value:unknown)=>{const n=Number(value??0);if(!Number.isSafeInteger(n)||n<0)throw new Error('Resumo operacional inconsistente');return n;};

/** One scoped option read and four scoped aggregate reads shared by cards/charts; only property labels and counts, never people or histories. */
export async function hubData(ownerId:string,query=new URLSearchParams()):Promise<HubSummary>{
 const resolved=await resolveOperationFilters(ownerId,query),scope=operationPropertyPredicate(resolved.filters),historical=operationPropertyPredicate(resolved.filters,'hp');
 const filtered=Object.values(resolved.filters).some(Boolean);
 const historyScope=filtered?`EXISTS(SELECT 1 FROM equipment he JOIN properties hp ON hp.id=he.property_id AND hp.owner_id=he.owner_id WHERE he.id=m.equipment_id AND he.owner_id=m.owner_id AND ${historical.sql})`:'1';
 const scopedSchedule=scheduleFrom+' AND '+scope.sql;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Belem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [requests,counts,occupancy,next]=await Promise.all([
  hubRequests(ownerId,resolved.filters,today),
  first(`SELECT
   (SELECT count(*) FROM equipment e JOIN properties p ON p.id=e.property_id AND p.owner_id=e.owner_id WHERE e.owner_id=? AND e.archived_at IS NULL AND p.archived_at IS NULL AND ${scope.sql}) equipment,
   (SELECT count(*) FROM maintenance m WHERE m.owner_id=? AND m.is_test=0 AND m.completion_status='completed' AND ${maintenanceEvidenceSql('m')} AND ${historyScope}) completed,
   (SELECT count(*) ${scopedSchedule} AND s.due_date<?) overdue,
   (SELECT json_group_array(json_object('source',source,'status',status,'total',total)) FROM (
    SELECT source,status,count(*) total FROM (
     SELECT 'orders' source,w.status FROM work_orders w JOIN properties p ON p.id=w.property_id AND p.owner_id=w.owner_id
     WHERE w.owner_id=? AND p.archived_at IS NULL AND ${scope.sql}
     UNION ALL
     SELECT 'air',completion_status FROM (
      SELECT CASE WHEN m.completion_status='completed' AND NOT ${maintenanceEvidenceSql('m')} THEN 'pending' ELSE m.completion_status END completion_status,row_number() OVER(PARTITION BY m.equipment_id ORDER BY m.service_date DESC,m.service_time DESC,m.created_at DESC,m.id DESC) latest
      FROM maintenance m JOIN equipment e ON e.id=m.equipment_id AND e.owner_id=m.owner_id
      JOIN properties p ON p.id=e.property_id AND p.owner_id=e.owner_id
      WHERE m.owner_id=? AND m.is_test=0 AND e.archived_at IS NULL AND p.archived_at IS NULL AND ${scope.sql}
     ) WHERE latest=1
     UNION ALL
     SELECT 'cleaning',completion_status FROM (
      SELECT c.completion_status,row_number() OVER(PARTITION BY c.location_id,c.frequency ORDER BY c.service_date DESC,c.service_time DESC,c.created_at DESC,c.id DESC) latest
      FROM cleaning_records c JOIN cleaning_locations l ON l.id=c.location_id AND l.owner_id=c.owner_id
      JOIN properties p ON p.id=l.property_id AND p.owner_id=l.owner_id
      WHERE c.owner_id=? AND c.is_test=0 AND l.archived_at IS NULL AND p.archived_at IS NULL AND ${scope.sql}
     ) WHERE latest=1
    ) GROUP BY source,status
   )) services_json`,
   ownerId,...scope.args,ownerId,...(filtered?historical.args:[]),ownerId,...scope.args,today,ownerId,...scope.args,ownerId,...scope.args,ownerId,...scope.args),
  first(`SELECT count(*) properties_total,
   COALESCE(sum(CASE WHEN room_count=0 OR unknown_rooms>0 THEN 1 ELSE 0 END),0) unknown_properties,
   COALESCE(sum(room_count),0) room_count,COALESCE(sum(confirmed_capacity),0) confirmed_capacity,COALESCE(sum(guests),0) guests,
   json_group_array(json_object('property_id',id,'control_number',control_number,'name',name,'room_count',room_count,'unknown_rooms',unknown_rooms,'confirmed_capacity',confirmed_capacity,'guests',guests)) properties_json
   FROM (
    SELECT p.id,p.control_number,p.name,count(r.id) room_count,
     sum(CASE WHEN r.id IS NOT NULL AND (r.capacity IS NULL OR r.capacity_confirmed<>1) THEN 1 ELSE 0 END) unknown_rooms,
     sum(CASE WHEN r.capacity_confirmed=1 THEN COALESCE(r.capacity,0) ELSE 0 END) confirmed_capacity,
     (SELECT count(DISTINCT s.person_profile_id) FROM occupancy_stays s JOIN occupancy_rooms current_room ON current_room.id=s.room_id AND current_room.owner_id=s.owner_id
      WHERE s.owner_id=p.owner_id AND s.property_id=p.id AND s.exit_on IS NULL
      AND s.state_code IS p.state_code AND s.worksite_id IS p.worksite_id AND s.scope_version=COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)
      AND current_room.property_id=p.id AND current_room.state_code IS p.state_code AND current_room.worksite_id IS p.worksite_id AND current_room.scope_version=s.scope_version) guests
    FROM properties p LEFT JOIN occupancy_rooms r ON r.property_id=p.id AND r.owner_id=p.owner_id
     AND r.state_code IS p.state_code AND r.worksite_id IS p.worksite_id AND r.scope_version=COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)
    WHERE p.owner_id=? AND p.archived_at IS NULL AND ${scope.sql} GROUP BY p.id ORDER BY p.control_number,p.name,p.id
   ) current_occupancy`,ownerId,...scope.args),
  first(`SELECT s.equipment_id,s.equipment_name,s.property_name,s.location,s.due_date ${scopedSchedule} ORDER BY s.due_date,s.equipment_name LIMIT 1`,ownerId,...scope.args)
 ]);
 if(!counts||!occupancy)throw new Error('Resumo operacional indisponível');
 const services:ServiceChartRow[]=(['open','in_progress','pending','completed','not_performed'] as ServiceStatus[]).map(status=>({status,orders:0,air:0,cleaning:0,total:0}));
 const statusMap:Record<string,ServiceStatus>={open:'open',in_progress:'in_progress',paused:'pending',with_pending:'pending',completed:'completed',not_performed:'not_performed'};
 const serviceRows=JSON.parse(counts.services_json||'[]');if(!Array.isArray(serviceRows))throw new Error('Situação dos serviços indisponível');
 for(const row of serviceRows){const source=row.source as ServiceSource,status=statusMap[row.status];if(!['orders','air','cleaning'].includes(source)||!status)throw new Error('Situação dos serviços inconsistente');const bucket=services.find(s=>s.status===status)!;bucket[source]+=number(row.total);bucket.total+=number(row.total);}
 const pending={orders:0,air:0,cleaning:0};for(const row of services)if(['open','in_progress','pending'].includes(row.status))for(const source of ['orders','air','cleaning'] as ServiceSource[])pending[source]+=row[source];
 const propertyRows=JSON.parse(occupancy.properties_json||'[]');if(!Array.isArray(propertyRows))throw new Error('Ocupação dos imóveis indisponível');
 const properties:OccupancyChartRow[]=propertyRows.map((p:any)=>{const guests=number(p.guests),rooms=number(p.room_count),known=rooms>0&&number(p.unknown_rooms)===0,capacity=known?number(p.confirmed_capacity):null;if(capacity!==null&&guests>capacity)throw new Error('Capacidade e ocupação inconsistentes');return {property_id:p.property_id,control_number:p.control_number===null?null:number(p.control_number),name:p.name,guests,capacity,available:capacity===null?null:capacity-guests,room_count:rooms};});
 const guests=number(occupancy.guests),capacity=number(occupancy.confirmed_capacity),unknown=number(occupancy.unknown_properties);
 const complete=number(occupancy.properties_total)>0&&unknown===0;
 if(complete&&guests>capacity)throw new Error('Capacidade e ocupação inconsistentes');
 return {...resolved,requests,counts:{equipment:number(counts.equipment),properties:number(occupancy.properties_total),completed:number(counts.completed),overdue:number(counts.overdue)},
  occupancy:{guests,available:complete?capacity-guests:null,confirmed_capacity:capacity,unknown_properties:unknown,room_count:number(occupancy.room_count)},
  charts:{occupancy:properties,services},pending:{...pending,total:pending.orders+pending.air+pending.cleaning},nextMaintenance:next as HubSummary['nextMaintenance'],today,asOf:new Date().toISOString()};
}
