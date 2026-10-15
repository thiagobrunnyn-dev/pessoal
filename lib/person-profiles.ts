import {all,first,db,bucket} from './maintenance';
import {operatorGuard,recheckOperator,type Operator} from './app-access';
import {SITE_OWNER_ID} from './owner-access';
import {isRegionalRequest,REGIONAL_EMAIL} from './regional-access';
import {BRAZIL_STATES} from './brazil-states';
import {RequestError} from './http-security';
import {sanitizePhoto} from './photo-privacy';
import {clientCatalog} from './client-catalog';
import {personAssignmentInput,personAssignmentGuards,visiblePersonAssignment} from './person-assignment';
import {uppercasePersonText} from './person-text';
import {validateSelectedCity} from './city-catalog';
import {supervisorInput,supervisorOptions,supervisorGuards} from './person-supervisors';

type Row=Record<string,string|number|null>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIRECTORIES=['collaborator','technician','supervisor','guest'];
const SNAPSHOT_FIELDS=['directory','name_pending','display_name','job_title','state_code','city','client_id','cost_center_id','supervisor_profile_id','supervisor_account_user_id','app_member_user_id','current_photo_asset_id','status','revision'] as const;
const PRIVATE_FIELDS=['private_rg','private_cpf','private_contact'] as const;
type PrivateField=typeof PRIVATE_FIELDS[number];
const MAX_PHOTO_SIZE=4*1024*1024;
const ownsAccounts=(op:Operator)=>op.actor.userId===SITE_OWNER_ID;
const snapshot=(row:Row)=>Object.fromEntries(SNAPSHOT_FIELDS.map(key=>[key,row[key]??null]));
const digest=async(value:string|Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value as Uint8Array<ArrayBuffer>))].map(v=>v.toString(16).padStart(2,'0')).join('');

function field(form:FormData,key:string,max:number,required=false){
 const value=form.get(key);
 if(value!==null&&typeof value!=='string')throw new RequestError('Confira os campos do cadastro.');
 const text=(value||'').trim();
 if(text.length>max||required&&!text)throw new RequestError('Confira os campos obrigatórios e o tamanho dos textos.');
 return text;
}

// Missing city keeps old clients compatible; an explicit blank clears it.
function cityInput(form:FormData,original:Row|null){
 if(!form.has('city'))return original?.city??null;
 const values=form.getAll('city');
 if(values.length!==1||typeof values[0]!=='string')throw new RequestError('Confira a cidade do cadastro.');
 const city=values[0].trim();
 if(city.length>120||/[\u0000-\u001f\u007f]/.test(city))throw new RequestError('Informe a cidade em uma linha, com até 120 caracteres.');
 return city||null;
}

// Keep private values out of directory rows and immutable service/audit snapshots.
// Missing fields preserve legacy edits; an explicitly empty field clears its value.
function privatePatch(form:FormData):Partial<Record<PrivateField,string|null>>{
 const patch:Partial<Record<PrivateField,string|null>>={};
 for(const key of PRIVATE_FIELDS){
  if(!form.has(key))continue;
  const values=form.getAll(key);
  if(values.length!==1||typeof values[0]!=='string')throw new RequestError('Confira os campos privados do cadastro.');
  const value=values[0].trim();
  if(key==='private_cpf'){
   const digits=value.replace(/[.\s-]/g,'');
   if(value.length>30||value&&!/^\d{11}$/.test(digits))throw new RequestError('Informe o CPF com 11 dígitos ou deixe o campo vazio.');
   patch[key]=value?digits:null;
  }else{
   if(value.length>30)throw new RequestError(key==='private_rg'?'O RG deve ter até 30 caracteres.':'O contato deve ter até 30 caracteres.');
   patch[key]=value||null;
  }
 }
 return patch;
}

function visibleProfile(row:Row,canLink:boolean){
 return {...visiblePersonAssignment(row),id:row.id,control_number:row.control_number??null,directory:row.directory,name_pending:!!row.name_pending,display_name:row.display_name,job_title:row.job_title,state_code:row.state_code,city:row.city??null,supervisor_profile_id:row.supervisor_profile_id,supervisor_account_user_id:row.supervisor_account_user_id||null,status:row.status,revision:row.revision,photo_asset_id:row.current_photo_asset_id||null,has_account_link:!!row.app_member_user_id,...(canLink?{app_member_user_id:row.app_member_user_id}:{}),created_at:row.created_at,updated_at:row.updated_at};
}

