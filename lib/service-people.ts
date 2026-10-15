import {getChatGPTUser} from '../app/chatgpt-auth';
import {all,first,clean} from './maintenance';
import type {Operator} from './app-access';
import type {VisitPrincipal} from './visit-security';
import type {CleaningPrincipal} from './cleaning-security';
import {RequestError} from './http-security';
export type ServiceEntity='maintenance'|'cleaning_record'|'work_order'|'handover';
export type PeoplePrincipal={ownerId:string;operator?:Operator;visit?:VisitPrincipal;cleaningVisit?:CleaningPrincipal};
type Row=Record<string,any>;
export async function actorSnapshot(op:Operator){
 const p=await first("SELECT id,revision,display_name,job_title,current_photo_asset_id FROM person_profiles WHERE owner_id=? AND app_member_user_id=? AND status='active'",op.ownerId,op.actor.userId);
 return {kind:'member',user_id:op.actor.userId,grant_id:null,name:p?.display_name||op.actor.fullName||'Gestão autorizada',title:p?.job_title||op.title,profile_id:p?.id??null,photo_asset_id:p?.current_photo_asset_id??null,profile_revision:p?.revision??null};
}
export async function preparePeople(principal:PeoplePrincipal,requestedProfile:unknown,responsible:string,actKind='execution'){
 const visit=principal.visit,cleaning=principal.cleaningVisit,grant=visit||cleaning;
 const supplied=clean(requestedProfile,80),bound=grant?.person_profile_id||'';
 if(grant&&supplied&&supplied!==bound)throw new RequestError('O perfil do executor é definido no acesso desta visita.',403);
 const profileId=grant?bound:supplied;
 const profile=profileId?await first("SELECT id,revision,display_name,job_title,app_member_user_id,current_photo_asset_id FROM person_profiles WHERE id=? AND owner_id=? AND status='active' AND directory<>'guest'",profileId,principal.ownerId):null;
 if(profileId&&!profile)throw new RequestError('O perfil do executor não está disponível. Atualize o formulário.',409);
 if(grant&&profile?.app_member_user_id)throw new RequestError('Este perfil usa a conta vinculada. Entre com sua conta para registrar.',403);
 const actor=principal.operator?await actorSnapshot(principal.operator):{kind:visit?'visit':'cleaning_visit',user_id:null,grant_id:grant?.grant_id??null,name:visit?.technician_name||cleaning?.person_name||'Acesso por código',title:profile?.job_title||'Acesso por código',profile_id:profile?.id??null,photo_asset_id:profile?.current_photo_asset_id??null,profile_revision:profile?.revision??null};
 const executorName=grant?actor.name:profile?.display_name||responsible;
 const metadata={act_kind:actKind,executor:{profile_id:profile?.id??null,name:executorName,title:profile?.job_title||'',photo_asset_id:profile?.current_photo_asset_id??null,user_id:profile?.app_member_user_id??null},actor};
 const checks:Row[]=[];if(profile)checks.push(profile);if(actor.profile_id&&!checks.some(p=>p.id===actor.profile_id))checks.push({id:actor.profile_id,revision:actor.profile_revision});
 return {metadata,executorName,json:JSON.stringify(metadata),sql:checks.map(()=>" AND EXISTS(SELECT 1 FROM person_profiles WHERE id=? AND owner_id=? AND revision=? AND status='active')").join(''),args:checks.flatMap(p=>[p.id,principal.ownerId,p.revision])};
}
export function parsedPeople(value:unknown){try{const p=JSON.parse(String(value));return p&&typeof p==='object'&&p.executor&&p.actor?p:null;}catch{return null;}}
const parents:Record<ServiceEntity,{table:string;revision:string}>={maintenance:{table:'maintenance',revision:'revision'},cleaning_record:{table:'cleaning_records',revision:'revision'},work_order:{table:'work_orders',revision:'version'},handover:{table:'housing_handovers',revision:'revision'}};
export function serviceEntity(value:unknown):ServiceEntity{if(typeof value!=='string'||!Object.hasOwn(parents,value))throw new RequestError('Registro inválido.');return value as ServiceEntity;}
export function sourceTable(type:ServiceEntity){return parents[type];}
export async function currentAttribution(ownerId:string,type:ServiceEntity,id:string,act?:string){const source=parents[type];return first(`SELECT a.* FROM service_attributions a JOIN ${source.table} r ON r.id=a.entity_id AND r.owner_id=a.owner_id AND r.${source.revision}=a.source_revision WHERE a.owner_id=? AND a.entity_type=? AND a.entity_id=?${act?' AND a.act_kind=?':''} ORDER BY a.created_at DESC LIMIT 1`,ownerId,type,id,...(act?[act]:[]));}
export async function peopleForRecords(ownerId:string,type:ServiceEntity,records:Row[],options:{publicToken?:string;publicView?:boolean;visitView?:boolean;grantId?:string}={}){
 const ids=records.map(r=>String(r.id));if(!ids.length)return records;
 const actor=options.publicView||options.visitView?null:await getChatGPTUser();const rows:Row[]=[];
 for(let at=0;at<ids.length;at+=70){const slice=ids.slice(at,at+70);rows.push(...await all(`SELECT a.*,x.id acceptance_id,x.accepted_at,x.actor_name accepted_by FROM service_attributions a LEFT JOIN execution_acceptances x ON x.attribution_id=a.id WHERE a.owner_id=? AND a.entity_type=? AND a.entity_id IN(${slice.map(()=>'?').join(',')})`,ownerId,type,...slice));}
 return records.map(r=>{const revision=Number(r.revision??r.version),matches=rows.filter(a=>a.entity_id===r.id&&a.source_revision===revision),a=matches.at(-1);if(!a)return r;
 const photo=(role:string)=>options.publicToken?`/api/cleaning/share/${options.publicToken}/people-photo/${a.id}`:`/api/service-people/photo/${a.id}?role=${role}`;
 const executor={name:a.executor_name,title:a.executor_title,photo_path:a.executor_photo_asset_id?photo('executor'):null};
 if(options.publicView)return {...r,people:{executor}};
 return {...r,people:{attribution_id:a.id,act_kind:a.act_kind,can_request_acceptance:options.visitView?!!options.grantId&&a.grant_id===options.grantId:!!actor&&a.executor_user_id===actor.userId,executor,recorder:{name:a.actor_name,title:a.actor_title,recorded_at:a.created_at,access_kind:a.principal_kind,photo_path:!options.visitView&&a.actor_photo_asset_id?photo('actor'):null},acceptance:a.acceptance_id?{id:a.acceptance_id,accepted_at:a.accepted_at,actor_name:a.accepted_by,...(!options.visitView?{signature_path:'/api/execution-acceptances/'+a.acceptance_id+'/signature'}:{})}:null}};
 });
}
