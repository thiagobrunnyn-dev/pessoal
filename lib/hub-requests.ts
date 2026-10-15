import {all} from './maintenance';
import {isRegionalRequest} from './regional-access';
import {operationPropertyPredicate} from './operation-filters';
import type {OperationFilters} from './operation-filter-values';
import {INTAKE_STATUSES,type IntakeKind} from './request-intake-model';
export type RequestStatus=keyof typeof INTAKE_STATUSES;
export type HubRequestRow={kind:IntakeKind;total:number;statuses:Record<RequestStatus,number>;due_today:number;past_due:number};
export const operationToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Belem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
/** Only the declared date is extracted; no descriptions, contacts, files or personal fields leave the aggregate query. */
export const requestNeededOnSql="CASE WHEN json_valid(r.values_json) THEN json_extract(r.values_json,'$.needed_on') END";
export const requestDeadlineSql=`r.kind='purchase' AND r.status<>'closed' AND length(${requestNeededOnSql})=10 AND ${requestNeededOnSql} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${requestNeededOnSql},'+0 days')=${requestNeededOnSql}`;
/** Unverified/unlinked requests belong only to the unfiltered global inbox. Filtered counts use current property scope, never user-entered place/company text. */
export function hubRequestPredicate(filters:OperationFilters){
 const scope=operationPropertyPredicate(filters),filtered=Object.values(filters).some(Boolean);
 if(!filtered&&!isRegionalRequest())return {sql:'1',args:[] as unknown[]};
 return {sql:`r.assigned_at IS NOT NULL AND EXISTS(SELECT 1 FROM properties p WHERE p.id=r.property_id AND p.owner_id=r.owner_id AND p.archived_at IS NULL AND p.state_code IS r.state_code AND p.worksite_id IS r.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=r.scope_version AND ${scope.sql})`,args:scope.args};
}
export async function hubRequests(owner:string,filters:OperationFilters,today=operationToday()):Promise<HubRequestRow[]>{
 const scope=hubRequestPredicate(filters);
 const rows=await all(`SELECT r.kind,r.status,count(*) total,sum(CASE WHEN ${requestDeadlineSql} AND ${requestNeededOnSql}=? THEN 1 ELSE 0 END) due_today,sum(CASE WHEN ${requestDeadlineSql} AND ${requestNeededOnSql}<? THEN 1 ELSE 0 END) past_due FROM request_intakes r WHERE r.owner_id=? AND ${scope.sql} GROUP BY r.kind,r.status`,today,today,owner,...scope.args);
 const result:HubRequestRow[]=(['maintenance','purchase'] as IntakeKind[]).map(kind=>({kind,total:0,statuses:{received:0,reviewing:0,linked_order:0,approved:0,closed:0},due_today:0,past_due:0}));
 for(const row of rows){const target=result.find(r=>r.kind===row.kind);if(!target||!Object.hasOwn(INTAKE_STATUSES,row.status))throw Error('Solicitações inconsistentes.');for(const key of ['total','due_today','past_due'])if(!Number.isSafeInteger(row[key])||row[key]<0)throw Error('Solicitações inconsistentes.');target.total+=row.total;target.statuses[row.status as RequestStatus]+=row.total;target.due_today+=row.due_today;target.past_due+=row.past_due;}
 return result;
}