export async function personDirectory(op:Operator,guests=false){
 const canLink=ownsAccounts(op);
 const [rows,supervisors,members,catalog]=await Promise.all([
  all('SELECT p.id,p.control_number,p.directory,p.name_pending,p.display_name,p.job_title,p.state_code,p.city,p.client_id,p.cost_center_id,p.supervisor_profile_id,p.supervisor_account_user_id,p.app_member_user_id,p.current_photo_asset_id,p.status,p.revision,p.created_at,p.updated_at,c.id visible_client_id,c.name visible_client_name,c.entity_type visible_client_type,c.archived_at client_archived_at,cc.id visible_center_id,cc.name visible_center_name,cc.archived_at center_archived_at FROM person_profiles p LEFT JOIN clients c ON c.id=p.client_id AND c.owner_id=p.owner_id LEFT JOIN cost_centers cc ON cc.id=p.cost_center_id AND cc.owner_id=p.owner_id AND cc.client_id=p.client_id WHERE p.owner_id=? AND p.directory '+(guests?'=':'<>')+" 'guest' ORDER BY p.display_name,p.id",op.ownerId),
  all("SELECT id,display_name,state_code,revision FROM person_profiles WHERE owner_id=? AND status='active' AND directory<>'guest' ORDER BY display_name,id",op.ownerId),
  canLink?all("SELECT user_id,display_name,role FROM app_members WHERE status='active' ORDER BY display_name,user_id"):Promise.resolve(null),
  clientCatalog(op.ownerId)
 ]);
 const supervisor_choices=await supervisorOptions(rows);
 await recheckOperator(op);const auth=operatorGuard(op);if(!await first("SELECT 1 allowed WHERE "+auth.sql,...auth.args))throw new RequestError("O acesso mudou. Atualize a lista.",409);
 return {profiles:rows.map(row=>visibleProfile(row,canLink)),catalog,can_initialize_numbers:!guests&&!isRegionalRequest(),supervisors,supervisor_options:supervisor_choices,regional:isRegionalRequest(),can_link_accounts:canLink&&!guests,...(members?{eligible_members:[{user_id:SITE_OWNER_ID,display_name:op.actor.fullName||op.actor.displayName,role:'owner'},...members.filter(row=>row.user_id!==SITE_OWNER_ID)]}:{})};
}

export async function personPrivateDetails(op:Operator,id:string){
 await recheckOperator(op);
 if(!UUID.test(id))throw new RequestError('Pessoa não encontrada.',404);
 // The facade enforces current UF scope; the in-query guard also rejects a revoked
 // operator or changed regional epoch before returning these explicit columns.
 const auth=operatorGuard(op);
 const row=await first(`SELECT id,revision,private_rg,private_cpf,private_contact FROM person_profiles WHERE id=? AND owner_id=? AND ${auth.sql}`,id,op.ownerId,...auth.args);
 await recheckOperator(op);
 if(!row)throw new RequestError('Pessoa não encontrada.',404);
 // Revalidate the target as well as the operator after reading private bytes.
 // A concurrent UF move, edit or epoch change must invalidate this readback.
 const current=await first(`SELECT id FROM person_profiles WHERE id=? AND owner_id=? AND revision=? AND ${auth.sql}`,id,op.ownerId,row.revision,...auth.args);
 if(!current)throw new RequestError('O cadastro ou acesso mudou. Atualize antes de editar.',409);
 return row;
}

