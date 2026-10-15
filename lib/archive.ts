import {all,clean,db,first} from './maintenance';
import {operatorGuard,recheckOperator,type Operator} from './app-access';
import {RequestError} from './http-security';
import {recomputeSchedule} from './maintenance-schedule';
import {isRegionalRequest} from './regional-access';

export const ARCHIVE_TABLES={property:'properties',equipment:'equipment',cleaning_location:'cleaning_locations',client:'clients',cost_center:'cost_centers'} as const;
export type ArchiveEntity=keyof typeof ARCHIVE_TABLES;
export type ArchiveAction='archive'|'restore';
export const ARCHIVE_LABELS:Record<ArchiveEntity,string>={property:'Imóvel',equipment:'Equipamento',cleaning_location:'Local de limpeza',client:'Cliente / unidade',cost_center:'Centro de custo'};
type ArchiveRecord={id:string;name:string;revision:number;archived_at:string|null;archive_event_id:string|null;property_id?:string;client_id?:string;worksite_id?:string|null};
type Guard={sql:string;args:(string|number)[]};
type Rule=Guard&{message:string};
export type ArchiveHistory={id:string;action:ArchiveAction;reason:string;actor_name:string;created_at:string};
export type ArchiveView={entity:ArchiveEntity;id:string;name:string;revision:number;archivedAt:string|null;action:ArchiveAction;blockers:string[];history:ArchiveHistory[];historyLimited:boolean};
export type ArchivedItem={id:string;name:string;revision:number;archived_at:string;parent_name:string|null;reason:string|null;actor_name:string|null};
export type ArchivedList={entity:ArchiveEntity;items:ArchivedItem[];availableEntities:ArchiveEntity[];nextOffset:number|null};

export function archiveEntity(value:unknown):ArchiveEntity{
 if(typeof value!=='string'||!Object.hasOwn(ARCHIVE_TABLES,value))throw new RequestError('Tipo de cadastro inválido.');
 return value as ArchiveEntity;
}
function requireEntityAccess(entity:ArchiveEntity){
 if(isRegionalRequest()&&(entity==='client'||entity==='cost_center'))throw new RequestError('Clientes e centros de custo são administrados pela gestão com acesso geral.',403);
}
async function archiveRow(ownerId:string,entity:ArchiveEntity,id:string):Promise<ArchiveRecord>{
 requireEntityAccess(entity);
 const parent=entity==='equipment'||entity==='cleaning_location'?',property_id':entity==='cost_center'?',client_id':entity==='property'?',worksite_id':'';
 const row=await first('SELECT id,name,revision,archived_at,archive_event_id'+parent+' FROM '+ARCHIVE_TABLES[entity]+' WHERE id=? AND owner_id=?',id,ownerId) as ArchiveRecord|null;
 if(!row)throw new RequestError('Cadastro não encontrado neste acesso.',404);
 return row;
}

// Repeat every dependency check in the guarded UPDATE. A preliminary read alone
// cannot protect against another session adding a child or reopening a work order.
function dependencyRules(ownerId:string,entity:ArchiveEntity,row:ArchiveRecord,action:ArchiveAction):Rule[]{
 const rules:Rule[]=[];
 const absent=(table:string,where:string,args:(string|number)[],message:string)=>rules.push({sql:'NOT EXISTS(SELECT 1 FROM '+table+' WHERE owner_id=? AND '+where+')',args:[ownerId,...args],message});
 if(action==='restore'){
  const table=entity==='equipment'||entity==='cleaning_location'?'properties':entity==='cost_center'?'clients':null;
  if(table)rules.push({sql:'EXISTS(SELECT 1 FROM '+table+' WHERE id=? AND owner_id=? AND archived_at IS NULL)',args:[row.property_id||row.client_id||'',ownerId],message:table==='properties'?'Restaure primeiro o imóvel ao qual este cadastro está vinculado.':'Restaure primeiro o cliente ao qual este centro de custo está vinculado.'});
  if(entity==='property'&&row.worksite_id)rules.push({sql:'EXISTS(SELECT 1 FROM cost_centers WHERE id=? AND owner_id=? AND archived_at IS NULL)',args:[row.worksite_id,ownerId],message:'Restaure primeiro o centro de custo ao qual este imóvel está vinculado.'});
  return rules;
 }
 if(entity==='property'){
  absent('occupancy_stays','property_id=? AND exit_on IS NULL',[row.id],'Registre a saída das ocupações ativas antes de arquivar este imóvel.');
  absent('equipment','property_id=? AND archived_at IS NULL',[row.id],'Arquive primeiro os equipamentos ativos deste imóvel.');
  absent('cleaning_locations','property_id=? AND archived_at IS NULL',[row.id],'Arquive primeiro os locais de limpeza ativos deste imóvel.');
 }
 if(entity==='client')absent('cost_centers','client_id=? AND archived_at IS NULL',[row.id],'Arquive primeiro os centros de custo ativos deste cliente.');
 if(entity==='cost_center')absent('properties','worksite_id=? AND archived_at IS NULL',[row.id],'Este centro de custo ainda está vinculado a um imóvel ativo. Altere o vínculo ou arquive o imóvel primeiro.');
 const relation=entity==='property'?'property_id':entity==='client'?'client_id':entity==='cost_center'?'cost_center_id':null;
 if(relation){
  absent('work_orders',relation+"=? AND status<>'completed'",[row.id],'Conclua as ordens de serviço vinculadas antes de arquivar este cadastro.');
  absent('housing_handovers',relation+'=? AND returned_on IS NULL',[row.id],'Registre a devolução das entregas em uso antes de arquivar este cadastro.');
  absent('mobilizations',relation+'=? AND NOT EXISTS(SELECT 1 FROM housing_handovers h WHERE h.id=mobilizations.handover_id AND h.owner_id=mobilizations.owner_id AND h.property_id=mobilizations.property_id AND h.client_id=mobilizations.client_id AND h.cost_center_id=mobilizations.cost_center_id)',[row.id],'Conclua a preparação e confira o vínculo da entrega nas mobilizações antes de arquivar este cadastro.');
 }
 return rules;
}
async function blockersFor(rules:Rule[]){
 const result=await Promise.all(rules.map(async rule=>await first('SELECT 1 allowed WHERE '+rule.sql,...rule.args)?null:rule.message));
 return result.filter((message):message is string=>message!==null);
}

