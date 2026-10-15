import {furnitureDetails,furnitureDetailsFromForm,preserveFurnitureDetails,furnitureApplies} from './furniture-details';
import type {Operator} from './app-access';
import {boundedForm,requireSameOrigin,RequestError} from './http-security';
import {sanitizePhoto} from './photo-privacy';
import {assertStaticPhoto,formText,readMobilizationInput,readFurnitureStructure,preserveFurnitureIdentity,ready,sha256,snapshotOf,MAX_MOBILIZATION_PHOTOS,type MobilizationEquipment,type MobilizationInput,type MobilizationRow,type MobilizationSnapshot} from './mobilizations';

type Guard={sql:string;args:unknown[]};
type Property={id:string;name:string;address:string;revision:number;state_code:string|null;worksite_id:string|null;archived_at:string|null};
type Client={id:string;name:string;revision:number;archived_at:string|null};
type Center=Client&{client_id:string};
type Handover={id:string;property_id:string;client_id:string;cost_center_id:string;revision:number;delivered_on:string;returned_on:string|null;slots:number;level:string};
type Event={id:string;mobilization_id:string;request_fingerprint:string;after_snapshot:string};
type PhotoRow={id:string;event_id:string;position:number;uploaded_at:string;equipment_item_id:string|null;equipment_item_snapshot:string|null};
type ItemPhotoSnapshot={id:string;label:string;environment_id:string|null;environment_label:string|null;planned:number|null;checked:number|null;condition?:string;version:number};
export type MobilizationDependencies={
 getOperator:()=>Promise<Operator|null>;recheckOperator:(op:Operator)=>Promise<void>;operatorGuard:(op:Operator)=>Guard;
 first:<T>(sql:string,...args:unknown[])=>Promise<T|null>;all:<T>(sql:string,...args:unknown[])=>Promise<T[]>;
 db:()=>D1Database;bucket:()=>R2Bucket;isRegionalRequest:()=>boolean;forbidRegionalMove:(original:string,next:string)=>void;
 clientCatalog:(ownerId:string)=>Promise<unknown>;noCache:Record<string,string>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const snapshotColumns=['property_id','client_id','cost_center_id','property_name','address','client_name','cost_center_name','state_code','worksite_id','housing_type','building_type','environments','responsible','due_on','planned_slots','stage','equipment','checklist','notes','pending_count','equipment_shortfall_count','equipment_unknown_count','handover_id','handover_snapshot','version'] as const;
const values=(s:MobilizationSnapshot)=>snapshotColumns.map(key=>['environments','equipment','checklist'].includes(key)?JSON.stringify(s[key]):key==='handover_snapshot'?(s[key]?JSON.stringify(s[key]):null):s[key]);
const matches=(s:Pick<MobilizationSnapshot,'property_id'|'client_id'|'cost_center_id'>,h:Handover|null)=>!!h&&h.property_id===s.property_id&&h.client_id===s.client_id&&h.cost_center_id===s.cost_center_id;
const handoverColumns='id,property_id,client_id,cost_center_id,revision,delivered_on,returned_on,slots,level';
const unavailable='O registro ou os cadastros foram atualizados. Recarregue antes de salvar.';
const photoColumns='id,event_id,position,uploaded_at,equipment_item_id,equipment_item_snapshot';
const itemValue=(item:MobilizationEquipment)=>({id:item.id,label:item.label,environment_id:item.environment_id,planned:item.planned,checked:item.checked,note:item.note,...furnitureDetails(item)});
function itemPhotoSnapshot(item:MobilizationEquipment,after:MobilizationSnapshot):ItemPhotoSnapshot{return {id:item.id,label:item.label,environment_id:item.environment_id,environment_label:after.environments.find(e=>e.id===item.environment_id)?.label??null,planned:item.planned,checked:item.checked,...furnitureDetails(item),version:after.version};}
function photoValue(photo:PhotoRow){
 const raw=photo.equipment_item_snapshot?JSON.parse(photo.equipment_item_snapshot) as ItemPhotoSnapshot:null;
 // Return an explicit DTO, never storage keys, ownership or arbitrary snapshot fields.
 return {id:photo.id,event_id:photo.event_id,position:photo.position,uploaded_at:photo.uploaded_at,equipment_item_id:photo.equipment_item_id,equipment_item_snapshot:raw?{id:raw.id,label:raw.label,environment_id:raw.environment_id,environment_label:raw.environment_label,planned:raw.planned,checked:raw.checked,...furnitureDetails(raw),version:raw.version}:null};
}
function queryId(query:URLSearchParams,key:string,required=true){const value=query.get(key)?.trim()??'';if(value.length>80||required&&!value||query.getAll(key).length>1)throw new RequestError('Confira o campo '+key+'.');return value;}
function itemQuantity(form:FormData,key:string){const value=formText(form,key,16);if(!value)return null;const number=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(number)||number<0)throw new RequestError('A quantidade deve ser um número inteiro não negativo, ou ficar em branco quando não informada.');return number;}
function photoEquipmentIds(form:FormData,count:number,action:string):Array<string|null>|undefined{
 if(!form.has('photo_equipment_ids'))return undefined;
 if(!['create','update'].includes(action))throw new RequestError('A associação das fotos não é permitida nesta ação.');
 if(form.getAll('photo_equipment_ids').length!==1)throw new RequestError('Confira a associação das fotos.');
 let value:unknown;try{value=JSON.parse(formText(form,'photo_equipment_ids',1000,true));}catch{throw new RequestError('Confira a associação das fotos.');}
 if(!Array.isArray(value)||value.length!==count||value.some(id=>id!==null&&(typeof id!=='string'||!id||id.length>80||!/^[a-zA-Z0-9_-]+$/.test(id))))throw new RequestError('Selecione um item ou foto geral para cada imagem.');
 return value as Array<string|null>;
}