async function readPhoto(form:FormData){
 const files=form.getAll('photo').filter(value=>value instanceof File&&value.size>0) as File[];
 if(files.length>1)throw new RequestError('Escolha somente uma foto.');
 if(!files.length)return null;
 const file=files[0];
 if(file.size>MAX_PHOTO_SIZE||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new RequestError('Use uma foto JPG, PNG ou WebP de até 4 MB.');
 let bytes:Uint8Array;
 try{
  bytes=sanitizePhoto(await file.arrayBuffer(),file.type);
  // The shared sanitizer strips metadata; profile pictures additionally reject animated PNG.
  if(file.type==='image/png'){
   const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   for(let offset=8;offset+12<=bytes.length;){
    const size=view.getUint32(offset),name=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    if(['acTL','fcTL','fdAT'].includes(name))throw new Error('Animated photo');
    offset+=size+12;
   }
  }
 }catch{throw new RequestError('Não foi possível preparar a foto sem metadados. Escolha JPG, PNG ou WebP estática.');}
 if(bytes.length>MAX_PHOTO_SIZE)throw new RequestError('A foto preparada ultrapassa 4 MB. Escolha outra.');
 return {bytes,contentType:file.type,size:bytes.length,sha256:await digest(bytes)};
}

export async function savePersonProfile(op:Operator,form:FormData,context?:{guestCreate?:boolean;guard?:{sql:string;args:unknown[]}}){
 await recheckOperator(op);
 if(form.has('control_number'))throw new RequestError('O número de controle é gerado automaticamente e não pode ser editado.');
 const action=field(form,'action',20,true),requestId=field(form,'request_id',60,true),reason=field(form,'reason',1000);
 if(!['create','update','archive','restore'].includes(action)||!UUID.test(requestId)||form.get('confirmed')!=='yes')throw new RequestError('Confirme os dados e atualize o formulário.');
 if(['archive','restore'].includes(action)&&!reason)throw new RequestError('Informe o motivo desta alteração.');
 const creating=action==='create',editing=creating||action==='update';
 const privateValues=editing?privatePatch(form):{};
 if(!editing&&PRIVATE_FIELDS.some(key=>form.has(key)))throw new RequestError('Altere os dados privados pela edição do cadastro.');
 const suppliedId=creating?null:field(form,'id',80,true);
 if(suppliedId&&!UUID.test(suppliedId))throw new RequestError('Pessoa não encontrada.',404);
 const expected=creating?0:Number(field(form,'expected_revision',20,true));
 if(!Number.isSafeInteger(expected)||expected<0)throw new RequestError('Revisão inválida. Atualize o cadastro.',409);
 // Read the target through the scoped facade BEFORE looking up an idempotency event.
 const original=creating?null:await first('SELECT * FROM person_profiles WHERE id=? AND owner_id=?',suppliedId,op.ownerId);
 if(!creating&&!original)throw new RequestError('Pessoa não encontrada.',404);
 const regional=isRegionalRequest(),canLink=ownsAccounts(op);
 if(regional&&original?.state_code!=='PA'&&!creating)throw new RequestError('Pessoa não encontrada.',404);
 if(!editing&&form.getAll('photo').some(value=>value instanceof File&&value.size>0))throw new RequestError('Altere a foto pela edição do cadastro.');
 const photo=editing?await readPhoto(form):null;
 const assignment=personAssignmentInput(form,original);
 if(assignment.supplied&&!editing)throw new RequestError('Altere a empresa pela edição do cadastro.');

 let next:Row;
 if(editing){
  const directory=field(form,'directory',20,true),displayName=field(form,'display_name',120,true),jobTitle=field(form,'job_title',120),stateInput=field(form,'state_code',2).toUpperCase();
  if(!DIRECTORIES.includes(directory))throw new RequestError('Escolha o diretório da pessoa.');
  if(creating&&directory==='guest'&&!context?.guestCreate)throw new RequestError('Cadastre o hóspede pelo quarto do imóvel.',400);
  if(!creating&&(original?.directory==='guest'||directory==='guest')&&directory!==original?.directory)throw new RequestError('Preserve a identificação de hóspede deste cadastro.');
  if(directory==='guest'&&!regional&&!stateInput)throw new RequestError('Informe a UF do hóspede.');
  if(directory==='guest'&&(form.get('app_member_user_id')||form.get('supervisor_ref')))throw new RequestError('O cadastro de hóspedes não concede vínculos de acesso ou de execução.');
  if(stateInput&&!Object.hasOwn(BRAZIL_STATES,stateInput))throw new RequestError('Selecione uma UF válida.');
  if(regional&&stateInput&&stateInput!=='PA')throw new RequestError('Este acesso mantém os cadastros no Pará.',403);
  const supervisor=supervisorInput(form,original);
  let accountId=original?.app_member_user_id||null;
  if(form.has('app_member_user_id')){
   const proposed=field(form,'app_member_user_id',200)||null;
   if(!canLink&&proposed!==accountId)throw new RequestError('Somente o sócio-administrador pode alterar o vínculo com uma conta.',403);
   if(canLink)accountId=proposed;
  }
  if(form.has('name_pending')&&!['yes','no'].includes(String(form.get('name_pending'))))throw new RequestError('Confira a indicação do nome.');
  next={directory,name_pending:form.has('name_pending')?(form.get('name_pending')==='yes'?1:0):original?.name_pending||0,display_name:displayName,job_title:jobTitle,state_code:regional?'PA':stateInput||null,city:cityInput(form,original),client_id:assignment.client_id,cost_center_id:assignment.cost_center_id,...supervisor,app_member_user_id:accountId,current_photo_asset_id:original?.current_photo_asset_id||null,status:original?.status||'active',revision:creating?0:expected+1};
  validateSelectedCity(form,String(next.state_code||''),next.city);
 }else next={...snapshot(original!),status:action==='archive'?'archived':'active',revision:expected+1};
 // Only fingerprint new supervisor/private input when present, preserving legacy request fingerprints.
 const fingerprint=await digest(JSON.stringify({action,id:suppliedId,expected_revision:expected,reason,actor:op.actor.userId,...(editing?{directory:next.directory,display_name:next.display_name,job_title:next.job_title,state_code:next.state_code,supervisor_profile_id:next.supervisor_profile_id,app_member_user_id:next.app_member_user_id,photo:photo?{sha256:photo.sha256,type:photo.contentType}:null}:{} ),...(editing&&form.has('city')?{city:next.city}:{}),...(editing&&assignment.supplied?{client_id:next.client_id,cost_center_id:next.cost_center_id}:{}),...(editing&&form.has('name_pending')?{name_pending:form.get('name_pending')}:{}),...(editing&&form.has('supervisor_ref')?{supervisor_ref:form.get('supervisor_ref')}:{}),...(editing&&next.supervisor_account_user_id?{supervisor_account_user_id:next.supervisor_account_user_id}:{}),...(Object.keys(privateValues).length?{private_fields:privateValues}:{})}));
 async function replay(){
  const prior=await first('SELECT profile_id,request_fingerprint,after_snapshot FROM person_profile_events WHERE owner_id=? AND request_id=?',op.ownerId,requestId);
  if(!prior)return null;
  if(prior.request_fingerprint!==fingerprint)throw new RequestError('Este formulário já foi usado com outros dados. Abra uma nova edição.',409);
  const target=await first('SELECT id FROM person_profiles WHERE owner_id=? AND id=?',op.ownerId,prior.profile_id);
  if(!target)throw new RequestError('Pessoa não encontrada.',404);
  return {id:prior.profile_id,revision:JSON.parse(prior.after_snapshot).revision,alreadySaved:true};
 }
 const prior=await replay();if(prior)return prior;
 // Fingerprint/replay uses the submitted text, so requests saved before this
 // presentation change still replay without rewriting their original snapshots.
 if(editing&&!context?.guestCreate){
  for(const key of ['display_name','job_title',...(creating||form.has('city')?['city']:[])]){
   if(typeof next[key]==='string'){
    const value=uppercasePersonText(String(next[key]));
    if(value.length>120)throw new RequestError('Confira os textos: o limite é de 120 caracteres após a padronização em maiúsculas.');
    next[key]=value;
   }
  }
 }
 const auditReason=context?.guestCreate?reason:uppercasePersonText(reason);
 if(auditReason.length>1000)throw new RequestError('Reduza o motivo para até 1.000 caracteres.');
 if(original&&original.revision!==expected)throw new RequestError('Este cadastro mudou em outra sessão. Atualize antes de salvar.',409);
 if(action==='archive'&&original!.status==='archived'||action==='restore'&&original!.status==='active')return {id:original!.id,revision:original!.revision,unchanged:true};
 const id=suppliedId||crypto.randomUUID(),guards:string[]=context?.guard?[context.guard.sql]:[],guardArgs:unknown[]=context?.guard?[...context.guard.args]:[];
 if(creating&&next.directory==='guest'&&!context?.guard){
  const existing=await all("SELECT id,display_name,revision FROM person_profiles WHERE owner_id=? AND state_code=? AND status='active'",op.ownerId,next.state_code);
  const normalized=(v:string)=>v.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleUpperCase('pt-BR');
  if(existing.some(row=>normalized(String(row.display_name))===normalized(String(next.display_name))))throw new RequestError('Já existe uma pessoa com esse nome nesta UF. Use o cadastro existente na hospedagem ou confira o nome antes de criar outro.',409);
  guards.push("(SELECT count(*) FROM person_profiles WHERE owner_id=? AND state_code=? AND status='active')=? AND NOT EXISTS(SELECT 1 FROM person_profiles p WHERE p.owner_id=? AND p.state_code=? AND p.status='active' AND NOT EXISTS(SELECT 1 FROM json_each(?) w WHERE json_extract(w.value,'$.id')=p.id AND json_extract(w.value,'$.revision')=p.revision))");
  guardArgs.push(op.ownerId,next.state_code,existing.length,op.ownerId,next.state_code,JSON.stringify(existing.map(p=>({id:p.id,revision:p.revision}))));
 }
 const assignmentGuards=await personAssignmentGuards(op,next,original,editing&&assignment.supplied);
 guards.push(...assignmentGuards.guards);guardArgs.push(...assignmentGuards.args);
 const relationshipGuards=await supervisorGuards(op,id,next,action==='archive');
 guards.push(...relationshipGuards.guards);guardArgs.push(...relationshipGuards.args);
 const accountChanged=next.app_member_user_id!==(original?.app_member_user_id||null);
 if(accountChanged&&next.app_member_user_id){
  if(!canLink)throw new RequestError('Somente o sócio-administrador pode vincular uma conta.',403);
  if(next.app_member_user_id!==SITE_OWNER_ID){
   const member=await first("SELECT user_id,email,role,revision FROM app_members WHERE user_id=? AND status='active'",next.app_member_user_id);
   if(!member)throw new RequestError('Selecione o ID exato de uma conta ativa.');
   guards.push("EXISTS(SELECT 1 FROM app_members WHERE user_id=? AND revision=? AND email=? AND role=? AND status='active')");guardArgs.push(member.user_id,member.revision,member.email,member.role);
   if(member.email===REGIONAL_EMAIL&&member.role==='maintenance_lead'){
    // A later account binding must not circumvent the supervisor's PA limit.
    // Only IDs are inspected here; this path already requires the exact owner.
    if(await db().prepare("SELECT id FROM person_profiles WHERE owner_id=? AND supervisor_profile_id=? AND status='active' AND state_code IS NOT 'PA' LIMIT 1").bind(op.ownerId,id).first())throw new RequestError('Reatribua as pessoas fora do Pará antes de vincular esta conta regional.',409);
    guards.push("NOT EXISTS(SELECT 1 FROM person_profiles WHERE owner_id=? AND supervisor_profile_id=? AND status='active' AND state_code IS NOT 'PA')");guardArgs.push(op.ownerId,id);
   }
  }
  if(await first('SELECT id FROM person_profiles WHERE owner_id=? AND app_member_user_id=? AND id<>?',op.ownerId,next.app_member_user_id,id))throw new RequestError('Esta conta já está vinculada a outro perfil.',409);
  guards.push('NOT EXISTS(SELECT 1 FROM person_profiles WHERE owner_id=? AND app_member_user_id=? AND id<>?)');guardArgs.push(op.ownerId,next.app_member_user_id,id);
 }
 if(original&&next.status==='archived'){
  if(await first("SELECT id FROM person_profiles WHERE owner_id=? AND supervisor_profile_id=? AND status='active' LIMIT 1",op.ownerId,id))throw new RequestError('Reatribua as pessoas ativas vinculadas a este responsável antes de arquivá-lo.',409);
  guards.push("NOT EXISTS(SELECT 1 FROM person_profiles WHERE owner_id=? AND supervisor_profile_id=? AND status='active')");guardArgs.push(op.ownerId,id);
 }
 const privateChanged=PRIVATE_FIELDS.filter(key=>Object.hasOwn(privateValues,key)&&privateValues[key]!==(original?.[key]??null));
 if(original&&!photo&&!privateChanged.length&&JSON.stringify(snapshot(original))===JSON.stringify({...next,revision:original.revision}))return {id,revision:original.revision,unchanged:true};
 const now=new Date().toISOString(),eventId=crypto.randomUUID(),assetId=photo?crypto.randomUUID():null;
 if(assetId)next.current_photo_asset_id=assetId;
 const objectKey=assetId?`people/${op.ownerId}/${id}/${assetId}`:null;
 const auth=operatorGuard(op);
 const guard=auth.sql+(guards.length?' AND '+guards.join(' AND '):'')+' AND NOT EXISTS(SELECT 1 FROM person_profile_events WHERE request_id=?)';
 const args=[...auth.args,...guardArgs,requestId];
 const columns:string[]=[...SNAPSHOT_FIELDS.filter(key=>key!=='revision'),...PRIVATE_FIELDS.filter(key=>Object.hasOwn(privateValues,key))];
 const persisted:Row={...next,...privateValues};
 const mutation=creating?
  db().prepare(`INSERT INTO person_profiles (id,owner_id,${columns.join(',')},revision,last_event_id,created_by_user_id,created_at,updated_by_user_id,updated_at) SELECT ?,?,${columns.map(()=>'?').join(',')},0,?,?,?,?,? WHERE ${guard}`).bind(id,op.ownerId,...columns.map(key=>persisted[key]),eventId,op.actor.userId,now,op.actor.userId,now,...args):
  db().prepare(`UPDATE person_profiles SET ${columns.map(key=>key+'=?').join(',')},revision=revision+1,last_event_id=?,updated_by_user_id=?,updated_at=? WHERE id=? AND owner_id=? AND revision=?${regional?" AND state_code='PA'":''} AND ${guard}`).bind(...columns.map(key=>persisted[key]),eventId,op.actor.userId,now,id,op.ownerId,expected,...args);
 const insertedGuard='EXISTS(SELECT 1 FROM person_profiles WHERE id=? AND owner_id=? AND last_event_id=?)';
 const statements=[mutation];
 if(photo)statements.push(db().prepare(`INSERT INTO person_photo_assets (id,owner_id,profile_id,object_key,content_type,size,sha256,created_at,uploaded_by_user_id) SELECT ?,?,?,?,?,?,?,?,? WHERE ${insertedGuard}`).bind(assetId,op.ownerId,id,objectKey,photo.contentType,photo.size,photo.sha256,now,op.actor.userId,id,op.ownerId,eventId));
 const auditAfter={...next,...(privateChanged.length?{private_fields_changed:privateChanged}:{})};
 statements.push(db().prepare(`INSERT INTO person_profile_events (id,owner_id,profile_id,before_snapshot,after_snapshot,reason,actor_user_id,actor_name,request_id,request_fingerprint,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${insertedGuard}`).bind(eventId,op.ownerId,id,JSON.stringify(original?snapshot(original):null),JSON.stringify(auditAfter),auditReason||(creating?(context?.guestCreate?'Cadastro inicial':'CADASTRO INICIAL'):''),op.actor.userId,op.actor.fullName||op.actor.displayName,requestId,fingerprint,now,id,op.ownerId,eventId));
 let uploaded=false;
 try{
  if(photo){await bucket().put(objectKey!,photo.bytes,{httpMetadata:{contentType:photo.contentType,cacheControl:'private, no-store'}});uploaded=true;}
  const result=await db().batch(statements);
  if(result[0].meta.changes<1){await recheckOperator(op);const repeated=await replay();if(repeated)return repeated;throw new RequestError('O cadastro, encarregado ou acesso mudou. Atualize antes de salvar.',409);}
  uploaded=false;
  return {id,revision:next.revision};
 }catch(error){
  if(String(error).includes('UNIQUE constraint failed')&&String(error).includes('person_profiles'))throw new RequestError('A conta já está vinculada a outro perfil. Atualize antes de salvar.',409);
  throw error;
 }finally{
  // An uncertain database response must never delete an asset that actually committed.
  // This bounded existence check returns no data and only concerns our newly generated asset.
  if(uploaded)try{
   const committed=await db().prepare('SELECT 1 present FROM person_photo_assets WHERE id=? AND owner_id=? AND profile_id=?').bind(assetId,op.ownerId,id).first();
   if(!committed)await bucket().delete(objectKey!);
  }catch{console.error('Person photo temporary cleanup deferred');}
 }
}
