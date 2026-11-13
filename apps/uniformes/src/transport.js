import {Invalid} from './model.js';
import {canonical,reason} from './corrections.js';
const q=(db,sql,args=[])=>db.prepare(sql).bind(...args);
const bad=(message,status=400)=>{throw new Invalid(message,status)};
const clean=(s,label,max=120)=>{if(typeof s!=='string'||!s.trim()||s.trim().length>max||/[\u0000-\u001f]/.test(s))bad(label+' inválido.');return s.trim()};
const routes={'Canaã dos Carajás':'Canaã dos Carajás','Curianópolis':'Lavanderia'};
const fields=(input,keys)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))bad('Campos da requisição inválidos.');if(typeof input.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.requestId))bad('Identificador da requisição inválido.')};
export const tripView=(r,driver=false)=>({id:r.id,revision:r.revision||0,driverId:r.driver_id,route:r.route,base:r.base,leg:r.leg,origin:r.origin,destination:r.destination,createdAt:r.created_at,departedAt:r.departed_at,arrivedAt:r.arrived_at,status:r.arrived_at?'arrived':r.departed_at?'departed':'planned',durationMinutes:r.arrived_at?Math.round((Date.parse(r.arrived_at)-Date.parse(r.departed_at))/60000):null,...(driver?{}:{lotIds:JSON.parse(r.lot_ids),driverName:r.driver_name||null})});
export async function tripList(db,a,mode,{complete=false}={}){
 const rows=await q(db,'SELECT t.*,m.display_name AS driver_name FROM transport_trips t LEFT JOIN transport_memberships m ON m.tenant=t.tenant AND m.mode=t.mode AND m.driver_id=t.driver_id WHERE t.tenant=? AND t.mode=? ORDER BY t.created_at DESC,t.id DESC'+(complete?'':' LIMIT 1000'),[a.tenant,mode]).all();
 const members=await q(db,'SELECT driver_id,display_name FROM transport_memberships WHERE tenant=? AND mode=? AND enabled=1 ORDER BY display_name',[a.tenant,mode]).all();
 return {trips:rows.results.map(r=>tripView(r)),drivers:members.results.map(r=>({id:r.driver_id,name:r.display_name})),timezone:'America/Belem'};
}
export async function driverList(db,a,mode){
 if(a.role==='owner')return {trips:[],name:'Prévia do motorista',preview:true,timezone:'America/Belem'};
 const rows=await q(db,'SELECT * FROM transport_trips WHERE tenant=? AND mode=? AND driver_id=? ORDER BY created_at DESC,id DESC LIMIT 1000',[a.tenant,mode,a.driverId]).all();
 return {trips:rows.results.map(r=>tripView(r,true)),name:a.name,preview:false,timezone:'America/Belem'};
}
export async function createTrip(db,a,mode,input){
 fields(input,['requestId','route','leg','origin','destination','driverId','lotIds']);
 if(!Object.hasOwn(routes,input.route)||!['inbound','outbound'].includes(input.leg))bad('Cidade ou sentido inválido.');
 const origin=clean(input.origin,'Origem'),destination=clean(input.destination,'Destino');
 if(input.leg==='inbound'&&destination!=='Lavanderia'||input.leg==='outbound'&&origin!=='Lavanderia')bad('A viagem deve sair da lavanderia ou chegar à lavanderia.');
 const driverId=input.driverId==null?null:clean(input.driverId,'Motorista',100);
 if(!Array.isArray(input.lotIds)||input.lotIds.length>100||input.lotIds.some(id=>typeof id!=='string'||id.length>80)||new Set(input.lotIds).size!==input.lotIds.length)bad('Lista de rols inválida.');
 const lotIds=[...input.lotIds].sort();
 const old=await q(db,'SELECT * FROM transport_trips WHERE tenant=? AND mode=? AND created_request=?',[a.tenant,mode,input.requestId]).first();
 const createPayload=canonical({route:input.route,leg:input.leg,origin,destination,driverId,lotIds});
 const matches=r=>r.created_payload?r.created_payload===createPayload:r.route===input.route&&r.leg===input.leg&&r.origin===origin&&r.destination===destination&&r.driver_id===driverId&&r.lot_ids===JSON.stringify(lotIds);
 if(old){if(!matches(old))bad('Identificador já usado em outra viagem.',409);return {trip:tripView(old),replayed:true};}
 if(driverId&&!await q(db,'SELECT driver_id FROM transport_memberships WHERE tenant=? AND mode=? AND driver_id=? AND enabled=1',[a.tenant,mode,driverId]).first())bad('Motorista sem acesso aprovado.',403);
 for(const id of lotIds){const row=await q(db,"SELECT body FROM uniform_records WHERE tenant=? AND mode=? AND kind='rols' AND id=?",[a.tenant,mode,id]).first();if(!row||JSON.parse(row.body).snapshot?.city!==input.route)bad('Rol não pertence a esta operação e cidade.');}
 const id='VIA-'+crypto.randomUUID(),now=new Date().toISOString();
 const lotGuard=lotIds.map(()=>" AND EXISTS (SELECT 1 FROM uniform_records WHERE tenant=? AND mode=? AND kind='rols' AND id=? AND json_extract(body,'$.snapshot.city')=?)").join('');
 const lotArgs=lotIds.flatMap(id=>[a.tenant,mode,id,input.route]);
 await db.batch([q(db,'INSERT OR IGNORE INTO transport_trips(id,tenant,mode,driver_id,route,base,leg,origin,destination,lot_ids,created_at,created_request,created_payload) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (? IS NULL OR EXISTS (SELECT 1 FROM transport_memberships WHERE tenant=? AND mode=? AND driver_id=? AND enabled=1))'+lotGuard,[id,a.tenant,mode,driverId,input.route,routes[input.route],input.leg,origin,destination,JSON.stringify(lotIds),now,input.requestId,createPayload,driverId,a.tenant,mode,driverId,...lotArgs])]);
 const saved=await q(db,'SELECT * FROM transport_trips WHERE tenant=? AND mode=? AND created_request=?',[a.tenant,mode,input.requestId]).first();
 if(!saved)bad('O acesso do motorista mudou. Atualize a viagem.',403);
 if(!matches(saved))bad('Identificador já usado em outra viagem.',409);
 return {trip:tripView(saved),replayed:saved.id!==id};
}
export async function driverEvent(db,a,mode,input){
 if(a.role!=='driver')bad('Somente o motorista designado pode registrar este horário.',403);
 fields(input,['requestId','tripId','event','revision']);
 if(typeof input.tripId!=='string'||!['depart','arrive'].includes(input.event))bad('Viagem ou movimento inválido.');
 const args=[a.tenant,mode,input.tripId,a.driverId];
 const get=()=>q(db,'SELECT * FROM transport_trips WHERE tenant=? AND mode=? AND id=? AND driver_id=?',args).first();
 const trip=await get();if(!trip)bad('Viagem não disponível para este motorista.',403);
 const prior=await q(db,'SELECT trip_id,kind,actor FROM transport_events WHERE tenant=? AND mode=? AND request_id=?',[a.tenant,mode,input.requestId]).first();
 if(prior){if(prior.trip_id!==trip.id||prior.kind!==input.event||prior.actor!==a.userId)bad('Identificador já usado em outro movimento.',409);return {trip:tripView(trip,true),replayed:true};}
 if(!Number.isSafeInteger(input.revision)||input.revision!==trip.revision)bad('A viagem foi atualizada. Atualize a tela antes de registrar o movimento.',409);
 if(input.event==='arrive'&&(trip.leg!=='inbound'||!trip.departed_at))bad('A chegada à lavanderia exige a saída desta viagem de coleta.');
 if(input.event==='depart'&&trip.departed_at||input.event==='arrive'&&trip.arrived_at)bad('Este movimento já foi registrado.',409);
 const now=new Date().toISOString();
 const condition=input.event==='depart'?'departed_at IS NULL':"departed_at IS NOT NULL AND arrived_at IS NULL AND leg='inbound'";
 const column=input.event==='depart'?'departed_at':'arrived_at';
 const liveMember='EXISTS (SELECT 1 FROM transport_memberships m WHERE m.subject=? AND m.tenant=transport_trips.tenant AND m.mode=transport_trips.mode AND m.driver_id=transport_trips.driver_id AND m.enabled=1)';
 const result=await db.batch([
 q(db,`UPDATE transport_trips SET ${column}=?,last_request=?,revision=revision+1 WHERE tenant=? AND mode=? AND id=? AND driver_id=? AND revision=? AND ${condition} AND ${liveMember} AND NOT EXISTS (SELECT 1 FROM transport_events WHERE tenant=? AND mode=? AND request_id=?)`,[now,input.requestId,...args,trip.revision,a.userId,a.tenant,mode,input.requestId]),
 q(db,'INSERT OR IGNORE INTO transport_events(id,tenant,mode,trip_id,request_id,kind,actor,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM transport_trips WHERE tenant=? AND mode=? AND id=? AND driver_id=? AND last_request=?)',[crypto.randomUUID(),a.tenant,mode,trip.id,input.requestId,input.event,a.userId,now,...args,input.requestId])
 ]);
 if(!result[0]?.meta?.changes){const duplicate=await q(db,'SELECT trip_id,kind,actor FROM transport_events WHERE tenant=? AND mode=? AND request_id=?',[a.tenant,mode,input.requestId]).first();if(duplicate?.trip_id===trip.id&&duplicate.kind===input.event&&duplicate.actor===a.userId)return {trip:tripView(await get(),true),replayed:true};bad('Outro registro chegou primeiro. Atualize a viagem.',409);}
 return {trip:tripView(await get(),true)};
}
export async function assignTrip(db,a,mode,input){
 if(a.role!=='owner')bad('Acesso restrito à administração.',403);
 fields(input,['requestId','tripId','driverId']);
 const tripId=clean(input.tripId,'Viagem',80),driverId=clean(input.driverId,'Motorista',100);
 const get=()=>q(db,'SELECT * FROM transport_trips WHERE tenant=? AND mode=? AND id=?',[a.tenant,mode,tripId]).first();
 const trip=await get();if(!trip)bad('Viagem não encontrada.',404);
 const prior=await q(db,'SELECT trip_id,kind,actor,request_json FROM transport_events WHERE tenant=? AND mode=? AND request_id=?',[a.tenant,mode,input.requestId]).first();
 if(prior){if(prior.trip_id!==tripId||prior.kind!=='assign'||prior.actor!==a.userId||(prior.request_json?prior.request_json!==canonical(input):trip.driver_id!==driverId))bad('Identificador já usado em outra ação.',409);return {trip:tripView(trip),replayed:true};}
 if(!await q(db,'SELECT driver_id FROM transport_memberships WHERE tenant=? AND mode=? AND driver_id=? AND enabled=1',[a.tenant,mode,driverId]).first())bad('Motorista sem acesso aprovado.',403);
 if(await q(db,"SELECT id FROM transport_events WHERE tenant=? AND mode=? AND trip_id=? AND kind='assign'",[a.tenant,mode,tripId]).first())bad('Esta viagem já teve atribuição registrada. Use Editar viagem com motivo para corrigir o motorista.',409);
 if(trip.driver_id||trip.departed_at)bad('A viagem já tem motorista ou já começou.',409);
 const now=new Date().toISOString();
 const result=await db.batch([
 q(db,'UPDATE transport_trips SET driver_id=?,last_request=?,revision=revision+1 WHERE tenant=? AND mode=? AND id=? AND revision=? AND driver_id IS NULL AND departed_at IS NULL AND EXISTS (SELECT 1 FROM transport_memberships WHERE tenant=? AND mode=? AND driver_id=? AND enabled=1) AND NOT EXISTS (SELECT 1 FROM transport_events WHERE tenant=? AND mode=? AND request_id=?)',[driverId,input.requestId,a.tenant,mode,tripId,trip.revision,a.tenant,mode,driverId,a.tenant,mode,input.requestId]),
 q(db,'INSERT OR IGNORE INTO transport_events(id,tenant,mode,trip_id,request_id,kind,actor,created_at,request_json) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM transport_trips WHERE tenant=? AND mode=? AND id=? AND last_request=? AND driver_id=?)',[crypto.randomUUID(),a.tenant,mode,tripId,input.requestId,'assign',a.userId,now,canonical(input),a.tenant,mode,tripId,input.requestId,driverId])
 ]);
 if(!result[0]?.meta?.changes){const duplicate=await q(db,'SELECT trip_id,kind,actor,request_json FROM transport_events WHERE tenant=? AND mode=? AND request_id=?',[a.tenant,mode,input.requestId]).first();const saved=await get();if(duplicate?.trip_id===tripId&&duplicate.kind==='assign'&&duplicate.actor===a.userId&&saved.driver_id===driverId)return {trip:tripView(saved),replayed:true};bad('A atribuição mudou. Atualize a viagem.',409);}
 return {trip:tripView(await get())};
}

