import {maintenanceCompletion} from './maintenance-evidence';
import {anonymousGrantProfileSql} from './anonymous-profile-guard';
import {preparePeople} from './service-people';
import {belemToday} from './dashboard-period';
import {sanitizePhoto} from './photo-privacy';
import {parseServiceLocation,recordLocationStatement} from './service-location';
import {db,first,bucket,clean,validDate} from './maintenance';
import {recomputeSchedule} from './maintenance-schedule';
import {RequestError} from './http-security';
import {checklistItems,validateChecklist} from './checklist';
import type {VisitPrincipal} from './visit-security';
import {operatorGuard,type Operator} from './app-access';
type Principal={ownerId:string;equipmentId:string;visit?:VisitPrincipal;operator?:Operator};
export async function saveMaintenance(form:FormData,principal:Principal){
 const {ownerId,equipmentId,visit,operator}=principal,requestId=clean(form.get('request_id'),60),now=new Date().toISOString();const authorization=operator?operatorGuard(operator):null;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId))throw new RequestError('Atualize a página e tente novamente.');
 const existing=await first('SELECT id,completion_status,is_test FROM maintenance WHERE request_id=? AND owner_id=? AND equipment_id=? AND (? IS NULL OR visit_grant_id=?)',requestId,ownerId,equipmentId,visit?.grant_id??null,visit?.grant_id??null);if(existing){if(visit&&existing.is_test===1)throw new RequestError('Este registro foi classificado como teste pelo responsável.',409);return {id:existing.id,alreadySaved:true,completion:existing.completion_status,isTest:existing.is_test===1};}
 const equipment=await first('SELECT checklist,revision FROM equipment WHERE id=? AND owner_id=?',equipmentId,ownerId);if(!equipment)throw new RequestError('Equipamento não encontrado.',404);
 const submittedRevision=form.get('equipment_revision');if((submittedRevision===null&&equipment.revision>0)||(submittedRevision!==null&&(!Number.isSafeInteger(Number(submittedRevision))||Number(submittedRevision)!==equipment.revision)))throw new RequestError('O cadastro ou imóvel do aparelho mudou. Atualize a ficha e confira o equipamento antes de registrar.',409);
 const people=await preparePeople({ownerId,operator,visit},form.get('executor_profile_id'),clean(form.get('responsible'),120));
 const date=clean(form.get('service_date'),40),time=clean(form.get('service_time'),10),responsible=people.executorName,notes=clean(form.get('notes'),4000);
 if(!validDate(date)||date>belemToday()||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!responsible)throw new RequestError('Confira data, horário e responsável.');
 let raw:unknown;try{raw=JSON.parse(String(form.get('checklist_results')||'null'));}catch{throw new RequestError('Confira os itens da rotina.');}
 let checklist;try{checklist=validateChecklist(checklistItems(equipment.checklist),raw);}catch(e){throw new RequestError((e as Error).message);}
 const serviceLocation=parseServiceLocation(form);
 if(form.get('confirmed')!=='yes')throw new RequestError('Confirme os dados e as fotos deste registro.');
 if(form.getAll('photos').length)throw new RequestError('Atualize a tela e separe as fotos em Antes e Depois.');
 const before=form.getAll('photos_before'),after=form.getAll('photos_after');if([...before,...after].some(f=>!(f instanceof File))||before.length>3||after.length>3)throw new RequestError('Use até 3 fotos antes e 3 depois.');
 const files=[...before,...after] as File[],phases=files.map((_,i)=>i<before.length?'before':'after'),complete=before.length===3&&after.length===3,evidenceNote=clean(form.get('evidence_note'),1000);
 if(!complete&&(form.get('evidence_pending')!=='yes'||!evidenceNote))throw new RequestError('Anexe 3 fotos antes e 3 depois, ou marque a evidência pendente e explique o que falta.');
 const completion=maintenanceCompletion(checklist.completion,2,phases.map(phase=>({phase})));
 for(const f of files)if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size===0||f.size>4*1024*1024)throw new RequestError('Use fotos JPG, PNG ou WebP de até 4 MB cada.');
 const id=crypto.randomUUID(),uploaded:string[]=[],photoRows:{id:string;key:string;type:string;size:number;position:number;phase:string}[]=[];
 try{
 for(let i=0;i<files.length;i++){const f=files[i],bytes=await f.arrayBuffer(),s=new Uint8Array(bytes.slice(0,12));const valid=(f.type==='image/jpeg'&&s[0]===255&&s[1]===216&&s[2]===255)||(f.type==='image/png'&&s[0]===137&&s[1]===80&&s[2]===78&&s[3]===71)||(f.type==='image/webp'&&String.fromCharCode(...s.slice(0,4))==='RIFF'&&String.fromCharCode(...s.slice(8,12))==='WEBP');if(!valid)throw new RequestError('Uma das fotos não é válida. Escolha outra imagem.');let safe:Uint8Array;try{safe=sanitizePhoto(bytes,f.type);}catch{throw new RequestError('Uma foto não pode ser preparada sem metadados. Escolha JPG, PNG ou WebP estática.');}const photoId=crypto.randomUUID(),key=`photos/${ownerId}/${equipmentId}/${id}/${photoId}`;await bucket().put(key,safe,{httpMetadata:{contentType:f.type,cacheControl:'private, no-store'}});uploaded.push(key);photoRows.push({id:photoId,key,type:f.type,size:safe.length,position:i,phase:phases[i]});}
 const values=[id,ownerId,equipmentId,date,time,responsible,notes,JSON.stringify(checklist.results),now,files.length,requestId,visit?'technician':operator?.role==='operator'?'manager':'owner',visit?.grant_id??null,completion,operator?.actor.userId??null];
 const guard=visit?` WHERE EXISTS (SELECT 1 FROM visit_sessions s JOIN visit_grants g ON g.id=s.grant_id WHERE s.id=? AND s.token_hash=? AND g.id=? AND g.owner_id=? AND g.equipment_id=? AND s.revoked_at IS NULL AND g.revoked_at IS NULL AND s.expires_at>unixepoch() AND g.expires_at>unixepoch() AND ${anonymousGrantProfileSql('g.person_profile_id','g.owner_id')})`:authorization?' WHERE '+authorization.sql:'';
 const insert=db().prepare("INSERT INTO maintenance (id,owner_id,equipment_id,service_date,service_time,responsible,notes,checklist,created_at,photo_count,request_id,recorded_via,visit_grant_id,completion_status,recorded_by_user_id,people_metadata,evidence_version,evidence_note,equipment_snapshot) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,2,?,json_object('property_name',p.name,'address',p.address,'name',e.name,'location',e.location,'revision',e.revision) FROM equipment e JOIN properties p ON p.id=e.property_id AND p.owner_id=e.owner_id"+(guard||' WHERE 1=1')+people.sql+' AND e.id=? AND e.owner_id=? AND e.revision=?').bind(...values,people.json,evidenceNote,...(visit?[visit.session_id,visit.session_hash,visit.grant_id,ownerId,equipmentId]:authorization?.args||[]),...people.args,equipmentId,ownerId,equipment.revision);
 const statements=[insert,recordLocationStatement(ownerId,'maintenance',id,serviceLocation,now),...photoRows.map(p=>db().prepare('INSERT INTO photos (id,owner_id,maintenance_id,object_key,content_type,size,position,phase) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM maintenance WHERE id=?)').bind(p.id,ownerId,id,p.key,p.type,p.size,p.position,p.phase,id))];
 if(completion==='completed')statements.push(recomputeSchedule(ownerId,equipmentId,now,id));
 const results=await db().batch(statements);if(results[0].meta.changes<1){const current=await first('SELECT revision FROM equipment WHERE id=? AND owner_id=?',equipmentId,ownerId);if(current&&current.revision!==equipment.revision)throw new RequestError('O cadastro ou imóvel do aparelho mudou durante o envio. Atualize a ficha e confira antes de registrar.',409);throw new RequestError('Seu acesso expirou ou foi encerrado. Peça um novo código.',401);}
 uploaded.length=0;return {id,completion,evidence:complete?'complete':'pending'};
 }catch(e){if(uploaded.length){let committed=true;try{committed=!!await db().prepare('SELECT id FROM maintenance WHERE id=? AND owner_id=? AND request_id=?').bind(id,ownerId,requestId).first();}catch{}if(committed)uploaded.length=0;}if(uploaded.length){try{await bucket().delete(uploaded);}catch{console.error('Temporary photo cleanup failed');}}
 // A concurrent retry may have committed the same request while this upload ran.
 const replay=await first('SELECT id,completion_status,is_test FROM maintenance WHERE request_id=? AND owner_id=? AND equipment_id=? AND (? IS NULL OR visit_grant_id=?)',requestId,ownerId,equipmentId,visit?.grant_id??null,visit?.grant_id??null).catch(()=>null);if(replay&&(!visit||!replay.is_test))return {id:replay.id,alreadySaved:true,completion:replay.completion_status,isTest:replay.is_test===1};throw e;}
}
