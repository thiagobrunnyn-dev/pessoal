import {assets} from './assets.js';
import {access} from './access.js';
import {tripList,driverList,createTrip,driverEvent,assignTrip,correctTrip} from './transport.js';
import {empty,act,Invalid,businessDate} from './model.js';
import {correct,canonical} from './corrections.js';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",'Permissions-Policy':'camera=(self), microphone=(), geolocation=()'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
const prepare=(db,sql,args=[])=>db.prepare(sql).bind(...args);
async function read(db,tenant,mode){const [ws,rs]=await db.batch([prepare(db,'SELECT version FROM uniform_workspaces WHERE tenant=? AND mode=?',[tenant,mode]),prepare(db,'SELECT kind,body FROM uniform_records WHERE tenant=? AND mode=?',[tenant,mode])]);const workspace=ws.results?.[0];const data=empty();for(const row of rs.results||[]){if(Object.hasOwn(data,row.kind))data[row.kind].push(JSON.parse(row.body))}return {state:data,version:workspace?.version||0}}
export default {async fetch(request,env){try{
 const url=new URL(request.url),userId=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
 if(!userId||!email)return json({error:'Entre com a conta autorizada para acessar este sistema.'},401);
 const mode=url.searchParams.get('mode')||'live';if(!['live','demo'].includes(mode))return json({error:'Ambiente inválido.'},400);
 const actor=await access(env.DB,userId,mode,env.OWNER_SUBJECT);if(!actor)return json({error:'Conta sem acesso aprovado à operação.'},403);
 const driverPath=url.pathname.startsWith('/api/driver/');
 if(actor.role==='driver'&&!driverPath&&!['/motorista','/driver.html','/driver.js','/styles.css','/mbl-logo.jpeg'].includes(url.pathname))return json({error:'Acesso restrito ao painel do motorista.'},403);
 if(url.pathname==='/api/health')return json({authenticated:true,storageConfigured:!!env.DB,mode:'private-owner-only'});
 if(url.pathname.startsWith('/api/')){
  if(!env.DB)return json({error:'O banco compartilhado não está disponível. Nenhuma movimentação foi salva.'},503);
  const tenant=actor.tenant;
  if(url.pathname==='/api/trips'&&request.method==='GET')return json(await tripList(env.DB,actor,mode));
  if(url.pathname==='/api/driver/trips'&&request.method==='GET')return json(await driverList(env.DB,actor,mode));
  if((url.pathname==='/api/trips'||url.pathname==='/api/trips/assign'||url.pathname==='/api/trips/correct'||url.pathname==='/api/driver/event')&&request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return json({error:'Origem da requisição não autorizada.'},403);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Formato inválido.'},415);
   const raw=await request.text();if(raw.length>20000)return json({error:'Requisição muito grande.'},413);
   let input;try{input=JSON.parse(raw)}catch{return json({error:'Conteúdo inválido.'},400)}
   return json(url.pathname==='/api/trips'?await createTrip(env.DB,actor,mode,input):url.pathname==='/api/trips/assign'?await assignTrip(env.DB,actor,mode,input):url.pathname==='/api/trips/correct'?await correctTrip(env.DB,actor,mode,input):await driverEvent(env.DB,actor,mode,input));
  }
  if(url.pathname==='/api/state'&&request.method==='GET'){const data=await read(env.DB,tenant,mode);return json({...data,mode,businessDate:businessDate(new Date().toISOString()),timezone:'America/Belem',email})}
  if(url.pathname==='/api/corrections'&&request.method==='GET'){const rows=await prepare(env.DB,'SELECT id,entity_kind,entity_id,reason,before_json,after_json,actor,created_at,version FROM record_corrections WHERE tenant=? AND mode=? ORDER BY created_at DESC,id DESC',[tenant,mode]).all();return json({corrections:(rows.results||[]).map(r=>({...r,before:JSON.parse(r.before_json),after:JSON.parse(r.after_json),before_json:undefined,after_json:undefined}))})}
  if(url.pathname==='/api/export'&&request.method==='GET'){const data=await read(env.DB,tenant,mode);const audit=await prepare(env.DB,'SELECT id,request_id,kind,summary,actor,created_at,version FROM uniform_audit WHERE tenant=? AND mode=? AND version<=? ORDER BY version',[tenant,mode,data.version]).all();return json({format:'uniformes-pilot-v1',exportedAt:new Date().toISOString(),mode,timezone:'America/Belem',...data,audit:audit.results||[],corrections:(await prepare(env.DB,'SELECT * FROM record_corrections WHERE tenant=? AND mode=? ORDER BY created_at,id',[tenant,mode]).all()).results||[],transport:{...await tripList(env.DB,actor,mode,{complete:true}),events:(await prepare(env.DB,'SELECT trip_id,kind,actor,created_at,request_id FROM transport_events WHERE tenant=? AND mode=? ORDER BY created_at',[tenant,mode]).all()).results||[]}})}
  if(url.pathname==='/api/action'&&request.method==='POST'){
   if(request.headers.get('origin')!==url.origin)return json({error:'Origem da requisição não autorizada.'},403);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Formato inválido.'},415);
   const raw=await request.text();if(raw.length>10000)return json({error:'Requisição muito grande.'},413);let input;try{input=JSON.parse(raw)}catch{return json({error:'Conteúdo inválido.'},400)}
   if(!input||typeof input.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(input.requestId)||!Number.isSafeInteger(input.version)||input.version<0)return json({error:'Identificador ou versão inválida.'},400);
   if(Object.hasOwn(input,'tenant')||Object.hasOwn(input,'tenantId')||Object.hasOwn(input,'userId'))return json({error:'Identidade é definida pelo servidor.'},400);
   const duplicate=await prepare(env.DB,'SELECT version,request_json FROM uniform_audit WHERE tenant=? AND mode=? AND request_id=?',[tenant,mode,input.requestId]).first();if(duplicate){if(duplicate.request_json!==canonical(input))return json({error:'Identificador já usado em outra ação ou conteúdo. Atualize antes de tentar novamente.'},409);return json({...await read(env.DB,tenant,mode),message:'Movimentação já salva. Não foi duplicada.',replayed:true})}
   const current=await read(env.DB,tenant,mode);if(current.version!==input.version)return json({error:'Outro aparelho atualizou os dados. Atualize e repita a ação.',...current},409);
   const now=new Date().toISOString(),out=input.type==='correct'?correct(current.state,input,now):act(current.state,input,mode,now),next=current.version+1;
   if(out.correction?.kind==='rols'){const corrected=out.state.rols.find(r=>r.id===out.correction.id);const trips=(await prepare(env.DB,'SELECT route,lot_ids FROM transport_trips WHERE tenant=? AND mode=?',[tenant,mode]).all()).results||[];if(trips.some(t=>JSON.parse(t.lot_ids).includes(corrected.id)&&t.route!==corrected.snapshot.city))return json({error:'Este rol está vinculado a uma viagem de outra cidade. Corrija o vínculo da viagem antes de mudar a cidade.'},400)}
   const transactionId=crypto.randomUUID();
   const guard='EXISTS (SELECT 1 FROM uniform_workspaces WHERE tenant=? AND mode=? AND version=? AND last_request=?)';
   const linkage=out.correction?.kind==='rols'?out.state.rols.find(r=>r.id===out.correction.id):null;
   const linkageGuard=linkage?' AND NOT EXISTS (SELECT 1 FROM transport_trips t,json_each(t.lot_ids) j WHERE t.tenant=? AND t.mode=? AND j.value=? AND t.route<>?)':'';
   const queries=[prepare(env.DB,'INSERT OR IGNORE INTO uniform_workspaces(tenant,mode,version,last_request,updated_at) VALUES(?,?,0,?,?)',[tenant,mode,'',now]),prepare(env.DB,'UPDATE uniform_workspaces SET version=?,last_request=?,updated_at=? WHERE tenant=? AND mode=? AND version=?'+linkageGuard,[next,transactionId,now,tenant,mode,current.version,...(linkage?[tenant,mode,linkage.id,linkage.snapshot.city]:[])])];
   for(const kind of Object.keys(out.state)){const old=new Map(current.state[kind].map(x=>[x.id,JSON.stringify(x)]));for(const row of out.state[kind]){const body=JSON.stringify(row);if(body===old.get(row.id))continue;queries.push(prepare(env.DB,`INSERT INTO uniform_records(tenant,mode,kind,id,company_id,body) SELECT ?,?,?,?,?,? WHERE ${guard} ON CONFLICT(tenant,mode,kind,id) DO UPDATE SET company_id=excluded.company_id,body=excluded.body`,[tenant,mode,kind,row.id,row.companyId||'',body,tenant,mode,next,transactionId]))}}
   queries.push(prepare(env.DB,`INSERT INTO uniform_audit(id,tenant,mode,request_id,kind,summary,actor,created_at,version,request_json) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),tenant,mode,input.requestId,input.type,out.message,userId,now,next,canonical(input),tenant,mode,next,transactionId]));
   if(out.correction){const c=out.correction;queries.push(prepare(env.DB,`INSERT INTO record_corrections(id,tenant,mode,entity_kind,entity_id,reason,before_json,after_json,actor,created_at,request_id,request_json,version) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),tenant,mode,c.kind,c.id,c.reason,JSON.stringify(c.before),JSON.stringify(c.after),userId,now,input.requestId,canonical(input),next,tenant,mode,next,transactionId]))}
   const batch=await env.DB.batch(queries);if(!batch[1]?.meta?.changes){const replay=await prepare(env.DB,'SELECT request_json FROM uniform_audit WHERE tenant=? AND mode=? AND request_id=?',[tenant,mode,input.requestId]).first();if(replay?.request_json===canonical(input))return json({...await read(env.DB,tenant,mode),message:'Correção ou movimento já salvo. Não foi duplicado.',replayed:true});return json({error:'Outro aparelho salvou primeiro. Atualize e tente novamente.'},409)}
   return json({state:out.state,version:next,message:out.message,result:out.result});
  }
  return json({error:'Rota não encontrada.'},404);
 }
 if(!['GET','HEAD'].includes(request.method))return json({error:'Método inválido.'},405);
 const asset=assets[url.pathname==='/'?'/index.html':url.pathname==='/motorista'?'/driver.html':url.pathname==='/viagens'?'/transport.html':url.pathname];if(!asset)return new Response('Não encontrado',{status:404,headers});
 const body=(url.pathname==='/motorista'||url.pathname==='/driver.html')?asset.body.replaceAll('/styles.css\"','/styles.css?mode='+mode+'\"').replaceAll('/driver.js\"','/driver.js?mode='+mode+'\"').replaceAll('/mbl-logo.jpeg\"','/mbl-logo.jpeg?mode='+mode+'\"'):asset.body;
 return new Response(request.method==='HEAD'?null:asset.binary?Uint8Array.from(atob(body),c=>c.charCodeAt(0)):body,{headers:{...headers,'Content-Type':asset.type}});
 }catch(e){if(e instanceof Invalid)return json({error:e.message},e.status);console.error('uniform-pilot-error',e?.name);return json({error:'Não foi possível confirmar o salvamento. Atualize antes de repetir; seus registros anteriores continuam preservados.'},503)}}};