export async function correctTrip(db,a,mode,input){
 if(a.role!=='owner')bad('Acesso restrito à administração.',403);
 fields(input,['requestId','tripId','revision','changes','reason']);
 const tripId=clean(input.tripId,'Viagem',80),why=reason(input.reason);
 if(!Number.isSafeInteger(input.revision)||input.revision<0||!input.changes||typeof input.changes!=='object'||Array.isArray(input.changes)||Object.keys(input.changes).some(k=>!['route','leg','origin','destination','driverId','lotIds','departedAt','arrivedAt'].includes(k)))bad('Campos da correção inválidos.');
 const get=()=>q(db,'SELECT * FROM transport_trips WHERE tenant=? AND mode=? AND id=?',[a.tenant,mode,tripId]).first();
 const trip=await get();if(!trip)bad('Viagem não encontrada.',404);
 const prior=await q(db,'SELECT request_json FROM record_corrections WHERE tenant=? AND mode=? AND request_id=?',[a.tenant,mode,input.requestId]).first();
 if(prior){if(prior.request_json!==canonical(input))bad('Identificador já usado em outra correção.',409);return {trip:tripView(trip),replayed:true}}
 if(trip.revision!==input.revision)bad('Esta viagem mudou em outro aparelho. Atualize e revise a correção.',409);
 const next={...trip},c=input.changes;
 for(const [key,column] of [['route','route'],['leg','leg'],['origin','origin'],['destination','destination'],['driverId','driver_id']])if(Object.hasOwn(c,key))next[column]=c[key];
 if(!Object.hasOwn(routes,next.route)||!['inbound','outbound'].includes(next.leg))bad('Cidade ou sentido inválido.');
 next.origin=clean(next.origin,'Origem');next.destination=clean(next.destination,'Destino');next.base=routes[next.route];
 if(next.leg==='inbound'&&next.destination!=='Lavanderia'||next.leg==='outbound'&&next.origin!=='Lavanderia')bad('A viagem deve sair da lavanderia ou chegar à lavanderia.');
 if(trip.departed_at&&(next.driver_id!==trip.driver_id||next.leg!==trip.leg))bad('Após a saída, motorista e sentido preservam a autoria e o movimento original.');
 if(next.driver_id!==null)next.driver_id=clean(next.driver_id,'Motorista',100);
 if(next.driver_id!==trip.driver_id&&next.driver_id&&!await q(db,'SELECT driver_id FROM transport_memberships WHERE tenant=? AND mode=? AND driver_id=? AND enabled=1',[a.tenant,mode,next.driver_id]).first())bad('Motorista sem acesso aprovado.',403);
 const workspace=await q(db,'SELECT version FROM uniform_workspaces WHERE tenant=? AND mode=?',[a.tenant,mode]).first();
 const lotIds=Object.hasOwn(c,'lotIds')?c.lotIds:JSON.parse(trip.lot_ids);
 if(!Array.isArray(lotIds)||lotIds.length>100||lotIds.some(id=>typeof id!=='string'||id.length>80)||new Set(lotIds).size!==lotIds.length)bad('Lista de rols inválida.');
 for(const id of lotIds){const row=await q(db,"SELECT body FROM uniform_records WHERE tenant=? AND mode=? AND kind='rols' AND id=?",[a.tenant,mode,id]).first();if(!row||JSON.parse(row.body).snapshot?.city!==next.route)bad('Rol não pertence à cidade da viagem.')}
 next.lot_ids=JSON.stringify([...lotIds].sort());
 const now=new Date().toISOString();
 for(const [key,column]of [['departedAt','departed_at'],['arrivedAt','arrived_at']])if(Object.hasOwn(c,key)&&c[key]!==trip[column]){if(!trip[column]||typeof c[key]!=='string'||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/.test(c[key])||!Number.isFinite(Date.parse(c[key]))||new Date(c[key].slice(0,10)+'T12:00:00Z').toISOString().slice(0,10)!==c[key].slice(0,10))bad('Só é possível corrigir um horário já registrado, sem apagar ou criar movimentos.');next[column]=new Date(c[key]).toISOString()}
 for(const at of [next.departed_at,next.arrived_at])if(at&&(Date.parse(at)<Date.parse(trip.created_at)||Date.parse(at)>Date.parse(now)))bad('O horário deve ficar entre a criação da viagem e o momento atual.');
 if(next.arrived_at&&(!next.departed_at||Date.parse(next.arrived_at)<Date.parse(next.departed_at)))bad('A chegada não pode ocorrer antes da saída.');
 if(canonical(trip)===canonical(next))bad('Nenhum campo foi alterado.');
 const version=trip.revision+1,requestJson=canonical(input),guard='tenant=? AND mode=? AND id=? AND revision=? AND last_request=?';
 // Uniform workspace version prevents a city correction racing with this link edit.
 const result=await db.batch([
 q(db,`UPDATE transport_trips SET route=?,base=?,leg=?,origin=?,destination=?,driver_id=?,lot_ids=?,departed_at=?,arrived_at=?,revision=?,last_request=? WHERE tenant=? AND mode=? AND id=? AND revision=? AND COALESCE((SELECT version FROM uniform_workspaces WHERE tenant=? AND mode=?),0)=? AND (? IS NULL OR ?=driver_id OR EXISTS (SELECT 1 FROM transport_memberships WHERE tenant=? AND mode=? AND driver_id=? AND enabled=1)) AND NOT EXISTS (SELECT 1 FROM record_corrections WHERE tenant=? AND mode=? AND request_id=?)`,[next.route,next.base,next.leg,next.origin,next.destination,next.driver_id,next.lot_ids,next.departed_at,next.arrived_at,version,input.requestId,a.tenant,mode,tripId,input.revision,a.tenant,mode,workspace?.version||0,next.driver_id,next.driver_id,a.tenant,mode,next.driver_id,a.tenant,mode,input.requestId]),
 q(db,`INSERT OR IGNORE INTO record_corrections(id,tenant,mode,entity_kind,entity_id,reason,before_json,after_json,actor,created_at,request_id,request_json,version) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM transport_trips WHERE ${guard})`,[crypto.randomUUID(),a.tenant,mode,'trips',tripId,why,JSON.stringify(tripView(trip)),JSON.stringify(tripView({...next,revision:version})),a.userId,now,input.requestId,requestJson,version,a.tenant,mode,tripId,version,input.requestId])
 ]);
 if(!result[0]?.meta?.changes){const duplicate=await q(db,'SELECT request_json FROM record_corrections WHERE tenant=? AND mode=? AND request_id=?',[a.tenant,mode,input.requestId]).first();if(duplicate?.request_json===requestJson)return {trip:tripView(await get()),replayed:true};bad('A viagem ou um registro vinculado mudou. Atualize e revise a correção.',409)}
 return {trip:tripView(await get())};
}