export function createMobilizationApi(d:MobilizationDependencies){
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:d.noCache});
 const deny=()=>reply({error:'Acesso restrito à gestão autorizada.'},401);
 async function assertReadScope(op:Operator){await d.recheckOperator(op);const guard=d.operatorGuard(op);if(!await d.first('SELECT 1 allowed WHERE '+guard.sql,...guard.args))throw new RequestError('O acesso ou o escopo mudou durante a consulta. Atualize a página.',409);}
 const row=(id:string,owner:string)=>d.first<MobilizationRow>('SELECT * FROM mobilizations WHERE id=? AND owner_id=?',id,owner);
 const handover=(id:string|null,owner:string)=>id?d.first<Handover>('SELECT '+handoverColumns+' FROM housing_handovers WHERE id=? AND owner_id=?',id,owner):Promise.resolve(null);
 function project<T extends {handover_id:string|null;property_id:string;client_id:string;cost_center_id:string;stage:string}>(s:T,h:Handover|null){
  const linked=!!s.handover_id&&h?.id===s.handover_id&&matches(s,h);return {...s,handover_id:linked?s.handover_id:null,...('handover_snapshot' in s?{handover_snapshot:linked?s.handover_snapshot:null}:{}),handover_link_status:s.handover_id?(linked?'linked':'needs_review'):'none',status:linked?'delivered':s.stage};
 }
 async function saved(event:Event,op:Operator,protectFurnitureScope=false){
  const current=await row(event.mobilization_id,op.ownerId);if(!current)throw new RequestError('Mobilização não encontrada.',404);
  if(protectFurnitureScope){const p=await d.first<Property>('SELECT id,state_code,worksite_id FROM properties WHERE id=? AND owner_id=?',current.property_id,op.ownerId);if(!p||p.state_code!==current.state_code||p.worksite_id!==current.worksite_id)throw new RequestError('A UF ou a obra do imóvel mudou. Recarregue a ficha.',409);}
  const s=JSON.parse(event.after_snapshot) as MobilizationSnapshot,p=project(s,await handover(s.handover_id,op.ownerId));
  await assertReadScope(op);
  return reply({id:current.id,event_id:event.id,version:s.version,stage:s.stage,status:p.status,alreadySaved:true});
 }
 async function prior(requestId:string,owner:string){return d.first<Event>('SELECT id,mobilization_id,request_fingerprint,after_snapshot FROM mobilization_events WHERE request_id=? AND owner_id=?',requestId,owner);}
 async function scope(input:MobilizationInput,op:Operator,original:MobilizationRow|null,refresh:boolean):Promise<{data:Omit<MobilizationSnapshot,keyof MobilizationInput|'handover_id'|'handover_snapshot'|'version'>;guard:Guard}>{
  if(original){d.forbidRegionalMove(original.property_id,input.property_id);if(d.isRegionalRequest()&&(original.client_id!==input.client_id||original.cost_center_id!==input.cost_center_id))throw new RequestError('A alteração de cliente e obra deve ser feita pela gestão geral.',403);}
  const [property,client,center,source]=await Promise.all([
   d.first<Property>('SELECT id,name,address,revision,state_code,worksite_id,archived_at FROM properties WHERE id=? AND owner_id=?',input.property_id,op.ownerId),
   d.first<Client>('SELECT id,name,revision,archived_at FROM clients WHERE id=? AND owner_id=?',input.client_id,op.ownerId),
   d.first<Center>('SELECT id,name,client_id,revision,archived_at FROM cost_centers WHERE id=? AND owner_id=?',input.cost_center_id,op.ownerId),
   original&&original.property_id!==input.property_id?d.first<Property>('SELECT id,name,address,revision,state_code,worksite_id,archived_at FROM properties WHERE id=? AND owner_id=?',original.property_id,op.ownerId):Promise.resolve(null),
  ]);
  const sameProperty=original?.property_id===input.property_id,sameClient=original?.client_id===input.client_id,sameCenter=original?.cost_center_id===input.cost_center_id;
  if(!property||!client||!center||center.client_id!==client.id||!sameProperty&&property.archived_at||!sameClient&&client.archived_at||!sameCenter&&center.archived_at||original&&!sameProperty&&!source)throw new RequestError('Confira o imóvel, o cliente e o centro de custo ativo correspondente.');
  let sql=' AND EXISTS(SELECT 1 FROM properties WHERE id=? AND owner_id=? AND revision=?'+(!sameProperty?' AND archived_at IS NULL':'')+') AND EXISTS(SELECT 1 FROM clients WHERE id=? AND owner_id=? AND revision=?'+(!sameClient?' AND archived_at IS NULL':'')+') AND EXISTS(SELECT 1 FROM cost_centers WHERE id=? AND owner_id=? AND revision=? AND client_id=?'+(!sameCenter?' AND archived_at IS NULL':'')+')';
  const args:unknown[]=[property.id,op.ownerId,property.revision,client.id,op.ownerId,client.revision,center.id,op.ownerId,center.revision,client.id];
  if(source){sql+=' AND EXISTS(SELECT 1 FROM properties WHERE id=? AND owner_id=? AND revision=?)';args.push(source.id,op.ownerId,source.revision);}
  return {data:{property_name:original&&sameProperty&&!refresh?original.property_name:property.name,address:original&&sameProperty&&!refresh?original.address:property.address,client_name:original&&sameClient&&!refresh?original.client_name:client.name,cost_center_name:original&&sameCenter&&!refresh?original.cost_center_name:center.name,state_code:property.state_code,worksite_id:property.worksite_id},guard:{sql,args}};
 }
 async function GET(request:Request){try{
  const op=await d.getOperator();if(!op)return deny();const id=new URL(request.url).searchParams.get('id');
  if(id){
   const current=await row(id,op.ownerId);if(!current)return reply({error:'Mobilização não encontrada.'},404);
   const [events,photos,linked]=await Promise.all([
    d.all<{id:string;action:string;before_snapshot:string;after_snapshot:string;note:string;actor_name:string;photo_count:number;created_at:string}>('SELECT id,action,before_snapshot,after_snapshot,note,actor_name,photo_count,created_at FROM mobilization_events WHERE mobilization_id=? AND owner_id=? ORDER BY created_at DESC,rowid DESC',id,op.ownerId),
    d.all<PhotoRow>('SELECT '+photoColumns+' FROM mobilization_photos WHERE mobilization_id=? AND owner_id=? ORDER BY uploaded_at,position,id',id,op.ownerId),handover(current.handover_id,op.ownerId),
   ]);
   let eligibleHandovers:Pick<Handover,'id'|'delivered_on'|'returned_on'|'slots'|'level'>[]=[];
   if(!current.handover_id&&current.stage==='ready'){
    const candidates=await d.all<Handover>('SELECT '+handoverColumns+' FROM housing_handovers WHERE owner_id=? AND property_id=? AND client_id=? AND cost_center_id=? ORDER BY delivered_on DESC,id LIMIT 100',op.ownerId,current.property_id,current.client_id,current.cost_center_id);
    if(candidates.length){
     // Only probe occupancy of IDs already obtained through the regional facade. No foreign record is returned.
     const occupied=await d.db().prepare('SELECT handover_id FROM mobilizations WHERE owner_id=? AND handover_id IN('+candidates.map(()=>'?').join(',')+')').bind(op.ownerId,...candidates.map(h=>h.id)).all<{handover_id:string}>();
     const used=new Set(occupied.results.map(h=>h.handover_id));eligibleHandovers=candidates.filter(h=>!used.has(h.id)).map(({id,delivered_on,returned_on,slots,level})=>({id,delivered_on,returned_on,slots,level}));
    }
   }
   await assertReadScope(op);return reply({mobilization:{id:current.id,...project(snapshotOf(current),linked),created_at:current.created_at,updated_at:current.updated_at},events:events.map(e=>{const before=JSON.parse(e.before_snapshot) as MobilizationSnapshot|null,after=JSON.parse(e.after_snapshot) as MobilizationSnapshot;return {...e,before_snapshot:before?project(before,linked):null,after_snapshot:project(after,linked)};}),photos:photos.map(photoValue),eligibleHandovers});
  }
  type ListRow=Pick<MobilizationRow,'id'|'property_id'|'client_id'|'cost_center_id'|'property_name'|'address'|'client_name'|'cost_center_name'|'state_code'|'housing_type'|'building_type'|'responsible'|'due_on'|'planned_slots'|'stage'|'pending_count'|'equipment_shortfall_count'|'equipment_unknown_count'|'handover_id'|'version'|'updated_at'>&{linked_id:string|null};
  const [rows,properties,catalog]=await Promise.all([
   d.all<ListRow>('SELECT m.id,m.property_id,m.client_id,m.cost_center_id,m.property_name,m.address,m.client_name,m.cost_center_name,m.state_code,m.housing_type,m.building_type,m.responsible,m.due_on,m.planned_slots,m.stage,m.pending_count,m.equipment_shortfall_count,m.equipment_unknown_count,m.handover_id,m.version,m.updated_at,h.id linked_id FROM mobilizations m LEFT JOIN housing_handovers h ON h.id=m.handover_id AND h.owner_id=m.owner_id AND h.property_id=m.property_id AND h.client_id=m.client_id AND h.cost_center_id=m.cost_center_id WHERE m.owner_id=? ORDER BY m.updated_at DESC,m.id LIMIT 501',op.ownerId),
   d.all('SELECT id,name,address,control_number,state_code FROM properties WHERE owner_id=? AND archived_at IS NULL ORDER BY name,id',op.ownerId),d.clientCatalog(op.ownerId),
  ]);
  await assertReadScope(op);return reply({mobilizations:rows.slice(0,500).map(({linked_id,...m})=>({...m,handover_id:linked_id,handover_link_status:m.handover_id?(linked_id?'linked':'needs_review'):'none',status:linked_id?'delivered':m.stage})),properties,...catalog as object,truncated:rows.length>500});
 }catch(e){if(e instanceof RequestError)return reply({error:e.message},e.status);return reply({error:'Não foi possível carregar as mobilizações.'},503);}}

 async function PROPERTY_FURNITURE(request:Request){try{
  const op=await d.getOperator();if(!op)return deny();const query=new URL(request.url).searchParams,propertyId=queryId(query,'property_id'),requestedId=queryId(query,'mobilization_id',false);
  const property=await d.first<Property>('SELECT id,name,state_code,worksite_id FROM properties WHERE id=? AND owner_id=?',propertyId,op.ownerId);
  if(!property)throw new RequestError('Imóvel não encontrado.',404);
  type Source=Pick<MobilizationRow,'id'|'client_name'|'cost_center_name'|'stage'|'version'|'created_at'|'updated_at'>;
  const sources=await d.all<Source>('SELECT id,client_name,cost_center_name,stage,version,created_at,updated_at FROM mobilizations WHERE property_id=? AND owner_id=? ORDER BY created_at DESC,id',propertyId,op.ownerId);
  const selected=requestedId||(sources.length===1?sources[0].id:null);
  if(requestedId&&!sources.some(s=>s.id===requestedId))throw new RequestError('Mobilização não encontrada neste imóvel.',404);
  let furniture=null;
  if(selected){
   const current=await row(selected,op.ownerId);if(!current||current.property_id!==propertyId)throw new RequestError('Mobilização não encontrada neste imóvel.',404);
   const snapshot=snapshotOf(current),counts=await d.all<{equipment_item_id:string;photo_count:number}>('SELECT equipment_item_id,count(*) photo_count FROM mobilization_photos WHERE mobilization_id=? AND owner_id=? AND equipment_item_id IS NOT NULL GROUP BY equipment_item_id',selected,op.ownerId),byItem=new Map(counts.map(c=>[c.equipment_item_id,c.photo_count]));
   furniture={source_kind:'mobilization',handover_id:current.handover_id,can_resume_preparation:!current.handover_id&&['inspection','ready'].includes(current.stage),can_edit:current.state_code===property.state_code&&current.worksite_id===property.worksite_id,id:current.id,property_id:propertyId,property_name:current.property_name,client_name:current.client_name,cost_center_name:current.cost_center_name,building_type:current.building_type,stage:current.stage,version:current.version,environments:snapshot.environments.map(e=>({id:e.id,label:e.label,kind:e.kind,level:e.level,layout:e.layout,single_beds:e.single_beds})),equipment:snapshot.equipment.map(item=>({...itemValue(item),photo_count:byItem.get(item.id)??0}))};
  }
  await assertReadScope(op);return reply({property_id:propertyId,source_kind:furniture?'mobilization':null,sources,selected_mobilization_id:selected,furniture});
 }catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível carregar a mobília deste imóvel.'},e instanceof RequestError?e.status:503);}}

 async function ITEM_PHOTOS(request:Request){try{
  const op=await d.getOperator();if(!op)return deny();const query=new URL(request.url).searchParams,propertyId=queryId(query,'property_id'),id=queryId(query,'mobilization_id'),itemId=queryId(query,'item_id');
  if(!await d.first('SELECT id FROM properties WHERE id=? AND owner_id=?',propertyId,op.ownerId))throw new RequestError('Imóvel não encontrado.',404);
  const current=await row(id,op.ownerId);if(!current||current.property_id!==propertyId||!snapshotOf(current).equipment.some(item=>item.id===itemId))throw new RequestError('Item de mobília não encontrado neste imóvel.',404);
  const photos=await d.all<PhotoRow>('SELECT '+photoColumns+' FROM mobilization_photos WHERE mobilization_id=? AND owner_id=? AND equipment_item_id=? ORDER BY uploaded_at DESC,position,id',id,op.ownerId,itemId);
  await assertReadScope(op);return reply({property_id:propertyId,mobilization_id:id,item_id:itemId,photos:photos.map(photoValue)});
 }catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível carregar as fotos deste item.'},e instanceof RequestError?e.status:503);}}

 async function POST(request:Request){
  const uploaded:string[]=[];let attemptedBatch=false,batchReturned=false;
  try{
   const op=await d.getOperator();if(!op)return deny();requireSameOrigin(request);const form=await boundedForm(request,13*1024*1024);await d.recheckOperator(op);
   const action=formText(form,'action',20,true),requestId=formText(form,'request_id',60,true),note=formText(form,'note',4000)||(action==='item_update'?'Atualização do item de mobília':action==='structure_update'?'Atualização dos ambientes e da mobília':''),now=new Date().toISOString();
   if(!['create','update','link_handover','item_update','structure_update'].includes(action)||!uuid.test(requestId))throw new RequestError('Atualize o formulário e tente novamente.');if(form.get('confirmed')!=='yes')throw new RequestError('Confirme os dados da mobilização.');
   if(action==='item_update'){
    const allowed=new Set(['action','request_id','note','confirmed','id','expected_version','property_id','item_id','condition','specification','applicability','planned','checked','item_note','photos']);
    for(const key of form.keys())if(!allowed.has(key)||key!=='photos'&&form.getAll(key).length!==1)throw new RequestError('Envie somente os dados deste item de mobília.');
   }
   if(action==='structure_update'){
    const allowed=new Set(['action','request_id','note','confirmed','id','expected_version','property_id','environments','equipment','resume_preparation']);
    for(const key of form.keys())if(!allowed.has(key)||form.getAll(key).length!==1)throw new RequestError('Envie somente os ambientes e itens de mobília.');
    if(form.has('resume_preparation')&&form.get('resume_preparation')!=='yes')throw new RequestError('Confira a confirmação para retomar a preparação.');
   }
   if(action!=='create'&&!note)throw new RequestError('Informe o motivo da atualização para preservar o histórico.');
   const id=action==='create'?crypto.randomUUID():formText(form,'id',80,true),rawVersion=action==='create'?'':formText(form,'expected_version',16,true),expected=action==='create'?0:Number(rawVersion);
   if(action!=='create'&&(!/^\d+$/.test(rawVersion)||!Number.isSafeInteger(expected)||expected<1))throw new RequestError('Versão inválida. Recarregue a mobilização.',409);
   const input=['link_handover','item_update','structure_update'].includes(action)?null:readMobilizationInput(form,action==='update'),handoverId=action==='link_handover'?formText(form,'handover_id',80,true):null,refresh=form.get('refresh_snapshot')==='yes';
   const itemInput=action==='item_update'?{property_id:formText(form,'property_id',80,true),item_id:formText(form,'item_id',80,true),...furnitureDetailsFromForm(form),...(form.has('planned')?{planned:itemQuantity(form,'planned')}:{}),...(form.has('checked')?{checked:itemQuantity(form,'checked')}:{}),...(form.has('item_note')?{item_note:formText(form,'item_note',2000)}:{})}:null;
   const structureInput=action==='structure_update'?{property_id:formText(form,'property_id',80,true),...readFurnitureStructure(form),resume_preparation:form.get('resume_preparation')==='yes'}:null;
   if(action==='link_handover'&&form.get('link_confirmed')!=='yes')throw new RequestError('Confirme o vínculo com este ciclo de entrega já registrado.');
   const entries=form.getAll('photos');if(entries.some(v=>typeof v==='string'&&v!==''))throw new RequestError('Foto inválida.');const files=entries.filter((v):v is File=>v instanceof File&&v.size>0);
   if(files.length>MAX_MOBILIZATION_PHOTOS||files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>4*1024*1024))throw new RequestError('Limite técnico: até 3 fotos JPG, PNG ou WebP estáticas, de até 4 MB cada, por atualização.');
   if(action==='item_update'&&files.length>1)throw new RequestError('Anexe uma foto estática de até 4 MB por atualização do item.');
   if(action==='item_update'&&!files.length&&!['condition','specification','applicability','planned','checked','item_note'].some(key=>form.has(key)))throw new RequestError('Informe quantidade, condição, observação ou anexe uma foto deste item.');
   if(action==='link_handover'&&files.length)throw new RequestError('Salve as fotos em uma atualização antes de vincular a entrega.');
   const photoIds=photoEquipmentIds(form,files.length,action);
   const prepared:{bytes:Uint8Array;type:string;hash:string}[]=[];
   for(const file of files){let bytes:Uint8Array;try{bytes=sanitizePhoto(await file.arrayBuffer(),file.type);assertStaticPhoto(bytes,file.type);}catch{throw new RequestError('Uma foto não é válida ou está animada. Escolha uma imagem estática.');}prepared.push({bytes,type:file.type,hash:await sha256(bytes)});}
   // Absent new fields stay absent so old clients can replay pre-upgrade requests exactly.
   const fingerprint=await sha256(JSON.stringify({action,actor:op.actor.userId,id:action==='create'?null:id,expected_version:action==='create'?null:expected,input,handover_id:handoverId,note,refresh_snapshot:refresh,photos:prepared.map(p=>p.type+':'+p.hash),...(itemInput?{item_update:itemInput}:{}),...(structureInput?{structure_update:structureInput}:{}),...(photoIds===undefined?{}:{photo_equipment_ids:photoIds})}));
   const previous=await prior(requestId,op.ownerId);if(previous){if(previous.request_fingerprint!==fingerprint)throw new RequestError('Este formulário já foi salvo com outros dados. Reabra para uma nova atualização.',409);return await saved(previous,op,!!itemInput||!!structureInput);}
   const original=action==='create'?null:await row(id,op.ownerId);if(action!=='create'&&!original)throw new RequestError('Mobilização não encontrada.',404);
   if(structureInput&&(!original||original.property_id!==structureInput.property_id))throw new RequestError('Mobília não encontrada neste imóvel.',404);
   if(itemInput&&(!original||original.property_id!==itemInput.property_id))throw new RequestError('Item de mobília não encontrado neste imóvel.',404);
   if(original&&original.version!==expected){const raced=await prior(requestId,op.ownerId);if(raced?.request_fingerprint===fingerprint)return await saved(raced,op,!!itemInput||!!structureInput);throw new RequestError(unavailable,409);}
   const before=original?snapshotOf(original):null;let after:MobilizationSnapshot,scopeGuard:Guard;
   if((itemInput||structureInput)&&original){
    const parent=await d.first<Property>('SELECT id,state_code,worksite_id FROM properties WHERE id=? AND owner_id=?',original.property_id,op.ownerId);
    if(!parent||parent.state_code!==original.state_code||parent.worksite_id!==original.worksite_id)throw new RequestError('A UF ou a obra do imóvel mudou. A gestão deve revisar o vínculo antes de editar a mobília.',409);
   }
   if(action==='structure_update'){
    if(!before||!original||!structureInput)throw new RequestError('Mobília não encontrada.',404);
    if(structureInput.resume_preparation&&(before.handover_id||!['inspection','ready'].includes(before.stage)))throw new RequestError('Só é possível retomar a preparação antes de vincular uma entrega.',409);
    const origin=await scope(before,op,original,false);scopeGuard=origin.guard;
    if(origin.data.state_code!==before.state_code||origin.data.worksite_id!==before.worksite_id)throw new RequestError('A UF ou a obra do imóvel mudou. Recarregue antes de salvar.',409);
    const structure=preserveFurnitureIdentity(before,structureInput),stage=structureInput.resume_preparation?'preparation':before.stage;
    const equipment_shortfall_count=structure.equipment.filter(item=>furnitureApplies(item)&&item.checked!==null&&item.planned!==null&&item.checked<item.planned).length,equipment_unknown_count=structure.equipment.filter(item=>furnitureApplies(item)&&(item.checked===null||item.planned===null)).length;
    after={...before,...structure,stage,equipment_shortfall_count,equipment_unknown_count,version:expected+1};
    if(stage==='inspection'&&after.equipment.some(item=>furnitureApplies(item)&&(item.planned===null||item.checked===null||item.checked<item.planned)&&!item.note))throw new RequestError('Na vistoria, informe observações para quantidades não informadas ou faltantes, ou confirme retomar a preparação.');
    if(stage==='ready'&&!ready(after))throw new RequestError('A mobilização pronta deve manter as quantidades conferidas. Antes da entrega, é possível confirmar a retomada da preparação.');
   }else if(action==='item_update'){
    if(!before||!original||!itemInput||!before.equipment.some(item=>item.id===itemInput.item_id))throw new RequestError('Item de mobília não encontrado neste imóvel.',404);
    const origin=await scope(before,op,original,false);scopeGuard=origin.guard;
    if(origin.data.state_code!==before.state_code||origin.data.worksite_id!==before.worksite_id)throw new RequestError('A UF ou a obra do imóvel mudou. Recarregue antes de salvar.',409);
    const equipment=before.equipment.map(item=>item.id===itemInput.item_id?{...item,...furnitureDetails(itemInput),...(Object.hasOwn(itemInput,'planned')?{planned:itemInput.planned!}:{}),...(Object.hasOwn(itemInput,'checked')?{checked:itemInput.checked!}:{}),...(Object.hasOwn(itemInput,'item_note')?{note:itemInput.item_note!}:{})}:item);
    const pending_count=before.checklist.filter(item=>item.status==='pending').length,equipment_shortfall_count=equipment.filter(item=>furnitureApplies(item)&&item.checked!==null&&item.planned!==null&&item.checked<item.planned).length,equipment_unknown_count=equipment.filter(item=>furnitureApplies(item)&&(item.checked===null||item.planned===null)).length;
    if(before.stage==='inspection'&&equipment.some(item=>furnitureApplies(item)&&(item.planned===null||item.checked===null||item.checked<item.planned)&&!item.note))throw new RequestError('Na vistoria, informe uma observação para as quantidades não informadas ou faltantes. Confira a etapa na Mobilização se necessário.');
    after={...before,...origin.data,equipment,pending_count,equipment_shortfall_count,equipment_unknown_count,version:expected+1};
    if(before.stage==='ready'&&!ready(after))throw new RequestError('A mobilização pronta não pode ficar com quantidades pendentes. Confira as quantidades ou a etapa na Mobilização antes de salvar.');
   }else if(action==='link_handover'){
    if(!before||!original||!ready(before))throw new RequestError('A preparação deve estar declarada pronta, sem pendências, antes de vincular a entrega.');if(before.handover_id)throw new RequestError('Esta mobilização já possui um ciclo de entrega vinculado.',409);
    const linked=await handover(handoverId,op.ownerId);if(!matches(before,linked)||!linked)throw new RequestError('Selecione uma entrega do mesmo imóvel, cliente e centro de custo.');
    const origin=await scope(before,op,original,false);scopeGuard=origin.guard;scopeGuard.sql+=' AND EXISTS(SELECT 1 FROM housing_handovers WHERE id=? AND owner_id=? AND revision=? AND property_id=? AND client_id=? AND cost_center_id=?) AND NOT EXISTS(SELECT 1 FROM mobilizations WHERE handover_id=?)';scopeGuard.args.push(linked.id,op.ownerId,linked.revision,before.property_id,before.client_id,before.cost_center_id,linked.id);
    after={...before,...origin.data,handover_id:linked.id,handover_snapshot:{id:linked.id,revision:linked.revision,delivered_on:linked.delivered_on,returned_on:linked.returned_on,slots:linked.slots,level:linked.level,property_id:linked.property_id,client_id:linked.client_id,cost_center_id:linked.cost_center_id},version:expected+1};
   }else{
    if(!input)throw new RequestError('Formulário inválido.');if(before?.handover_id&&(input.stage!=='ready'||input.property_id!==before.property_id||input.client_id!==before.client_id||input.cost_center_id!==before.cost_center_id))throw new RequestError('A mobilização vinculada deve manter imóvel, cliente, centro de custo e preparação pronta. Confira o ciclo em Entregas.',409);
    const resolved=await scope(input,op,original,refresh);scopeGuard=resolved.guard;
    // Older open forms do not know condition. Preserve it by stable item ID without
    // adding it to the submitted input/fingerprint; an explicit empty string clears it.
    const priorItems=new Map(before?.equipment.map(item=>[item.id,item])??[]);
    const equipment=input.equipment.map(item=>{const old=priorItems.get(item.id);return preserveFurnitureDetails(old,item);});
    after={...input,equipment,...resolved.data,equipment_shortfall_count:equipment.filter(item=>furnitureApplies(item)&&item.checked!==null&&item.planned!==null&&item.checked<item.planned).length,equipment_unknown_count:equipment.filter(item=>furnitureApplies(item)&&(item.checked===null||item.planned===null)).length,handover_id:before?.handover_id??null,handover_snapshot:before?.handover_snapshot??null,version:expected+1};
    if(after.stage==='inspection'&&equipment.some(item=>furnitureApplies(item)&&(item.planned===null||item.checked===null||item.checked<item.planned)&&!item.note))throw new RequestError('Na vistoria, explique as quantidades não informadas ou faltantes.');if(after.stage==='ready'&&!ready(after))throw new RequestError('Confira quantidades e checklist antes de declarar a preparação pronta.');
   }
   const associations=action==='item_update'?prepared.map(()=>itemInput!.item_id):photoIds??prepared.map(()=>null);
   const equipmentById=new Map(after.equipment.map(item=>[item.id,item]));
   if(associations.some(itemId=>itemId!==null&&!equipmentById.has(itemId)))throw new RequestError('O item associado à foto não existe nesta mobilização.');
   const eventId=crypto.randomUUID();const photos:{id:string;key:string;type:string;size:number;hash:string;position:number;itemId:string|null;itemSnapshot:string|null}[]=[];
   // Sequential uploads keep the request's memory and outbound work bounded. Each new object is private.
   for(let i=0;i<prepared.length;i++){await d.recheckOperator(op);const photo=prepared[i],photoId=crypto.randomUUID(),key=`mobilizations/${op.ownerId}/${id}/${eventId}/${photoId}`,itemId=associations[i];uploaded.push(key);await d.bucket().put(key,photo.bytes,{httpMetadata:{contentType:photo.type,cacheControl:'private, no-store'}});photos.push({id:photoId,key,type:photo.type,size:photo.bytes.length,hash:photo.hash,position:i,itemId,itemSnapshot:itemId?JSON.stringify(itemPhotoSnapshot(equipmentById.get(itemId)!,after)):null});}
   await d.recheckOperator(op);const auth=d.operatorGuard(op),guard=auth.sql+scopeGuard.sql+' AND NOT EXISTS(SELECT 1 FROM mobilization_events WHERE request_id=?)',guardArgs=[...auth.args,...scopeGuard.args,requestId];
   const columns=['id','owner_id',...snapshotColumns,'last_event_id','created_by','created_at','updated_by','updated_at'];
   const mutation=action==='create'?d.db().prepare('INSERT INTO mobilizations ('+columns.join(',')+') SELECT '+columns.map(()=>'?').join(',')+' WHERE '+guard).bind(id,op.ownerId,...values(after),eventId,op.actor.userId,now,op.actor.userId,now,...guardArgs):d.db().prepare('UPDATE mobilizations SET '+snapshotColumns.map(k=>k+'=?').join(',')+',last_event_id=?,updated_by=?,updated_at=? WHERE id=? AND owner_id=? AND version=? AND '+guard).bind(...values(after),eventId,op.actor.userId,now,id,op.ownerId,expected,...guardArgs);
   attemptedBatch=true;const results=await d.db().batch([mutation,
    d.db().prepare('INSERT INTO mobilization_events (id,owner_id,mobilization_id,action,before_snapshot,after_snapshot,note,actor_user_id,actor_name,photo_count,request_fingerprint,request_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mobilizations WHERE id=? AND owner_id=? AND last_event_id=?)').bind(eventId,op.ownerId,id,action,JSON.stringify(before),JSON.stringify(after),note,op.actor.userId,op.actor.fullName||op.actor.displayName||'Gestão autorizada',photos.length,fingerprint,requestId,now,id,op.ownerId,eventId),
    ...photos.map(p=>d.db().prepare('INSERT INTO mobilization_photos (id,owner_id,mobilization_id,event_id,object_key,content_type,size,sha256,position,uploaded_at,equipment_item_id,equipment_item_snapshot) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM mobilization_events WHERE id=? AND owner_id=? AND mobilization_id=?)').bind(p.id,op.ownerId,id,eventId,p.key,p.type,p.size,p.hash,p.position,now,p.itemId,p.itemSnapshot,eventId,op.ownerId,id)),
   ]);
   batchReturned=true;
   if(!results[0].meta.changes){await d.recheckOperator(op);const raced=await prior(requestId,op.ownerId);if(raced?.request_fingerprint===fingerprint){if(uploaded.length)await d.bucket().delete(uploaded);uploaded.length=0;return await saved(raced,op,!!itemInput||!!structureInput);}throw new RequestError(unavailable,409);}
   uploaded.length=0;const projected=project(after,await handover(after.handover_id,op.ownerId));await assertReadScope(op);return reply({id,event_id:eventId,version:after.version,stage:after.stage,status:projected.status});
  }catch(e){
   // No response cannot prove rollback. Keep private uploads even if a late commit is not yet visible.
   if(uploaded.length&&attemptedBatch&&!batchReturned)uploaded.length=0;
   if(uploaded.length){try{await d.bucket().delete(uploaded);}catch{console.error('Mobilization temporary upload cleanup failed');}}
   if(e instanceof RequestError)return reply({error:e.message},e.status);return reply({error:'Não foi possível confirmar o salvamento. Os campos e fotos selecionados foram mantidos; tente novamente com o mesmo formulário.'},503);
  }
 }
 async function PHOTO(_request:Request,{params}:{params:Promise<{id:string}>}){const imageHeaders={...d.noCache,'Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};try{
  const op=await d.getOperator();if(!op)return new Response('Acesso restrito',{status:401,headers:imageHeaders});const {id}=await params;
  const p=await d.first<{object_key:string;content_type:string}>('SELECT p.object_key,p.content_type FROM mobilization_photos p JOIN mobilizations m ON m.id=p.mobilization_id AND m.owner_id=p.owner_id JOIN mobilization_events e ON e.id=p.event_id AND e.mobilization_id=m.id AND e.owner_id=m.owner_id WHERE p.id=? AND p.owner_id=?',id,op.ownerId);
  if(!p)return new Response('Foto não encontrada',{status:404,headers:imageHeaders});const object=await d.bucket().get(p.object_key);if(!object)return new Response('Foto indisponível',{status:404,headers:imageHeaders});const photoBytes=await object.arrayBuffer();await d.recheckOperator(op);
  // Re-read scoped metadata after object I/O to close revocation or regional movement during the fetch.
  if(!await d.first('SELECT p.id FROM mobilization_photos p JOIN mobilizations m ON m.id=p.mobilization_id AND m.owner_id=p.owner_id JOIN mobilization_events e ON e.id=p.event_id AND e.mobilization_id=m.id AND e.owner_id=m.owner_id WHERE p.id=? AND p.owner_id=?',id,op.ownerId))return new Response('Foto não encontrada',{status:404,headers:imageHeaders});
  await assertReadScope(op);
  return new Response(sanitizePhoto(photoBytes,p.content_type).buffer as ArrayBuffer,{headers:{...imageHeaders,'Content-Type':p.content_type,'Content-Disposition':'inline'}});
 }catch(e){if(e instanceof RequestError)return new Response(e.message,{status:e.status,headers:imageHeaders});return new Response('Foto indisponível',{status:503,headers:imageHeaders});}}
 return {GET,POST,PHOTO,PROPERTY_FURNITURE,ITEM_PHOTOS};
}
