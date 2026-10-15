import {all,db,first} from './maintenance';
import {invitationFor,managerGuard,operatorGuard,type Operator} from './app-access';
import {SITE_OWNER_ID} from './owner-access';
import {isRegionalRequest,REGIONAL_EMAIL} from './regional-access';
import {RequestError} from './http-security';

type Row=Record<string,string|number|null>;
export type SupervisorOption={ref:string;display_name:string;title:string;kind:'person'|'account';state_code:string|null;allowed_state_code:string|null;profile_id?:string;aliases?:string[]};
type SupervisorLink={supervisor_profile_id:string|null;supervisor_account_user_id:string|null};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACCOUNT_ID=/^[A-Za-z0-9_-]{1,200}$/;
const STRUCTURAL_COLUMNS='id,revision,supervisor_profile_id,supervisor_account_user_id,app_member_user_id';

// A namespaced selector is authoritative. Old forms cannot accidentally erase a
// supervisor account they never received a control for.
export function supervisorInput(form:FormData,original:Row|null):SupervisorLink{
 if(form.has('supervisor_ref')){
  const values=form.getAll('supervisor_ref');
  if(values.length!==1||typeof values[0]!=='string')throw new RequestError('Responsável pela equipe inválido.');
  const ref=values[0];
  if(ref==='')return {supervisor_profile_id:null,supervisor_account_user_id:null};
  if(ref.startsWith('person:')&&UUID.test(ref.slice(7)))return {supervisor_profile_id:ref.slice(7),supervisor_account_user_id:null};
  if(ref.startsWith('account:')&&ACCOUNT_ID.test(ref.slice(8)))return {supervisor_profile_id:null,supervisor_account_user_id:ref.slice(8)};
  throw new RequestError('Responsável pela equipe inválido.');
 }
 const values=form.getAll('supervisor_profile_id');
 if(values.length>1||values.some(value=>typeof value!=='string'))throw new RequestError('Responsável pela equipe inválido.');
 const id=String(values[0]||'').trim();
 if(id&&!UUID.test(id))throw new RequestError('Responsável pela equipe inválido.');
 return {supervisor_profile_id:id||null,supervisor_account_user_id:id?null:String(original?.supervisor_account_user_id||'')||null};
}

export async function supervisorOptions(visibleRows:Row[]):Promise<SupervisorOption[]>{
 const options:SupervisorOption[]=visibleRows.filter(row=>row.status==='active'&&row.directory!=='guest').map(row=>({ref:'person:'+row.id,display_name:String(row.display_name),title:String(row.job_title),kind:'person',state_code:row.state_code?String(row.state_code):null,allowed_state_code:null,profile_id:String(row.id)}));
 const linked=new Map(visibleRows.filter(row=>row.app_member_user_id).map(row=>[String(row.app_member_user_id),row]));
 const members=await all("SELECT user_id,email,role,status FROM app_members");
 for(const member of members){
  if(member.email!==REGIONAL_EMAIL||member.role!=='maintenance_lead')continue;
  const profile=linked.get(String(member.user_id));
  const option=options.find(item=>item.profile_id===profile?.id);
  if(option)option.allowed_state_code='PA';
 }
 const accounts=[{user_id:SITE_OWNER_ID,name:'Administrador',title:'Sócio-administrador',state_code:null as string|null},...members.flatMap(row=>{
  const invitation=invitationFor(String(row.email));
  // Both the approved email and role must match, just as in managerGuard.
  if(row.status!=='active'||!invitation||invitation.email!==row.email||invitation.role!==row.role||row.user_id===SITE_OWNER_ID)return [];
  return [{user_id:String(row.user_id),name:invitation.name,title:invitation.title,state_code:invitation.email===REGIONAL_EMAIL?'PA':null}];
 })];
 for(const account of accounts){
  const profile=linked.get(account.user_id);
  if(profile?.status==='active'&&profile.directory!=='guest'){
   const representative=options.find(item=>item.profile_id===profile.id)!;
   representative.aliases=['account:'+account.user_id];
   representative.allowed_state_code=account.state_code;
   continue;
  }
  options.push({ref:'account:'+account.user_id,display_name:account.name,title:account.title,kind:'account',state_code:account.state_code,allowed_state_code:account.state_code,...(profile?{profile_id:String(profile.id)}:{})});
 }
 return options.sort((a,b)=>a.display_name.localeCompare(b.display_name,'pt-BR')||a.ref.localeCompare(b.ref));
}

