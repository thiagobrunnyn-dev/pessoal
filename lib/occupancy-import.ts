import {getOperator,recheckOperator,operatorGuard,type Operator} from './app-access';
import {all,first,db,noCache} from './maintenance';
import {boundedJson,requireSameOrigin,RequestError} from './http-security';
import {occupancyApi} from './occupancy-runtime';
import {POST as createGuest} from '../app/api/occupancy/guest/route';

type Row=Record<string,any>;
type ImportState={cursor:number;results:Record<string,Row>;pending:{key:string;path:string;body:Row}|null};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const normalize=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/gu,' ');
const norm=(s:string)=>normalize(s).toLocaleLowerCase('pt-BR');
const reply=(d:unknown,status=200)=>Response.json(d,{status,headers:noCache});
const text=(v:unknown,max:number,required=true)=>{if(typeof v!=='string')throw new RequestError('Confira os textos da lista.');const s=normalize(v);if(s.length>max||required&&!s||/[\u0000-\u001f\u007f]/u.test(s))throw new RequestError('Confira os nomes da lista.');return s;};
const number=(v:unknown,min:number,max:number)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)throw new RequestError('Confira quartos, vagas e quantidades.');return v;};
async function stableId(value:unknown){const a=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))));a[6]=(a[6]&15)|80;a[8]=(a[8]&63)|128;const h=[...a.slice(0,16)].map(v=>v.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function cleanInput(body:Row){if(!Array.isArray(body.houses)||!body.houses.length||body.houses.length>30)throw new RequestError('Escolha pelo menos um imóvel.');const properties=new Set(),names=new Set();let total=0;
 return body.houses.map((h:Row)=>{if(!h||!UUID.test(h.property_id)||properties.has(h.property_id)||!Array.isArray(h.rooms)||!h.rooms.length||h.rooms.length>50||!Array.isArray(h.guests))throw new RequestError('Confira os imóveis e quartos da lista.');properties.add(h.property_id);
 const rooms=h.rooms.map((r:Row)=>({name:text(r.name,100),capacity:number(r.capacity,1,200)}));if(new Set(rooms.map((r:Row)=>norm(r.name))).size!==rooms.length)throw new RequestError('Há quartos repetidos neste imóvel.');
 const perRoom=new Map<string,number>();const guests=h.guests.map((g:Row)=>{const room=text(g.room,100),name=text(g.name,120),job_title=text(g.job_title??'',120,false),shift=text(g.shift??'',80,false),name_pending=g.name_pending===true;
 if(g.name_pending!==undefined&&typeof g.name_pending!=='boolean'||name_pending&&g.accept_partial!==true)throw new RequestError('Confirme cada nome incompleto antes de preparar a importação.');
 const r=rooms.find((r:Row)=>r.name===room);if(!r)throw new RequestError('Vincule cada hóspede a um quarto da lista.');const slot=(perRoom.get(room)||0)+1;perRoom.set(room,slot);if(slot>r.capacity)throw new RequestError('Há mais hóspedes que vagas confirmadas em um quarto.');
 if(names.has(norm(name)))throw new RequestError('Há nomes repetidos na lista. Confira a identidade antes de importar.');names.add(norm(name));total++;if(total>200)throw new RequestError('Use até 200 hóspedes por arquivo.');
 const person_id=g.person_id||null;if(person_id&&!UUID.test(person_id))throw new RequestError('Escolha um cadastro válido para reutilizar.');
 return {room,name,job_title,shift,name_pending,person_id,slot};});
 if(!guests.length)throw new RequestError('Escolha hóspedes em cada imóvel.');return {property_id:h.property_id,rooms,guests};});}
async function currentProperty(op:Operator,id:string){const p=await first('SELECT p.id,p.name,p.address,p.state_code,p.worksite_id,p.revision,p.archived_at,COALESCE(s.version,0) scope_version FROM properties p LEFT JOIN occupancy_property_scopes s ON s.property_id=p.id WHERE p.id=? AND p.owner_id=?',id,op.ownerId);if(!p||p.archived_at||!p.state_code)throw new RequestError('Um imóvel não está disponível ou está sem UF. Confira a seleção.',409);return p;}
async function checkPlan(op:Operator,plan:Row){await recheckOperator(op);for(const h of plan.houses){const p=await currentProperty(op,h.property_id);if(p.state_code!==h.state_code||p.worksite_id!==h.worksite_id||p.scope_version!==h.scope_version)throw new RequestError('A UF ou obra de um imóvel mudou. Interrompa e revise o lote.',409);}}
async function batch(op:Operator,id:string){if(!UUID.test(id))throw new RequestError('Importação não encontrada.',404);const row=await first('SELECT * FROM occupancy_imports WHERE id=? AND owner_id=? AND actor_user_id=?',id,op.ownerId,op.actor.userId);if(!row)throw new RequestError('Importação não encontrada nesta conta.',404);const plan=JSON.parse(row.plan),state=JSON.parse(row.state) as ImportState;await checkPlan(op,plan);return {row,plan,state};}
function summary(row:Row,plan:Row,state:ImportState){const operations=plan.operations as Row[];return {id:row.id,houses:plan.houses,completed:state.cursor===operations.length,processed_steps:state.cursor,total_steps:operations.length,guests_total:plan.houses.reduce((n:number,h:Row)=>n+h.guests.length,0),stays_saved:operations.filter(x=>x.kind==='stay'&&state.results[x.key]).length,people_saved:operations.filter(x=>x.kind==='person'&&state.results[x.key]).length,pending_step:operations[state.cursor]?.label||null};}
async function prepare(op:Operator,body:Row){const houses=cleanInput(body),id=await stableId(['occupancy-import-v1',op.ownerId,op.actor.userId,houses]);const old=await first('SELECT id FROM occupancy_imports WHERE id=? AND owner_id=? AND actor_user_id=?',id,op.ownerId,op.actor.userId);if(old){const b=await batch(op,id);return summary(b.row,b.plan,b.state);}
 const plan:Row={houses:[],operations:[]};const results:Record<string,Row>={};
 for(let hi=0;hi<houses.length;hi++){const h=houses[hi],p=await currentProperty(op,h.property_id);const roomRows=await all('SELECT id,name,name_key,capacity,capacity_confirmed,revision FROM occupancy_rooms WHERE owner_id=? AND property_id=? AND scope_version=?',op.ownerId,p.id,p.scope_version);const people=await all("SELECT id,display_name,job_title,revision FROM person_profiles WHERE owner_id=? AND state_code=? AND status='active'",op.ownerId,p.state_code);
 const hs={...h,property_name:p.name,address:p.address,state_code:p.state_code,worksite_id:p.worksite_id,scope_version:p.scope_version};plan.houses.push(hs);
 for(let ri=0;ri<h.rooms.length;ri++){const room=h.rooms[ri],key=hi+':room:'+ri,existing=roomRows.find(r=>norm(r.name)===norm(room.name));if(existing){if(existing.capacity_confirmed!==1||existing.capacity!==room.capacity)throw new RequestError('A capacidade de '+room.name+' difere do cadastro. Confira o quarto antes de importar.',409);results[key]={id:existing.id,revision:existing.revision,reused:true};}else plan.operations.push({kind:'room',key,house:hi,room:ri,label:'Cadastrar '+room.name});}
 for(let gi=0;gi<h.guests.length;gi++){const g=h.guests[gi],ri=h.rooms.findIndex((r:Row)=>r.name===g.room),key=hi+':person:'+gi;
 if(g.person_id){const person=people.find(x=>x.id===g.person_id);if(!person)throw new RequestError('Uma pessoa selecionada não está ativa na UF deste imóvel.',409);results[key]={id:person.id,revision:person.revision,reused:true};}
 else if(people.some(x=>norm(x.display_name)===norm(g.name)))throw new RequestError('Já existe '+g.name+' no cadastro. Escolha a pessoa existente na revisão.',409);
 else plan.operations.push({kind:'person',key,house:hi,guest:gi,room:ri,label:'Cadastrar hóspede '+g.name});
 plan.operations.push({kind:'stay',key:hi+':stay:'+gi,house:hi,guest:gi,room:ri,label:'Vincular '+g.name+' ao '+g.room});}
 }
 const state:ImportState={cursor:0,results,pending:null},stamp=new Date().toISOString(),guard=operatorGuard(op);await checkPlan(op,plan);
 const result=await db().prepare('INSERT INTO occupancy_imports(id,owner_id,actor_user_id,revision,plan,state,created_at,updated_at) SELECT ?,?,?,0,?,?,?,? WHERE '+guard.sql+' ON CONFLICT(id) DO NOTHING').bind(id,op.ownerId,op.actor.userId,JSON.stringify(plan),JSON.stringify(state),stamp,stamp,...guard.args).run();
 if(!result.meta.changes){const b=await batch(op,id);return summary(b.row,b.plan,b.state);}return summary({id},plan,state);}
async function saveState(op:Operator,row:Row,state:ImportState){const g=operatorGuard(op);const res=await db().prepare('UPDATE occupancy_imports SET state=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND actor_user_id=? AND revision=? AND '+g.sql).bind(JSON.stringify(state),new Date().toISOString(),row.id,op.ownerId,op.actor.userId,row.revision,...g.args).run();return res.meta.changes>0;}
async function step(op:Operator,id:string,request:Request){let b=await batch(op,id);if(b.state.cursor>=b.plan.operations.length)return summary(b.row,b.plan,b.state);
 const operation=b.plan.operations[b.state.cursor],h=b.plan.houses[operation.house],r=h.rooms[operation.room],g=operation.guest===undefined?null:h.guests[operation.guest];
 if(!b.state.pending){const p=await currentProperty(op,h.property_id),request_id=await stableId([id,operation.key]);const base={request_id,property_id:p.id,property_revision:p.revision,confirmed:true};let body:Row,path='occupancy';
 if(operation.kind==='room')body={...base,action:'room_create',name:r.name,capacity:r.capacity,capacity_confirmed:true};
 else {const room=b.state.results[operation.house+':room:'+operation.room];if(!room)throw new RequestError('O quarto ainda não foi confirmado.',409);
 if(operation.kind==='person'){path='guest';body={...base,room_id:room.id,display_name:g.name,job_title:g.job_title,name_pending:g.name_pending};}
 else {const person=b.state.results[operation.house+':person:'+operation.guest];if(!person)throw new RequestError('A pessoa ainda não foi confirmada.',409);body={...base,action:'check_in',room_id:room.id,expected_revision:room.revision,person_profile_id:person.id,person_revision:person.revision,slot_number:g.slot,shift:g.shift,entry_on:null,entry_unknown:true,exit_on:null};}}
 const state={...b.state,pending:{key:operation.key,path,body}};if(!await saveState(op,b.row,state)){const current=await batch(op,id);return summary(current.row,current.plan,current.state);}b=await batch(op,id);
 }
 const pending=b.state.pending!;const headers=new Headers(request.headers);headers.set('Content-Type','application/json');const delegated=new Request(request.url,{method:'POST',headers,body:JSON.stringify(pending.body)});
 const response=await(pending.path==='guest'?createGuest(delegated):occupancyApi.POST(delegated));const result=await response.json() as Row;
 if(!response.ok)throw new RequestError(result.error||'Uma linha não pôde ser confirmada.',response.status);
 if(typeof result.id!=='string'||!Number.isSafeInteger(result.revision))throw new RequestError('Resposta incompleta. Retome a mesma importação para conferir.',503);
 const state={...b.state,cursor:b.state.cursor+1,pending:null,results:{...b.state.results,[pending.key]:{id:result.id,revision:result.revision}}};await checkPlan(op,b.plan);await saveState(op,b.row,state);
 const final=await batch(op,id);return summary(final.row,final.plan,final.state);
}
export async function importGet(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão.'},401);const b=await batch(op,new URL(request.url).searchParams.get('id')||'');return reply(summary(b.row,b.plan,b.state));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível consultar a importação.'},e instanceof RequestError?e.status:503);}}
export async function importPost(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão.'},401);requireSameOrigin(request);await recheckOperator(op);const body=await boundedJson(request,160*1024);if(body.action==='preview')return reply(await prepare(op,body));if(body.action==='step'&&body.confirmed===true)return reply(await step(op,String(body.id||''),request));throw new RequestError('Revise e confirme a importação.');}catch(e){return reply({error:e instanceof RequestError?e.message:'O resultado ainda não foi confirmado. Retome o mesmo lote para conferir, sem repetir cadastros.'},e instanceof RequestError?e.status:503);}}
