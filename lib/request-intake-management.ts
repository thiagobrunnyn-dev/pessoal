import {resolveOperationFilters} from './operation-filters';
import {hubRequestPredicate,requestDeadlineSql,requestNeededOnSql,operationToday} from './hub-requests';
import {all,first,db,bucket} from './maintenance';
import {operatorGuard,MEMBER_INVITATIONS,type Operator} from './app-access';
import {serviceReadGuard} from './service-providers';
import {isRegionalRequest,requireGlobalCatalog} from './regional-access';
import {RequestError} from './http-security';
import {guestUuid,guestText} from './guest-channel-model';
import {GUEST_HEADERS,hashBytes} from './guest-channel-public';
import {sha256} from './visit-security';
import {INTAKE_KINDS,INTAKE_STATUSES} from './request-intake-model';
const missing=()=>new RequestError('Solicitação indisponível neste acesso.',404);
const conflict=()=>Object.assign(new RequestError('A solicitação ou o acesso mudou. Atualize antes de salvar.',409),{code:'intake_not_saved'});
const states=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const optionalId=(v:unknown)=>{if(v===undefined||v===null||v==='')return null;if(typeof v!=='string'||!guestUuid.test(v))throw new RequestError('Confira os vínculos selecionados.');return v;};
async function property(op:Operator,id:string){const p=await first('SELECT p.id,p.name,p.address,p.state_code,p.worksite_id,p.revision,p.archived_at,COALESCE(s.version,0) scope_version FROM properties p LEFT JOIN occupancy_property_scopes s ON s.property_id=p.id WHERE p.owner_id=? AND p.id=?',op.ownerId,id);if(!p)throw missing();return p;}
const scopeMatches=(r:any,p:any)=>!p.archived_at&&r.state_code===p.state_code&&r.worksite_id===p.worksite_id&&r.scope_version===p.scope_version;
function propertyGuard(op:Operator,p:any){return {sql:'EXISTS(SELECT 1 FROM properties p WHERE p.id=? AND p.owner_id=? AND p.revision=? AND p.archived_at IS NULL AND p.state_code IS ? AND p.worksite_id IS ? AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=?)',args:[p.id,op.ownerId,p.revision,p.state_code,p.worksite_id,p.scope_version]};}
async function responsibleOptions(op:Operator){const rows=await all("SELECT user_id,email,display_name,role,revision FROM app_members WHERE status='active' ORDER BY display_name");return [{id:op.ownerId,name:'Administrador · administrador',revision:0},...rows.filter(r=>MEMBER_INVITATIONS.some(i=>i.email===r.email&&i.role===r.role)).map(r=>({id:r.user_id,name:r.display_name||MEMBER_INVITATIONS.find(i=>i.email===r.email)!.name,revision:r.revision,email:r.email}))];}
function safe(r:any){return {id:r.id,kind:r.kind,protocol:r.protocol,received_at:r.received_at,status:r.status,revision:r.revision,property_id:r.property_id,client_id:r.client_id,cost_center_id:r.cost_center_id,state_code:r.state_code,assigned_at:r.assigned_at,responsible_name:r.responsible_name,responsible_user_id:r.responsible_user_id,linked_order_id:r.linked_order_id,values:JSON.parse(r.values_json)};}
export async function intakeList(op:Operator,q:URLSearchParams){
 await serviceReadGuard(op);const kind=q.get('kind')||'',status=q.get('status')||'',mine=q.get('mine')==='1';
 if(kind&&!Object.hasOwn(INTAKE_KINDS,kind)||status&&!Object.hasOwn(INTAKE_STATUSES,status))throw new RequestError('Filtro inválido.');
 const cursor=q.get('cursor')||'',parts=cursor.split('|');if(cursor&&(parts.length!==2||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parts[0])||!guestUuid.test(parts[1])))throw new RequestError('Atualize a consulta.');
 const overview=q.get('overview')==='1',alert=q.get('alert')||'';
 if(alert&&!['due_today','past_due'].includes(alert))throw new RequestError('Filtro inválido.');
 const scope=overview?hubRequestPredicate((await resolveOperationFilters(op.ownerId,q)).filters):{sql:'1',args:[] as unknown[]};
 const where='owner_id=?'+(kind?' AND kind=?':'')+(status?' AND status=?':'')+(mine?' AND responsible_user_id=?':'')+(cursor?' AND (received_at<? OR (received_at=? AND id<?))':'')+' AND '+scope.sql+(alert?` AND ${requestDeadlineSql} AND ${requestNeededOnSql}${alert==='due_today'?'=':'<'}?`:'');
 const args=[op.ownerId,...kind?[kind]:[],...status?[status]:[],...mine?[op.actor.userId]:[],...cursor?[parts[0],parts[0],parts[1]]:[],...scope.args,...alert?[operationToday()]:[]];
 const rows=await all(`SELECT id,kind,protocol,received_at,status,revision,state_code,assigned_at,responsible_name,values_json FROM request_intakes r WHERE ${where} ORDER BY received_at DESC,id DESC LIMIT 101`,...args);
 await serviceReadGuard(op);return {requests:rows.slice(0,100).map(r=>{const v=JSON.parse(r.values_json);return {id:r.id,kind:r.kind,protocol:r.protocol,received_at:r.received_at,status:r.status,name:v.name,location:v.location,address:v.address,responsible_name:r.responsible_name,assigned:!!r.assigned_at};}),next_cursor:rows.length>100?rows[99].received_at+'|'+rows[99].id:null,can_assign:!isRegionalRequest()};
}
export async function intakeDetail(op:Operator,id:string){
 await serviceReadGuard(op);if(!guestUuid.test(id))throw missing();const r=await first('SELECT * FROM request_intakes WHERE owner_id=? AND id=?',op.ownerId,id);if(!r)throw missing();
 const p=r.property_id?await property(op,r.property_id):null,scopeChanged=!!p&&!scopeMatches(r,p),global=!isRegionalRequest();
 const events=await all('SELECT id,action,before_status,after_status,note,actor_name,created_at FROM request_intake_events WHERE owner_id=? AND intake_id=? ORDER BY revision DESC LIMIT 50',op.ownerId,id),files=await all('SELECT id,position FROM request_intake_files WHERE owner_id=? AND intake_id=? ORDER BY position',op.ownerId,id);
 const orders=r.kind==='maintenance'&&p&&!scopeChanged?await all('SELECT id,description,status,version FROM work_orders WHERE owner_id=? AND property_id=? ORDER BY updated_at DESC LIMIT 100',op.ownerId,p.id):[];
 const catalogs=global?{properties:await all('SELECT id,name,control_number,state_code,worksite_id FROM properties WHERE owner_id=? AND archived_at IS NULL ORDER BY control_number,name',op.ownerId),clients:await all('SELECT id,name FROM clients WHERE owner_id=? AND archived_at IS NULL ORDER BY name',op.ownerId),cost_centers:await all('SELECT id,name,client_id FROM cost_centers WHERE owner_id=? AND archived_at IS NULL ORDER BY name',op.ownerId),responsibles:await responsibleOptions(op)}:null;
 await serviceReadGuard(op);if(!await first('SELECT id FROM request_intakes WHERE id=? AND owner_id=? AND revision=?',id,op.ownerId,r.revision))throw conflict();
 return {request:{...safe(r),property_name:p?.name||null,scope_changed:scopeChanged,can_triage:!scopeChanged,can_assign:global},events,files,orders,catalogs};
}
export async function triageIntake(op:Operator,v:any){
 await serviceReadGuard(op);
 const fields=['id','revision','action','note','order_id','request_id','confirmed','property_id','client_id','cost_center_id','state_code','responsible_user_id'];
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!fields.includes(k))||!guestUuid.test(v.id)||!guestUuid.test(v.request_id)||!Number.isSafeInteger(v.revision)||v.revision<1||!['assign','responsible','review','approve_purchase','close','reopen','link_order'].includes(v.action)||v.confirmed!==true)throw new RequestError('Confira e confirme a atualização.');
 if(!['assign','responsible'].includes(v.action)&&['property_id','client_id','cost_center_id','state_code','responsible_user_id'].some(k=>v[k]!==undefined))throw new RequestError('Os vínculos só podem ser definidos na triagem.');
 if(v.action==='responsible'&&['property_id','client_id','cost_center_id','state_code'].some(k=>v[k]!==undefined))throw new RequestError('Não altere os vínculos ao definir o responsável.');
 if(['assign','responsible'].includes(v.action))requireGlobalCatalog();
 const note=guestText(v.note??'',2000,['assign','approve_purchase','close','reopen'].includes(v.action)),orderId=optionalId(v.order_id);
 if((v.action==='link_order')!==!!orderId)throw new RequestError('Confira a ordem de serviço.');
 const r=await first('SELECT * FROM request_intakes WHERE owner_id=? AND id=?',op.ownerId,v.id);if(!r)throw missing();
 const fingerprint=await sha256(JSON.stringify({actor:op.actor.userId,...v,note}));
 const replay=async()=>{const event=await first('SELECT intake_id,revision,request_fingerprint FROM request_intake_events WHERE owner_id=? AND request_id=? AND intake_id=?',op.ownerId,v.request_id,r.id);if(!event)return null;if(event.request_fingerprint!==fingerprint)throw conflict();await serviceReadGuard(op);return {id:event.intake_id,revision:event.revision,alreadySaved:true};};const previous=await replay();if(previous)return previous;
 if(r.revision!==v.revision)throw conflict();
 let p=r.property_id?await property(op,r.property_id):null;
 if(p&&!scopeMatches(r,p))throw conflict();
 if(v.action==='assign'&&(r.assigned_at||r.status==='closed')||v.action==='responsible'&&!r.assigned_at||v.action==='approve_purchase'&&(r.kind!=='purchase'||!r.assigned_at||!['received','reviewing'].includes(r.status))||v.action==='link_order'&&(r.kind!=='maintenance'||!p||r.linked_order_id||r.status==='closed')||v.action==='review'&&!['received','reviewing'].includes(r.status)||v.action==='close'&&r.status==='closed'||v.action==='reopen'&&r.status!=='closed')throw Object.assign(new RequestError('Essa ação não está disponível nesta situação.',409),{code:'intake_not_saved'});
 let propertyId=r.property_id,clientId=r.client_id,centerId=r.cost_center_id,state=r.state_code,worksite=r.worksite_id,scope=r.scope_version,assignedAt=r.assigned_at,responsibleId=r.responsible_user_id,responsibleName=r.responsible_name;
 const guards:{sql:string;args:unknown[]}[]=[operatorGuard(op)];
 const now=new Date().toISOString();
 if(v.action==='assign'){
  propertyId=optionalId(v.property_id);clientId=optionalId(v.client_id);centerId=optionalId(v.cost_center_id);
  p=propertyId?await property(op,propertyId):null;if(p?.archived_at)throw conflict();
  state=p?p.state_code:guestText(v.state_code??'',2,true);if(!states.has(state))throw new RequestError('Confirme a UF do atendimento.');
  worksite=p?.worksite_id??null;scope=p?.scope_version??null;assignedAt=now;
  if(r.kind==='maintenance'&&!p)throw new RequestError('Vincule a manutenção ao imóvel conferido.');
  if(centerId){const c=await first('SELECT id,client_id,revision FROM cost_centers WHERE id=? AND owner_id=? AND archived_at IS NULL',centerId,op.ownerId);if(!c||clientId&&clientId!==c.client_id)throw new RequestError('Empresa e centro de custo não correspondem.');clientId=c.client_id;guards.push({sql:'EXISTS(SELECT 1 FROM cost_centers WHERE id=? AND owner_id=? AND revision=? AND client_id=? AND archived_at IS NULL)',args:[c.id,op.ownerId,c.revision,c.client_id]});}
  if(clientId){const c=await first('SELECT id,revision FROM clients WHERE id=? AND owner_id=? AND archived_at IS NULL',clientId,op.ownerId);if(!c)throw missing();guards.push({sql:'EXISTS(SELECT 1 FROM clients WHERE id=? AND owner_id=? AND revision=? AND archived_at IS NULL)',args:[c.id,op.ownerId,c.revision]});}
 }
 if(['assign','responsible'].includes(v.action)){
  const id=v.responsible_user_id??'';if(typeof id!=='string'||id.length>120)throw new RequestError('Confira o responsável.');
  const choices=await responsibleOptions(op),person=id?choices.find(x=>x.id===id):null;if(id&&!person)throw new RequestError('Selecione uma conta de gestão já autorizada.');
  if(person&&'email' in person&&person.email==='manutencao@example.invalid'&&state!=='PA')throw new RequestError('Esse responsável tem acesso somente ao Pará.');
  responsibleId=person?.id??null;responsibleName=person?.name??'';
  if(person&&person.id!==op.ownerId)guards.push({sql:"EXISTS(SELECT 1 FROM app_members WHERE user_id=? AND status='active' AND revision=?)",args:[person.id,person.revision]});
 }
 if(p)guards.push(propertyGuard(op,p));
 const order=orderId?await first('SELECT id,version FROM work_orders WHERE id=? AND owner_id=? AND property_id=?',orderId,op.ownerId,propertyId):null;
 if(orderId&&!order)throw missing();if(order)guards.push({sql:'EXISTS(SELECT 1 FROM work_orders WHERE id=? AND owner_id=? AND property_id=? AND version=?)',args:[order.id,op.ownerId,propertyId,order.version]});
 const status=v.action==='approve_purchase'?'approved':v.action==='link_order'?'linked_order':v.action==='close'?'closed':v.action==='responsible'?r.status:'reviewing';
 const eventId=crypto.randomUUID(),revision=r.revision+1;
 try{
  const result=await db().batch([
   db().prepare(`UPDATE request_intakes SET status=?,revision=?,property_id=?,client_id=?,cost_center_id=?,state_code=?,worksite_id=?,scope_version=?,assigned_at=?,responsible_user_id=?,responsible_name=?,linked_order_id=?,last_event_id=? WHERE id=? AND owner_id=? AND revision=? AND ${guards.map(g=>'('+g.sql+')').join(' AND ')} AND NOT EXISTS(SELECT 1 FROM request_intake_events WHERE request_id=?)`).bind(status,revision,propertyId,clientId,centerId,state,worksite,scope,assignedAt,responsibleId,responsibleName,orderId||r.linked_order_id,eventId,r.id,op.ownerId,r.revision,...guards.flatMap(g=>g.args),v.request_id),
   db().prepare('INSERT INTO request_intake_events(id,owner_id,intake_id,revision,state_code,action,before_status,after_status,note,actor_user_id,actor_name,request_id,request_fingerprint,created_at) SELECT ?,owner_id,id,revision,state_code,?,?,?,?,?,?,?,?,? FROM request_intakes WHERE id=? AND last_event_id=?').bind(eventId,v.action,r.status,status,note,op.actor.userId,op.actor.fullName||op.actor.displayName,v.request_id,fingerprint,now,r.id,eventId)
  ]);
  if(!result[0].meta.changes){const saved=await replay();if(saved)return saved;throw conflict();}await serviceReadGuard(op);return {id:r.id,revision};
 }catch(error){const saved=await replay();if(saved)return saved;throw error;}
}
export async function intakeFile(op:Operator,id:string){
 await serviceReadGuard(op);if(!guestUuid.test(id))throw missing();
 const query='SELECT f.object_key,f.content_type,f.size,f.sha256,r.revision FROM request_intake_files f JOIN request_intakes r ON r.id=f.intake_id AND r.owner_id=f.owner_id WHERE f.id=? AND f.owner_id=?';
 const row=await first(query,id,op.ownerId);if(!row)throw missing();const object=await bucket().get(row.object_key);if(!object)throw missing();const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.length!==row.size||await hashBytes(bytes)!==row.sha256)throw missing();
 await serviceReadGuard(op);const again=await first(query+' AND r.revision=?',id,op.ownerId,row.revision);if(!again||again.object_key!==row.object_key)throw missing();return new Response(bytes.buffer as ArrayBuffer,{headers:{...GUEST_HEADERS,'X-Content-Type-Options':'nosniff','Content-Type':row.content_type,'Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