// Reads crossing a regional boundary expose only relationship IDs/revisions to
// this validator, never a person's name, private documents, contact or photo.
// These rows never enter a DTO, audit or service snapshot.
export async function supervisorGuards(op:Operator,id:string,next:Row,archive:boolean){
 const guards:string[]=[],args:unknown[]=[];
 const add=(sql:string,...values:unknown[])=>{guards.push(sql);args.push(...values);};
 const auth=operatorGuard(op),regional=isRegionalRequest();
 const structural=async(where:string,...values:unknown[])=>db().prepare(`SELECT ${STRUCTURAL_COLUMNS} FROM person_profiles WHERE owner_id=? AND ${where} AND ${auth.sql}`).bind(op.ownerId,...values,...auth.args).first<Row>();
 const profileCache=new Map<string,Row|null>(),accountCache=new Map<string,Row|null>();
 const observedProfiles=new Map<string,Row>(),unlinkedAccounts=new Set<string>();
 const profileGuard=(row:Row)=>observedProfiles.set(String(row.id),row);
 const profile=async(profileId:string)=>{
  if(profileId===id)return next;
  if(!profileCache.has(profileId)){
   const row=await structural('id=?',profileId);
   if(!row)throw new RequestError('A hierarquia desta pessoa não está disponível neste acesso.');
   profileGuard(row);profileCache.set(profileId,row);
  }
  return profileCache.get(profileId)!;
 };
 const accountProfile=async(accountId:string)=>{
  if(!accountCache.has(accountId)){
   const row=await structural('app_member_user_id=?',accountId);
   if(row){
    profileGuard(row);profileCache.set(String(row.id),row);
    // The observed account binding is guarded with this profile's exact edges.
   }else unlinkedAccounts.add(accountId);
   accountCache.set(accountId,row);
  }
  // Validate the prospective graph, including a newly created/changed binding.
  if(next.app_member_user_id===accountId)return {id,...next};
  const row=accountCache.get(accountId);
  return row?.id===id?null:row;
 };
 if(next.supervisor_profile_id&&next.supervisor_account_user_id)throw new RequestError('Escolha somente um responsável pela equipe.');
 if(!archive&&next.supervisor_profile_id){
  const direct=await first("SELECT id,revision,state_code,app_member_user_id FROM person_profiles WHERE id=? AND owner_id=? AND status='active' AND directory<>'guest'",next.supervisor_profile_id,op.ownerId);
  if(!direct||regional&&direct.state_code!=='PA')throw new RequestError('Escolha uma pessoa ativa disponível neste acesso.');
  add("EXISTS(SELECT 1 FROM person_profiles WHERE id=? AND owner_id=? AND revision=? AND status='active' AND directory<>'guest'"+(regional?" AND state_code='PA'":'')+')',direct.id,op.ownerId,direct.revision);
  if(direct.app_member_user_id){
   const member=await first('SELECT user_id,email,role,revision,status FROM app_members WHERE user_id=?',direct.app_member_user_id);
   if(member?.email===REGIONAL_EMAIL&&member.role==='maintenance_lead'){
    if(next.state_code!=='PA')throw new RequestError('Este responsável pela equipe está disponível somente para cadastros do Pará.');
    add('EXISTS(SELECT 1 FROM app_members WHERE user_id=? AND revision=? AND email=? AND role=? AND status=?)',member.user_id,member.revision,member.email,member.role,member.status);
   }else if(member)add('EXISTS(SELECT 1 FROM app_members WHERE user_id=? AND revision=? AND email=? AND role=? AND status=?)',member.user_id,member.revision,member.email,member.role,member.status);
   else add('NOT EXISTS(SELECT 1 FROM app_members WHERE user_id=?)',direct.app_member_user_id);
  }
 }
 if(!archive&&next.supervisor_account_user_id&&next.supervisor_account_user_id!==SITE_OWNER_ID){
  const member=await first("SELECT user_id,email,role,revision FROM app_members WHERE user_id=? AND status='active'",next.supervisor_account_user_id);
  const invitation=member?invitationFor(String(member.email)):null;
  if(!member||!invitation||invitation.email!==member.email||invitation.role!==member.role)throw new RequestError('Escolha uma conta gestora ativa disponível neste acesso.');
  if(invitation.email===REGIONAL_EMAIL&&next.state_code!=='PA')throw new RequestError('Este responsável pela equipe está disponível somente para cadastros do Pará.');
  const memberGuard=managerGuard(String(member.user_id),Number(member.revision));add(memberGuard.sql,...memberGuard.args);
  add("EXISTS(SELECT 1 FROM app_members WHERE user_id=? AND email=? AND role=? AND revision=? AND status='active')",member.user_id,member.email,member.role,member.revision);
 }
 if(archive)return {guards,args};
 // Every reachable person/account is a distinct node. Resolving an account to
 // an archived profile still follows its edges, so linking/restoring later can
 // never silently complete a mixed cycle.
 const seen=new Set<string>(['person:'+id]);let node=next;
 for(let depth=0;node.supervisor_profile_id||node.supervisor_account_user_id;depth++){
  if(depth>=20)throw new RequestError('A hierarquia é extensa demais para este vínculo. Revise os responsáveis pela equipe.');
  let nextId:string;
  if(node.supervisor_account_user_id){
   const accountId=String(node.supervisor_account_user_id),ref='account:'+accountId;
   if(seen.has(ref))throw new RequestError('Este vínculo criaria um ciclo entre responsáveis pela equipe.');
   seen.add(ref);
   const resolved=await accountProfile(accountId);
   if(!resolved)break;
   nextId=String(resolved.id);
  }else nextId=String(node.supervisor_profile_id);
  if(seen.has('person:'+nextId))throw new RequestError('A pessoa não pode ser sua própria responsável nem criar um ciclo entre responsáveis pela equipe.');
  seen.add('person:'+nextId);node=(await profile(nextId))!;
 }
 // A packed witness keeps long, mixed hierarchies below D1's bind limit.
 // The unique owner/account index plus these exact bindings protect existing
 // resolutions; the separate absence witness protects future profile links.
 if(observedProfiles.size)add(`NOT EXISTS(SELECT 1 FROM json_each(?) witness WHERE NOT EXISTS(SELECT 1 FROM person_profiles p WHERE p.owner_id=? AND p.id=json_extract(witness.value,'$.id') AND p.revision=json_extract(witness.value,'$.revision') AND p.supervisor_profile_id IS json_extract(witness.value,'$.supervisor_profile_id') AND p.supervisor_account_user_id IS json_extract(witness.value,'$.supervisor_account_user_id') AND p.app_member_user_id IS json_extract(witness.value,'$.app_member_user_id')))`,JSON.stringify([...observedProfiles.values()]),op.ownerId);
 if(unlinkedAccounts.size)add('NOT EXISTS(SELECT 1 FROM person_profiles WHERE owner_id=? AND app_member_user_id IN (SELECT value FROM json_each(?)))',op.ownerId,JSON.stringify([...unlinkedAccounts]));
 return {guards,args};
}
