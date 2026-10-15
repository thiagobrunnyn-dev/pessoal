import {db,bucket} from './maintenance';
import {RequestError} from './http-security';
import {randomHex,sha256,epoch} from './visit-security';
import {readServicePhoto} from './service-photo';
import {SITE_OWNER_ID} from './owner-access';
import {guestUuid,guestToken,guestReceipt} from './guest-channel-model';
import {GUEST_HEADERS,guestLimit,uploadBudget,hashBytes} from './guest-channel-public';
import {INTAKE_PRIVACY_VERSION,INTAKE_KINDS,intakeKind,parseIntakeValues,type IntakeKind} from './request-intake-model';
export {GUEST_HEADERS};
const sessionSeconds=900,cookieName=(kind:IntakeKind)=>'__Host-mobiliza-request-'+kind;
export function publicFormData(value:string){const kind=intakeKind(value);return {kind,title:INTAKE_KINDS[kind],privacy_version:INTAKE_PRIVACY_VERSION};}
export async function startIntakeSession(request:Request,value:string){
 const kind=intakeKind(value);await guestLimit(request,'general:'+kind,'session');
 const cookie=randomHex(),challenge=randomHex(),now=epoch();
 await db().prepare('INSERT INTO request_form_sessions(id,kind,token_hash,challenge_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),kind,await sha256(cookie),await sha256(challenge),now+sessionSeconds,now).run();
 await db().prepare('DELETE FROM request_form_sessions WHERE id IN(SELECT id FROM request_form_sessions WHERE expires_at<? LIMIT 100)').bind(now-900).run();
 return {data:{challenge,expires_at:now+sessionSeconds},cookie:`${cookieName(kind)}=${cookie}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${sessionSeconds}`};
}
export async function submitIntake(request:Request,value:string,form:FormData){
 const kind=intakeKind(value),allowed=['request_id','challenge','values','photos','website'];
 for(const[k]of form)if(!allowed.includes(k)||k!=='photos'&&form.getAll(k).length!==1)throw new RequestError('Envie somente os campos do formulário.');
 if(form.get('website'))throw new RequestError('Envio inválido.');
 const requestId=form.get('request_id'),challenge=form.get('challenge');
 if(typeof requestId!=='string'||!guestUuid.test(requestId)||typeof challenge!=='string'||!guestToken.test(challenge))throw new RequestError('Renove o envio sem apagar os campos.',401);
 const cookies=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName(kind)+'=')),cookie=cookies.length===1?cookies[0].slice(cookieName(kind).length+1):'';
 if(!guestToken.test(cookie))throw new RequestError('Renove o envio sem apagar os campos.',401);
 const session=await db().prepare('SELECT id FROM request_form_sessions WHERE kind=? AND token_hash=? AND challenge_hash=? AND expires_at>unixepoch()').bind(kind,await sha256(cookie),await sha256(challenge)).first<any>();
 if(!session)throw new RequestError('O formulário expirou. Tente enviar novamente sem apagar os campos.',401);
 let input:unknown;try{const raw=form.get('values');if(typeof raw!=='string'||raw.length>14000)throw Error();input=JSON.parse(raw);}catch{throw new RequestError('Confira os dados do formulário.');}
 const values=parseIntakeValues(kind,input),entries=form.getAll('photos');
 if(entries.length>3||entries.some(f=>!(f instanceof File)))throw new RequestError('Use até três imagens.');
 const prepared:{bytes:Uint8Array;type:string;hash:string}[]=[];
 for(const file of entries as File[]){if(!file.size||file.size>4*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new RequestError('Use JPG, PNG ou WebP de até 4 MB por imagem.');let bytes:Uint8Array;try{bytes=readServicePhoto(await file.arrayBuffer(),file.type);}catch{throw new RequestError('Uma imagem não é válida. Escolha uma imagem estática.');}prepared.push({bytes,type:file.type,hash:await hashBytes(bytes)});}
 const fingerprint=await sha256(JSON.stringify({kind,values,photos:prepared.map(f=>[f.type,f.hash])}));
 const replay=async()=>{const row=await db().prepare('SELECT protocol,received_at,request_fingerprint FROM request_intakes WHERE owner_id=? AND kind=? AND request_id=?').bind(SITE_OWNER_ID,kind,requestId).first<any>();if(!row)return null;if(row.request_fingerprint!==fingerprint)throw new RequestError('Este envio já foi recebido com outros dados. Abra um novo formulário.',409);return guestReceipt(row,true);};
 const previous=await replay();if(previous)return previous;
 await uploadBudget('general:'+kind,prepared.reduce((sum,f)=>sum+f.bytes.length,0));
 const id=crypto.randomUUID(),eventId=crypto.randomUUID(),protocol=(kind==='maintenance'?'MAN-':'COM-')+randomHex(8).toUpperCase(),now=new Date().toISOString(),uploaded:string[]=[];
 const files:{id:string;key:string;type:string;hash:string;size:number;position:number}[]=[];
 try{
  for(let i=0;i<prepared.length;i++){const f=prepared[i],fileId=crypto.randomUUID(),key=`request-intakes/${SITE_OWNER_ID}/${id}/${fileId}`;uploaded.push(key);await bucket().put(key,f.bytes,{httpMetadata:{contentType:f.type,cacheControl:'private, no-store'}});files.push({id:fileId,key,type:f.type,hash:f.hash,size:f.bytes.length,position:i});}
  const result=await db().batch([
   db().prepare("INSERT INTO request_intakes(id,owner_id,kind,protocol,values_json,received_at,status,revision,last_event_id,request_id,request_fingerprint) SELECT ?,?,?,?,?,?,'received',1,?,?,? WHERE EXISTS(SELECT 1 FROM request_form_sessions WHERE id=? AND kind=? AND expires_at>unixepoch()) AND NOT EXISTS(SELECT 1 FROM request_intakes WHERE owner_id=? AND kind=? AND request_id=?)").bind(id,SITE_OWNER_ID,kind,protocol,JSON.stringify(values),now,eventId,requestId,fingerprint,session.id,kind,SITE_OWNER_ID,kind,requestId),
   db().prepare("INSERT INTO request_intake_events(id,owner_id,intake_id,revision,state_code,action,before_status,after_status,note,actor_user_id,actor_name,request_id,request_fingerprint,created_at) SELECT ?,owner_id,id,1,NULL,'received',NULL,'received','',NULL,'Identificação declarada pelo solicitante',?,?,received_at FROM request_intakes WHERE id=? AND last_event_id=?").bind(eventId,'public:'+id,fingerprint,id,eventId),
   ...files.map(f=>db().prepare('INSERT INTO request_intake_files(id,owner_id,intake_id,object_key,content_type,size,sha256,position,created_at) SELECT ?,owner_id,id,?,?,?,?,?,received_at FROM request_intakes WHERE id=? AND last_event_id=?').bind(f.id,f.key,f.type,f.size,f.hash,f.position,id,eventId))
  ]);
  if(!result[0].meta.changes){const saved=await replay();if(saved)return saved;throw new RequestError('O formulário expirou. Renove o envio.',409);}
  uploaded.length=0;return guestReceipt({protocol,received_at:now});
 }catch(error){const committed=await db().prepare('SELECT protocol,received_at,request_fingerprint FROM request_intakes WHERE id=?').bind(id).first<any>().catch(()=>undefined);if(committed){uploaded.length=0;if(committed.request_fingerprint===fingerprint)return guestReceipt(committed,true);}if(committed===undefined)uploaded.length=0;throw error;
 }finally{if(uploaded.length)try{await bucket().delete(uploaded);}catch{console.error('Request temporary upload cleanup failed');}}
}