export async function archiveView(op:Operator,entity:ArchiveEntity,id:string):Promise<ArchiveView>{
 const row=await archiveRow(op.ownerId,entity,id),action:ArchiveAction=row.archived_at?'restore':'archive';
 const [blockers,events]=await Promise.all([
  blockersFor(dependencyRules(op.ownerId,entity,row,action)),
  all('SELECT id,action,reason,actor_name,created_at FROM archive_events WHERE owner_id=? AND entity_type=? AND entity_id=? ORDER BY created_at DESC,id DESC LIMIT 21',op.ownerId,entity,id),
 ]);
 await recheckOperator(op);
 return {entity,id:row.id,name:row.name,revision:row.revision,archivedAt:row.archived_at,action,blockers,history:events.slice(0,20) as ArchiveHistory[],historyLimited:events.length>20};
}

export async function archivedList(op:Operator,entity:ArchiveEntity,offset=0):Promise<ArchivedList>{
 requireEntityAccess(entity);
 if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new RequestError('Página inválida.');
 const table=ARCHIVE_TABLES[entity],parent=entity==='equipment'||entity==='cleaning_location'?'properties':entity==='cost_center'?'clients':null;
 const join=parent?' LEFT JOIN '+parent+' p ON p.id=t.'+(parent==='properties'?'property_id':'client_id')+' AND p.owner_id=t.owner_id':'';
 const rows=await all('SELECT t.id,t.name,t.revision,t.archived_at,'+(parent?'p.name':'NULL')+' parent_name,a.reason,a.actor_name FROM '+table+' t'+join+' LEFT JOIN archive_events a ON a.id=t.archive_event_id AND a.owner_id=t.owner_id AND a.entity_type=? AND a.entity_id=t.id WHERE t.owner_id=? AND t.archived_at IS NOT NULL ORDER BY t.archived_at DESC,t.id LIMIT 51 OFFSET ?',entity,op.ownerId,offset);
 await recheckOperator(op);
 return {entity,items:rows.slice(0,50) as ArchivedItem[],availableEntities:(Object.keys(ARCHIVE_TABLES) as ArchiveEntity[]).filter(key=>!isRegionalRequest()||key!=='client'&&key!=='cost_center'),nextOffset:rows.length>50?offset+50:null};
}

