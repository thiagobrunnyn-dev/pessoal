import {readFurnitureDetails,preserveFurnitureDetails,furnitureApplies,type FurnitureDetails} from './furniture-details';
import {RequestError} from './http-security';

export const MOBILIZATION_STAGES = {new:'Nova',survey:'Levantamento',preparation:'Preparação',inspection:'Vistoria',ready:'Pronta para entrega'} as const;
export const MOBILIZATION_BUILDING_TYPES = {house:'Casa',building:'Prédio'} as const;
export const MOBILIZATION_TYPES = {republic:'República',lodging:'Alojamento'} as const;
export const MOBILIZATION_CATEGORIES = {structure:'Estrutura',furniture:'Móveis e equipamentos',cleaning:'Limpeza',inspection:'Vistoria'} as const;
export const MAX_MOBILIZATION_PHOTOS = 3;
export type MobilizationStage = keyof typeof MOBILIZATION_STAGES;
export type MobilizationEnvironment = {id:string;label:string;kind:'bedroom'|'living'|'kitchen'|'laundry'|'common'|'other';level:'staff'|'tecnico'|'encarregado'|'operacional'|null;layout:'double'|'single'|'bunk'|null;single_beds:2|3|null};
export type MobilizationEquipment = FurnitureDetails & {id:string;label:string;environment_id:string|null;planned:number|null;checked:number|null;note:string;condition?:string};
export type MobilizationChecklist = {id:string;label:string;environment_id:string|null;category:keyof typeof MOBILIZATION_CATEGORIES;status:'todo'|'pending'|'done'|'na';note:string};
export type MobilizationInput = {
 property_id:string;client_id:string;cost_center_id:string;housing_type:keyof typeof MOBILIZATION_TYPES;
 building_type:keyof typeof MOBILIZATION_BUILDING_TYPES;environments:MobilizationEnvironment[];responsible:string;due_on:string|null;planned_slots:number|null;stage:MobilizationStage;
 equipment:MobilizationEquipment[];checklist:MobilizationChecklist[];notes:string;pending_count:number;equipment_shortfall_count:number;equipment_unknown_count:number;
};
export type MobilizationSnapshot = MobilizationInput & {
 property_name:string;address:string;client_name:string;cost_center_name:string;state_code:string|null;worksite_id:string|null;
 handover_id:string|null;handover_snapshot:Record<string,unknown>|null;version:number;
};
export type MobilizationRow = Omit<MobilizationSnapshot,'environments'|'equipment'|'checklist'|'handover_snapshot'> & {
 id:string;owner_id:string;environments:string;equipment:string;checklist:string;handover_snapshot:string|null;last_event_id:string;
 created_by:string;created_at:string;updated_by:string;updated_at:string;
};
export function formText(form:FormData,name:string,max:number,required=false){
 const value=form.get(name);if(value!==null&&typeof value!=='string')throw new RequestError('Campo inválido: '+name+'.');
 const text=(value??'').trim();if(text.length>max||required&&!text)throw new RequestError('Confira o campo '+name+'.');return text;
}
export function integer(value:unknown,label:string){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new RequestError(label+' deve ser um número inteiro não negativo.');return value;}
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
function text(value:unknown,max:number,required=false){if(typeof value!=='string')throw new RequestError('Confira os textos da lista.');const v=value.trim();if(v.length>max||required&&!v)throw new RequestError('Confira os textos da lista.');return v;}
function list(form:FormData,key:string):Record<string,unknown>[]{
 const raw=formText(form,key,60000,true);let values:unknown;try{values=JSON.parse(raw);}catch{throw new RequestError('Lista inválida: '+key+'.');}
 if(!Array.isArray(values)||values.length>100)throw new RequestError('Use no máximo 100 itens em cada lista.');const ids=new Set<string>();
 return values.map(value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new RequestError('Item inválido.');const id=text(value.id,80,true);if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id))throw new RequestError('Cada item precisa de um identificador único.');ids.add(id);return {...value,id};});
}
export type FurnitureStructure=Pick<MobilizationInput,'environments'|'equipment'>;
export function readFurnitureStructure(form:FormData,stage='preparation'):FurnitureStructure{
 const environments=list(form,'environments').map(v=>{const kind=text(v.kind,20,true),level=v.level??null,layout=v.layout??null,single_beds=v.single_beds??null;if(!['bedroom','living','kitchen','laundry','common','other'].includes(kind)||level!==null&&(typeof level!=='string'||!['staff','tecnico','encarregado','operacional'].includes(level))||layout!==null&&(typeof layout!=='string'||!['double','single','bunk'].includes(layout))||single_beds!==null&&single_beds!==2&&single_beds!==3)throw new RequestError('Confira os dados dos ambientes.');if(kind!=='bedroom'&&(level!==null||layout!==null||single_beds!==null))throw new RequestError('Nível e configuração de camas se aplicam somente aos quartos.');if(single_beds!==null&&layout!=='single')throw new RequestError('Informe duas ou três camas apenas na configuração de solteiro.');return {id:String(v.id),label:text(v.label,200,true),kind,level,layout,single_beds} as MobilizationEnvironment;});
 const environmentIds=new Set(environments.map(e=>e.id));
 const equipment=list(form,'equipment').map(v=>{const environment_id=v.environment_id===undefined||v.environment_id===null||v.environment_id===''?null:text(v.environment_id,80,true);if(environment_id&&!environmentIds.has(environment_id))throw new RequestError('O ambiente de um móvel ou equipamento não existe neste registro.');const item={id:String(v.id),label:text(v.label,200,true),environment_id,planned:v.planned===null?null:integer(v.planned,'Quantidade prevista'),checked:v.checked===null?null:integer(v.checked,'Disponível informado'),note:text(v.note??'',2000),...readFurnitureDetails(v)};if(stage==='inspection'&&furnitureApplies(item)&&(item.planned===null||item.checked===null||item.checked<item.planned)&&!item.note)throw new RequestError('Na vistoria, explique as quantidades ainda não informadas ou as faltas de móveis e equipamentos.');return item;});
 return {environments,equipment};
}
// Structural edits keep existing identities and their attached historical evidence.
export function preserveFurnitureIdentity(before:FurnitureStructure,next:FurnitureStructure):FurnitureStructure{
 const envIds=new Set(next.environments.map(e=>e.id)),itemIds=new Set(next.equipment.map(e=>e.id));
 if(before.environments.some(e=>!envIds.has(e.id))||before.equipment.some(e=>!itemIds.has(e.id)))throw new RequestError('Os ambientes e itens existentes devem ser preservados com seus identificadores.');
 const old=new Map(before.equipment.map(e=>[e.id,e]));
 return {environments:next.environments,equipment:next.equipment.map(e=>preserveFurnitureDetails(old.get(e.id),e))};
}
export function readMobilizationInput(form:FormData,deferEquipmentValidation=false):MobilizationInput{
 const property_id=formText(form,'property_id',80,true),client_id=formText(form,'client_id',80,true),cost_center_id=formText(form,'cost_center_id',80,true);
 const building_type=formText(form,'building_type',20,true);
 const housing_type=formText(form,'housing_type',20,true),responsible=formText(form,'responsible',120,true),stage=formText(form,'stage',20,true),due_on=formText(form,'due_on',10)||null,slots=formText(form,'planned_slots',16);
 if(!Object.hasOwn(MOBILIZATION_BUILDING_TYPES,building_type)||!Object.hasOwn(MOBILIZATION_TYPES,housing_type)||!Object.hasOwn(MOBILIZATION_STAGES,stage)||due_on&&!validDate(due_on))throw new RequestError('Confira tipo, etapa e prazo.');
 if(slots&&!/^\d+$/.test(slots))throw new RequestError('Vagas previstas deve ser um inteiro não negativo.');const planned_slots=slots?integer(Number(slots),'Vagas previstas'):null;
 const {environments,equipment}=readFurnitureStructure(form,deferEquipmentValidation?'preparation':stage);
 const environmentIds=new Set(environments.map(e=>e.id));
 const checklist=list(form,'checklist').map(v=>{const environment_id=v.environment_id===undefined||v.environment_id===null||v.environment_id===''?null:text(v.environment_id,80,true);if(environment_id&&!environmentIds.has(environment_id))throw new RequestError('O ambiente de um item do checklist não existe neste registro.');const category=text(v.category,20,true),status=text(v.status,20,true);if(!Object.hasOwn(MOBILIZATION_CATEGORIES,category)||!['todo','pending','done','na'].includes(status))throw new RequestError('Confira categoria e situação do checklist.');const item={id:String(v.id),label:text(v.label,200,true),environment_id,category:category as MobilizationChecklist['category'],status:status as MobilizationChecklist['status'],note:text(v.note??'',2000)};if(item.status==='pending'&&!item.note)throw new RequestError('Informe uma observação para cada pendência do checklist.');return item;});
 const pending_count=checklist.filter(x=>x.status==='pending').length,equipment_shortfall_count=equipment.filter(x=>furnitureApplies(x)&&x.checked!==null&&x.planned!==null&&x.checked<x.planned).length,equipment_unknown_count=equipment.filter(x=>furnitureApplies(x)&&(x.checked===null||x.planned===null)).length;
 if(stage==='ready'&&(!checklist.length||checklist.some(x=>x.status!=='done'&&x.status!=='na')||!deferEquipmentValidation&&(equipment_shortfall_count||equipment_unknown_count)))throw new RequestError('Para ficar pronta, defina ao menos um item no checklist, resolva as pendências e confira todas as quantidades previstas.');
 return {property_id,client_id,cost_center_id,building_type:building_type as MobilizationInput['building_type'],environments,housing_type:housing_type as MobilizationInput['housing_type'],responsible,due_on,planned_slots,stage:stage as MobilizationStage,equipment,checklist,notes:formText(form,'notes',4000),pending_count,equipment_shortfall_count,equipment_unknown_count};
}
export function snapshotOf(row:MobilizationRow):MobilizationSnapshot{
 const {property_id,client_id,cost_center_id,property_name,address,client_name,cost_center_name,state_code,worksite_id,housing_type,building_type,responsible,due_on,planned_slots,stage,notes,pending_count,equipment_shortfall_count,equipment_unknown_count,handover_id,version}=row;
 return {property_id,client_id,cost_center_id,property_name,address,client_name,cost_center_name,state_code,worksite_id,housing_type,building_type,responsible,due_on,planned_slots,stage,environments:JSON.parse(row.environments),equipment:JSON.parse(row.equipment),checklist:JSON.parse(row.checklist),notes,pending_count,equipment_shortfall_count,equipment_unknown_count,handover_id,handover_snapshot:row.handover_snapshot?JSON.parse(row.handover_snapshot):null,version};
}
export function ready(snapshot:MobilizationSnapshot){return snapshot.stage==='ready'&&snapshot.checklist.length>0&&snapshot.checklist.every(x=>x.status==='done'||x.status==='na')&&snapshot.equipment.every(x=>!furnitureApplies(x)||x.checked!==null&&x.planned!==null&&x.checked>=x.planned);}
export async function sha256(value:Uint8Array|string){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function assertStaticPhoto(bytes:Uint8Array,type:string){
 if(type==='image/png'){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let at=8;at+12<=bytes.length;){const length=view.getUint32(at),name=String.fromCharCode(...bytes.subarray(at+4,at+8));if(['acTL','fcTL','fdAT'].includes(name))throw new RequestError('Use fotos estáticas, sem animação.');at+=length+12;}}
}
export function defaultMobilizationChecklist():MobilizationChecklist[]{return [
 {id:'structure',label:'Condições de estrutura',category:'structure',environment_id:null,status:'todo',note:''},
 {id:'furniture',label:'Móveis e equipamentos',category:'furniture',environment_id:null,status:'todo',note:''},
 {id:'cleaning',label:'Limpeza para entrega',category:'cleaning',environment_id:null,status:'todo',note:''},
 {id:'inspection',label:'Vistoria da preparação',category:'inspection',environment_id:null,status:'todo',note:''},
];}
