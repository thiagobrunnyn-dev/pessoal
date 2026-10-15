import {makeLodgingReport,type LodgingReportStay} from './lodging-report';
import type {Operator} from './app-access';
import {boundedJson,requireSameOrigin,RequestError} from './http-security';
import {occupancyMetrics,type OccupancyPropertySummary,type OccupancyRoom,type OccupancyStay,type OccupancyPerson} from './occupancy';

type Guard={sql:string;args:unknown[]};
export type OccupancyDependencies={getOperator:()=>Promise<Operator|null>;recheckOperator:(op:Operator)=>Promise<void>;operatorGuard:(op:Operator)=>Guard;first:<T>(sql:string,...args:unknown[])=>Promise<T|null>;all:<T>(sql:string,...args:unknown[])=>Promise<T[]>;db:()=>D1Database;noCache:Record<string,string>;now?:()=>Date};
type Property=Omit<OccupancyPropertySummary,keyof ReturnType<typeof occupancyMetrics>>&{scope_version:number};
type Room=Omit<OccupancyRoom,'capacity_confirmed'|'available_count'|'scope_changed'>&{owner_id:string;capacity_confirmed:number;scope_version:number;state_code:string|null;worksite_id:string|null};
type Stay=Omit<OccupancyStay,'scope_changed'|'recorded_at'>&{owner_id:string;scope_version:number;created_at:string};
type SavedEvent={id:string;property_id:string;room_id:string;stay_id:string|null;revision:number;request_fingerprint:string;scope_version:number};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const conflict='O cadastro ou a ocupação foi atualizado. Recarregue antes de salvar.';
const unavailable='Não foi possível registrar: confira a disponibilidade da vaga e da pessoa no período, a capacidade e os dados atualizados.';
function id(value:unknown){if(typeof value!=='string'||!UUID.test(value))throw new RequestError('Identificação inválida.');return value;}
function integer(value:unknown,min:number,max=Number.MAX_SAFE_INTEGER){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new RequestError('Número ou revisão inválida.');return value;}
function text(value:unknown,max:number,required=false){if(typeof value!=='string')throw new RequestError('Texto inválido.');const result=value.normalize('NFKC').trim().replace(/\s+/gu,' ');if(result.length>max||(required&&!result)||/[\u0000-\u001f\u007f]/u.test(result))throw new RequestError('Confira os campos de texto.');return result;}
function calendarDay(value:unknown){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw new RequestError('Informe uma data válida.');return value;}
function plannedDay(value:unknown){if(value===null||value===undefined||value==='')return null;return calendarDay(value);}
function day(value:unknown,today:string){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value||value>today)throw new RequestError('Informe uma data válida, sem data futura.');return value;}
async function fingerprint(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function todayAt(now:Date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Belem',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function changed(row:{scope_version:number;state_code:string|null;worksite_id:string|null},p:Property){return row.scope_version!==p.scope_version||row.state_code!==p.state_code||row.worksite_id!==p.worksite_id;}
function roomDto(r:Room,p:Property):OccupancyRoom{return {id:r.id,property_id:r.property_id,name:r.name,capacity:r.capacity,capacity_confirmed:r.capacity_confirmed===1,revision:r.revision,occupied_count:r.occupied_count,available_count:r.capacity===null||r.capacity_confirmed!==1?null:r.capacity-r.occupied_count,scope_changed:changed(r,p)};}
function stayDto(s:Stay,p:Property):OccupancyStay{return {id:s.id,property_id:s.property_id,room_id:s.room_id,room_name:s.room_name,slot_number:s.slot_number,person_profile_id:s.person_profile_id,person_name:s.person_name,person_title:s.person_title,shift:s.shift,entry_on:s.entry_on,recorded_at:s.created_at,exit_on:s.exit_on,planned_exit_on:s.planned_exit_on,client_id:s.client_id,client_name:s.client_name,cost_center_id:s.cost_center_id,cost_center_name:s.cost_center_name,assignment_captured_at:s.assignment_captured_at,assignment_unavailable:!!s.assignment_unavailable,revision:s.revision,state_code:s.state_code,worksite_id:s.worksite_id,scope_changed:changed(s,p)};}
const propertySql='SELECT p.id,p.control_number,p.name,p.address,p.state_code,p.worksite_id,p.revision,p.archived_at,c.name worksite_name,COALESCE(o.version,0) scope_version FROM properties p LEFT JOIN cost_centers c ON c.id=p.worksite_id AND c.owner_id=p.owner_id LEFT JOIN occupancy_property_scopes o ON o.property_id=p.id';
const roomSql='SELECT r.*,(SELECT count(*) FROM occupancy_stays s WHERE s.room_id=r.id AND s.owner_id=r.owner_id AND s.exit_on IS NULL) occupied_count FROM occupancy_rooms r';
const propertyDto=(p:Property,rooms:OccupancyRoom[]):OccupancyPropertySummary=>({id:p.id,control_number:p.control_number,name:p.name,address:p.address,state_code:p.state_code,worksite_id:p.worksite_id,worksite_name:p.worksite_name,revision:p.revision,archived_at:p.archived_at,...occupancyMetrics(rooms)});

export function createOccupancyApi(d:OccupancyDependencies){
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:d.noCache});
 const deny=()=>reply({error:'Acesso restrito à gestão autorizada.'},401);
 const now=()=>d.now?.()??new Date();
 async function assertScope(op:Operator){await d.recheckOperator(op);const g=d.operatorGuard(op);if(!await d.first('SELECT 1 allowed WHERE '+g.sql,...g.args))throw new RequestError('O acesso ou o escopo mudou. Atualize a página.',409);}
 async function property(propertyId:string,op:Operator){const p=await d.first<Property>(propertySql+' WHERE p.id=? AND p.owner_id=?',propertyId,op.ownerId);if(!p)throw new RequestError('Imóvel não encontrado.',404);return p;}
 async function recheckProperty(p:Property,op:Operator){const current=await property(p.id,op);if(current.revision!==p.revision||current.scope_version!==p.scope_version||current.state_code!==p.state_code||current.worksite_id!==p.worksite_id||current.archived_at!==p.archived_at)throw new RequestError(conflict,409);await assertScope(op);}
 const room=(roomId:string,p:Property,op:Operator)=>d.first<Room>(roomSql+' WHERE r.id=? AND r.property_id=? AND r.owner_id=?',roomId,p.id,op.ownerId);
 const stay=(stayId:string,p:Property,op:Operator)=>d.first<Stay>('SELECT * FROM occupancy_stays WHERE id=? AND property_id=? AND owner_id=?',stayId,p.id,op.ownerId);
 const prior=(requestId:string,op:Operator)=>d.first<SavedEvent>('SELECT id,property_id,room_id,stay_id,revision,request_fingerprint,scope_version FROM occupancy_events WHERE request_id=? AND owner_id=?',requestId,op.ownerId);
 async function replay(e:SavedEvent,p:Property,op:Operator,hash:string){if(e.property_id!==p.id||e.request_fingerprint!==hash)throw new RequestError('Este formulário já foi utilizado com outros dados. Reabra para uma nova atualização.',409);if(e.scope_version!==p.scope_version||!await room(e.room_id,p,op)||(e.stay_id&&!await stay(e.stay_id,p,op)))throw new RequestError('Registro não encontrado no escopo atual.',404);await recheckProperty(p,op);return reply({id:e.stay_id??e.room_id,event_id:e.id,revision:e.revision,alreadySaved:true});}
 async function GET(request:Request){try{
  const op=await d.getOperator();if(!op)return deny();await assertScope(op);
  const q=new URL(request.url).searchParams;for(const key of q.keys())if(!['property_id','room_id','stay_id','catalog','report','from','to','client_id','cost_center_id'].includes(key)||q.getAll(key).length!==1)throw new RequestError('Consulta inválida.');
  const propertyId=q.has('property_id')?id(q.get('property_id')):null,roomId=q.has('room_id')?id(q.get('room_id')):null,stayId=q.has('stay_id')?id(q.get('stay_id')):null,today=todayAt(now());
  if(q.has('report')){
   if(q.get('report')!=='nights'||roomId||stayId)throw new RequestError('Consulta inválida.');
   const from=calendarDay(q.get('from')),to=calendarDay(q.get('to'));
   if(from>to||Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z')>1096*86400000)throw new RequestError('Escolha um período de até três anos, com o fim na data inicial ou depois.');
   const clientFilter=q.has('client_id')?id(q.get('client_id')):'',centerFilter=q.has('cost_center_id')?id(q.get('cost_center_id')):'';
   const p=propertyId?await property(propertyId,op):null;
   const rows=await d.all<LodgingReportStay>('SELECT s.*,p.name property_name,p.control_number FROM occupancy_stays s JOIN properties p ON p.id=s.property_id AND p.owner_id=s.owner_id WHERE s.owner_id=?'+(propertyId?' AND s.property_id=?':'')+' AND (s.entry_on IS NULL OR s.entry_on<=?) AND (s.exit_on IS NULL OR s.exit_on>=?) ORDER BY s.created_at DESC,s.id LIMIT 20001',op.ownerId,...(propertyId?[propertyId]:[]),to,from);
   if(rows.length>20000)throw new RequestError('Este período tem muitos registros. Reduza o período ou escolha um imóvel; nenhum total parcial foi calculado.',422);
   if(p)await recheckProperty(p,op);else await assertScope(op);
   return reply(makeLodgingReport(rows,from,to,today,clientFilter,centerFilter));
  }
  if(['from','to','client_id','cost_center_id'].some(key=>q.has(key)))throw new RequestError('Escolha o relatório de diárias.');
  if(!propertyId){if(roomId||stayId)throw new RequestError('Informe o imóvel do registro.');
   const properties=await d.all<Property>(propertySql+' WHERE p.owner_id=? ORDER BY p.control_number,p.name,p.id',op.ownerId);
   const rooms=await d.all<Room>(roomSql+' WHERE r.owner_id=? AND EXISTS(SELECT 1 FROM properties p WHERE p.id=r.property_id AND p.owner_id=r.owner_id AND p.state_code IS r.state_code AND p.worksite_id IS r.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=r.scope_version)',op.ownerId);
   const grouped=new Map<string,Room[]>();for(const r of rooms){const group=grouped.get(r.property_id)??[];group.push(r);grouped.set(r.property_id,group);}
   await assertScope(op);return reply({properties:properties.map(p=>propertyDto(p,(grouped.get(p.id)??[]).map(r=>roomDto(r,p)))),today});
  }
  const p=await property(propertyId,op);
  if(roomId&&!await room(roomId,p,op))throw new RequestError('Quarto não encontrado neste imóvel.',404);
  if(stayId){const s=await stay(stayId,p,op);if(!s||(roomId&&s.room_id!==roomId))throw new RequestError('Ocupação não encontrada neste imóvel.',404);}
  const [rows,stays,people]=await Promise.all([
   d.all<Room>(roomSql+' WHERE r.property_id=? AND r.owner_id=? ORDER BY r.scope_version DESC,r.name,r.id',p.id,op.ownerId),
   d.all<Stay>('SELECT * FROM occupancy_stays WHERE property_id=? AND owner_id=?'+(roomId?' AND room_id=?':'')+(stayId?' AND id=?':'')+' ORDER BY (exit_on IS NULL) DESC,entry_on DESC,created_at DESC,id LIMIT 2001',p.id,op.ownerId,...(roomId?[roomId]:[]),...(stayId?[stayId]:[])),
   p.archived_at||!p.state_code?Promise.resolve([] as OccupancyPerson[]):d.all<OccupancyPerson>("SELECT id,display_name,job_title,revision,name_pending FROM person_profiles WHERE owner_id=? AND status='active' AND state_code=? ORDER BY display_name,id LIMIT 1001",op.ownerId,p.state_code),
  ]);
  const dtos=rows.map(r=>roomDto(r,p)),rooms=dtos.filter(r=>!r.scope_changed),historical_rooms=dtos.filter(r=>r.scope_changed);
  await recheckProperty(p,op);return reply({property:propertyDto(p,rooms),rooms,historical_rooms,stays:stays.slice(0,2000).map(s=>({...stayDto(s,p),person_name_pending:!!people.find(person=>person.id===s.person_profile_id)?.name_pending})),people:people.slice(0,1000),truncated:stays.length>2000||people.length>1000,today});
 }catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível carregar a ocupação.'},e instanceof RequestError?e.status:503);}}

 async function POST(request:Request){try{
  const op=await d.getOperator();if(!op)return deny();requireSameOrigin(request);await assertScope(op);
  const body=await boundedJson(request,8192);if(!body||typeof body!=='object'||Array.isArray(body))throw new RequestError('Solicitação inválida.');
  const action=body.action;if(!['room_create','room_update','check_in','check_out','plan_checkout'].includes(action))throw new RequestError('Ação inválida.');
  const allowed=['action','request_id','property_id','property_revision','confirmed',...(action==='room_create'?['name','capacity','capacity_confirmed']:action==='room_update'?['room_id','expected_revision','name','capacity','capacity_confirmed']:action==='check_in'?['room_id','expected_revision','person_profile_id','person_revision','slot_number','shift','entry_on','entry_unknown','exit_on','planned_exit_on']:action==='plan_checkout'?['stay_id','expected_revision','planned_exit_on']:['stay_id','expected_revision','exit_on'])];
  if(Object.keys(body).some(key=>!allowed.includes(key)))throw new RequestError('Envie somente os campos desta ação.');
  if(body.confirmed!==true)throw new RequestError('Confirme os dados antes de registrar.');
  const requestId=id(body.request_id),propertyId=id(body.property_id),propertyRevision=integer(body.property_revision,0),expected=action==='room_create'?0:integer(body.expected_revision,1),today=todayAt(now());
  // Canonical payload: key order and irrelevant transport details never change retry identity.
  let input:Record<string,unknown>;
  if(action==='room_create'||action==='room_update'){
   const name=text(body.name,100,true),capacity=body.capacity===null?null:integer(body.capacity,0,200);
   if(body.capacity_confirmed!==(capacity!==null))throw new RequestError('Confirme a capacidade real do quarto; deixe em branco quando não souber.');
   input={...(action==='room_update'?{room_id:id(body.room_id)}:{}),name,capacity,capacity_confirmed:body.capacity_confirmed};
  }else if(action==='check_in'){
   if(body.entry_unknown!==undefined&&typeof body.entry_unknown!=='boolean')throw new RequestError('Confira a data de entrada.');
   const entry_on=body.entry_on===null&&body.entry_unknown===true?null:day(body.entry_on,today),exit_on=body.exit_on===null||body.exit_on===undefined?null:day(body.exit_on,today);if(exit_on&&(entry_on===null||exit_on<entry_on))throw new RequestError('A saída deve ser igual ou posterior à entrada.');
   input={room_id:id(body.room_id),person_profile_id:id(body.person_profile_id),person_revision:integer(body.person_revision,0),slot_number:integer(body.slot_number,1,200),shift:text(body.shift??'',100),entry_on,exit_on,...(body.planned_exit_on!==undefined?{planned_exit_on:plannedDay(body.planned_exit_on)}:{})};
  }else if(action==='plan_checkout')input={stay_id:id(body.stay_id),planned_exit_on:plannedDay(body.planned_exit_on)};
  else input={stay_id:id(body.stay_id),exit_on:day(body.exit_on,today)};
  const p=await property(propertyId,op),hash=await fingerprint({action,actor:op.actor.userId,property_id:propertyId,property_revision:propertyRevision,expected_revision:expected,input});
  const old=await prior(requestId,op);if(old)return await replay(old,p,op,hash);
  if(typeof input.planned_exit_on==='string'&&input.planned_exit_on<today)throw new RequestError('A previsão de saída deve ser hoje ou depois.');
  if(p.archived_at)throw new RequestError('Reative o imóvel antes de registrar entradas, saídas ou alterações.',409);
  if(p.revision!==propertyRevision)throw new RequestError(conflict,409);
  const eventId=crypto.randomUUID(),stamp=now().toISOString(),actorName=op.actor.fullName||op.actor.displayName||'Gestão autorizada';
  const auth=d.operatorGuard(op),guard:Guard={sql:auth.sql+' AND EXISTS(SELECT 1 FROM properties p WHERE p.id=? AND p.owner_id=? AND p.revision=? AND p.state_code IS ? AND p.worksite_id IS ? AND p.archived_at IS NULL AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=?) AND NOT EXISTS(SELECT 1 FROM occupancy_events WHERE request_id=?)',args:[...auth.args,p.id,op.ownerId,p.revision,p.state_code,p.worksite_id,p.scope_version,requestId]};
  let entityId:string,revision:number,statement:D1PreparedStatement;
  if(action==='room_create'){
   entityId=crypto.randomUUID();revision=1;
   statement=d.db().prepare('INSERT INTO occupancy_rooms(id,owner_id,property_id,state_code,worksite_id,scope_version,name,name_key,capacity,capacity_confirmed,revision,last_event_id,request_id,request_fingerprint,actor_user_id,actor_name,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE '+guard.sql+' AND (SELECT count(*) FROM occupancy_rooms WHERE owner_id=? AND property_id=? AND scope_version=?)<200').bind(entityId,op.ownerId,p.id,p.state_code,p.worksite_id,p.scope_version,input.name,(input.name as string).toLocaleLowerCase('pt-BR'),input.capacity,input.capacity_confirmed?1:0,1,eventId,requestId,hash,op.actor.userId,actorName,stamp,stamp,...guard.args,op.ownerId,p.id,p.scope_version);
  }else if(action==='room_update'){
   entityId=input.room_id as string;revision=expected+1;const r=await room(entityId,p,op);if(!r)throw new RequestError('Quarto não encontrado neste imóvel.',404);if(changed(r,p))throw new RequestError('A UF ou obra mudou. Este quarto é somente histórico.',409);if(r.revision!==expected)throw new RequestError(conflict,409);
   statement=d.db().prepare('UPDATE occupancy_rooms SET name=?,name_key=?,capacity=?,capacity_confirmed=?,revision=?,last_event_id=?,request_id=?,request_fingerprint=?,actor_user_id=?,actor_name=?,updated_at=? WHERE id=? AND property_id=? AND owner_id=? AND revision=? AND '+guard.sql).bind(input.name,(input.name as string).toLocaleLowerCase('pt-BR'),input.capacity,input.capacity_confirmed?1:0,revision,eventId,requestId,hash,op.actor.userId,actorName,stamp,entityId,p.id,op.ownerId,expected,...guard.args);
  }else if(action==='check_in'){
   entityId=crypto.randomUUID();revision=1;const r=await room(input.room_id as string,p,op);if(!r)throw new RequestError('Quarto não encontrado neste imóvel.',404);if(changed(r,p))throw new RequestError('A UF ou obra mudou. Este quarto é somente histórico.',409);if(r.revision!==expected)throw new RequestError(conflict,409);if(r.capacity===null||r.capacity_confirmed!==1)throw new RequestError('Informe e confirme a capacidade do quarto antes de alocar.',409);if((input.slot_number as number)>r.capacity)throw new RequestError('A vaga deve estar dentro da capacidade confirmada.',409);
   if(!p.state_code)throw new RequestError('Defina a UF do imóvel e da pessoa antes de alocar.',409);
   const person=await d.first<OccupancyPerson>("SELECT id,display_name,job_title,revision,name_pending FROM person_profiles WHERE id=? AND owner_id=? AND status='active' AND state_code=?",input.person_profile_id,op.ownerId,p.state_code);if(!person)throw new RequestError('Pessoa não disponível no cadastro ativo desta UF.',404);if(person.revision!==input.person_revision)throw new RequestError(conflict,409);
   statement=d.db().prepare('INSERT INTO occupancy_stays(id,owner_id,property_id,room_id,state_code,worksite_id,scope_version,room_name,slot_number,person_profile_id,person_name,person_title,shift,entry_on,exit_on,planned_exit_on,client_id,client_name,cost_center_id,cost_center_name,assignment_captured_at,revision,last_event_id,request_id,request_fingerprint,actor_user_id,actor_name,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,p.client_id,c.name,p.cost_center_id,cc.name,?,?,?,?,?,?,?,?,? FROM person_profiles p LEFT JOIN clients c ON c.id=p.client_id AND c.owner_id=p.owner_id LEFT JOIN cost_centers cc ON cc.id=p.cost_center_id AND cc.owner_id=p.owner_id AND cc.client_id=p.client_id WHERE p.id=? AND p.owner_id=? AND '+guard.sql+' AND EXISTS(SELECT 1 FROM occupancy_rooms WHERE id=? AND owner_id=? AND property_id=? AND revision=?) AND EXISTS(SELECT 1 FROM person_profiles WHERE id=? AND owner_id=? AND revision=? AND status=\'active\' AND state_code=?)').bind(entityId,op.ownerId,p.id,r.id,p.state_code,p.worksite_id,p.scope_version,r.name,input.slot_number,person.id,person.display_name,person.job_title,input.shift,input.entry_on,input.exit_on,input.planned_exit_on??null,stamp,revision,eventId,requestId,hash,op.actor.userId,actorName,stamp,stamp,person.id,op.ownerId,...guard.args,r.id,op.ownerId,p.id,expected,person.id,op.ownerId,person.revision,p.state_code);
  }else if(action==='plan_checkout'){
   entityId=input.stay_id as string;revision=expected+1;const s=await stay(entityId,p,op);if(!s)throw new RequestError('Hospedagem não encontrada neste imóvel.',404);if(changed(s,p))throw new RequestError('A UF ou obra mudou. Esta hospedagem é somente histórica.',409);if(s.revision!==expected||s.exit_on!==null)throw new RequestError(conflict,409);
   statement=d.db().prepare('UPDATE occupancy_stays SET planned_exit_on=?,revision=?,last_event_id=?,request_id=?,request_fingerprint=?,actor_user_id=?,actor_name=?,updated_at=? WHERE id=? AND property_id=? AND owner_id=? AND revision=? AND exit_on IS NULL AND '+guard.sql).bind(input.planned_exit_on,revision,eventId,requestId,hash,op.actor.userId,actorName,stamp,entityId,p.id,op.ownerId,expected,...guard.args);
  }else{
   entityId=input.stay_id as string;revision=expected+1;const s=await stay(entityId,p,op);if(!s)throw new RequestError('Ocupação não encontrada neste imóvel.',404);if(changed(s,p))throw new RequestError('A UF ou obra mudou. Esta ocupação é somente histórica.',409);if(s.revision!==expected||s.exit_on!==null)throw new RequestError(conflict,409);if((input.exit_on as string)<(s.entry_on||todayAt(new Date(s.created_at))))throw new RequestError('A saída deve ser igual ou posterior à entrada.');
   statement=d.db().prepare('UPDATE occupancy_stays SET exit_on=?,revision=?,last_event_id=?,request_id=?,request_fingerprint=?,actor_user_id=?,actor_name=?,updated_at=? WHERE id=? AND property_id=? AND owner_id=? AND revision=? AND exit_on IS NULL AND '+guard.sql).bind(input.exit_on,revision,eventId,requestId,hash,op.actor.userId,actorName,stamp,entityId,p.id,op.ownerId,expected,...guard.args);
  }
  await d.recheckOperator(op);
  // A single SQLite transaction enforces capacity, all interval conflicts and its immutable event.
  try{const result=await d.db().batch([statement]);if(!result[0].meta.changes){const raced=await prior(requestId,op);if(raced)return await replay(raced,p,op,hash);throw new RequestError(conflict,409);}}
  catch(e){if(e instanceof RequestError)throw e;const raced=await prior(requestId,op);if(raced)return await replay(raced,p,op,hash);const message=e instanceof Error?e.message:'';if(/occupancy_|constraint|UNIQUE/i.test(message))throw new RequestError(unavailable,409);throw e;}
  await recheckProperty(p,op);return reply({id:entityId,event_id:eventId,revision,alreadySaved:false});
 }catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível confirmar o salvamento. Tente novamente com o mesmo formulário.'},e instanceof RequestError?e.status:503);}}
 return {GET,POST};
}