export async function applyArchive(op:Operator,input:Record<string,unknown>){
 const entity=archiveEntity(input.entity),id=clean(input.id,80),action=input.action,expected=input.expected_revision,requestId=clean(input.request_id,60),reason=clean(input.reason,1000);
 if(!id||(action!=='archive'&&action!=='restore')||input.confirmed!==true||typeof expected!=='number'||!Number.isSafeInteger(expected)||expected<0||typeof input.reason!=='string'||input.reason.trim().length>1000||!reason||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId))throw new RequestError('Informe o motivo e confirme a ação sobre este cadastro.');
 await recheckOperator(op);
 // Resolve the target before looking up a retry, including for an archived item.
 // Idempotency must never disclose that a target exists outside the live scope.
 const row=await archiveRow(op.ownerId,entity,id);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({entity,id,action,expected,reason,actor:op.actor.userId})));
 const fingerprint=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const replay=()=>first('SELECT id,request_fingerprint FROM archive_events WHERE owner_id=? AND entity_type=? AND entity_id=? AND request_id=?',op.ownerId,entity,id,requestId) as Promise<{id:string;request_fingerprint:string}|null>;
 const prior=await replay();
 if(prior){if(prior.request_fingerprint!==fingerprint)throw new RequestError('Este pedido já foi usado com outros dados. Reabra a confirmação.',409);return {id,event_id:prior.id,action,alreadySaved:true};}
 if(row.revision!==expected)throw new RequestError('O cadastro mudou em outra sessão. Reabra a confirmação para conferir os dados atuais.',409);
 if((action==='archive')===!!row.archived_at)throw new RequestError(row.archived_at?'Este cadastro já está arquivado. Atualize a página.':'Este cadastro já está ativo. Atualize a página.',409);
 const rules=dependencyRules(op.ownerId,entity,row,action),blockers=await blockersFor(rules);
 if(blockers.length)throw new RequestError(blockers.join(' '),409);
 await recheckOperator(op);
 const auth=operatorGuard(op),eventId=crypto.randomUUID(),now=new Date().toISOString(),table=ARCHIVE_TABLES[entity];
 const guard:Guard={sql:'EXISTS(SELECT 1 FROM '+table+' WHERE id=? AND owner_id=? AND archive_event_id=? AND revision=?)',args:[id,op.ownerId,eventId,expected+1]};
 const statements=[
  db().prepare('UPDATE '+table+' SET archived_at=?,archive_event_id=?,revision=revision+1 WHERE id=? AND owner_id=? AND revision=? AND archived_at IS '+(action==='archive'?'NULL':'NOT NULL')+' AND '+auth.sql+rules.map(rule=>' AND '+rule.sql).join('')+' AND NOT EXISTS(SELECT 1 FROM archive_events WHERE request_id=?)').bind(action==='archive'?now:null,eventId,id,op.ownerId,expected,...auth.args,...rules.flatMap(rule=>rule.args),requestId),
  db().prepare('INSERT INTO archive_events (id,owner_id,entity_type,entity_id,action,reason,actor_user_id,actor_name,request_id,request_fingerprint,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE '+guard.sql).bind(eventId,op.ownerId,entity,id,action,reason,op.actor.userId,op.actor.fullName||op.actor.displayName,requestId,fingerprint,now,...guard.args),
 ];
 if(entity==='property'||entity==='equipment'||entity==='cleaning_location'){
  const source=entity==='property'?'properties p':'properties p JOIN '+table+' t ON t.property_id=p.id AND t.owner_id=p.owner_id';
  const target=entity==='property'?'p.id':'t.id';
  statements.push(db().prepare("INSERT INTO regional_snapshots (id,entity_type,entity_id,property_id,state_code,worksite_id,created_at) SELECT ?,'archive_event',?,p.id,p.state_code,p.worksite_id,? FROM "+source+' WHERE '+target+'=? AND p.owner_id=? AND EXISTS(SELECT 1 FROM archive_events WHERE id=? AND owner_id=?)').bind('archive_event:'+eventId,eventId,now,id,op.ownerId,eventId,op.ownerId));
 }
 if(entity==='equipment'){
  if(action==='archive')statements.push(db().prepare('DELETE FROM maintenance_schedule WHERE equipment_id=? AND owner_id=? AND '+guard.sql).bind(id,op.ownerId,...guard.args));
  else{
   statements.push(db().prepare('INSERT INTO maintenance_schedule (equipment_id,owner_id,equipment_name,property_name,address,location,interval_days,alert_days_before,updated_at) SELECT e.id,e.owner_id,e.name,p.name,p.address,e.location,90,5,? FROM equipment e JOIN properties p ON p.id=e.property_id AND p.owner_id=e.owner_id WHERE e.id=? AND e.owner_id=? AND e.archived_at IS NULL AND p.archived_at IS NULL AND '+guard.sql+' ON CONFLICT(equipment_id) DO UPDATE SET equipment_name=excluded.equipment_name,property_name=excluded.property_name,address=excluded.address,location=excluded.location,interval_days=excluded.interval_days,alert_days_before=excluded.alert_days_before,updated_at=excluded.updated_at WHERE maintenance_schedule.owner_id=excluded.owner_id AND '+guard.sql).bind(now,id,op.ownerId,...guard.args,...guard.args));
   statements.push(recomputeSchedule(op.ownerId,id,now,undefined,guard));
  }
 }
 const result=await db().batch(statements);
 if(!result[0].meta.changes){
  await recheckOperator(op);
  const same=await replay();
  if(same?.request_fingerprint===fingerprint)return {id,event_id:same.id,action,alreadySaved:true};
  throw new RequestError('O cadastro, um vínculo ou uma permissão mudou. Reabra a confirmação antes de salvar.',409);
 }
 return {id,event_id:eventId,action,revision:expected+1,archivedAt:action==='archive'?now:null};
}
