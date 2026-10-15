import type {MobilizationEnvironment,MobilizationEquipment} from './mobilizations';
type TemplateItem={key:string;label:string;aliases?:string[]};
type Template={label:string;kind:MobilizationEnvironment['kind'];items:TemplateItem[]};
export const FURNITURE_STANDARD:Record<string,Template>={
 entry:{label:'Entrada',kind:'other',items:[{key:'management_board',label:'Quadro de Gestão à Vista',aliases:['Quadro de gestão','Quadro de avisos']},{key:'waste_bin',label:'Lixeira'}]},
 living:{label:'Sala',kind:'living',items:[{key:'sofa',label:'Sofá'},{key:'tv',label:'TV',aliases:['Televisão','Televisor']},{key:'tv_support',label:'Suporte de TV',aliases:['Suporte para TV']}]},
 bedroom:{label:'Quarto',kind:'bedroom',items:[{key:'bed_base',label:'Base de cama',aliases:['Cama','Cama de solteiro','Cama de casal','Beliche']},{key:'mattress',label:'Colchão',aliases:['Colchão de solteiro','Colchão de casal']},{key:'wardrobe',label:'Armário',aliases:['Guarda-roupa','Guarda roupa']},{key:'blackout',label:'Cortina blackout',aliases:['Blackout','Cortina']},{key:'air_conditioner',label:'Ar-condicionado',aliases:['Ar condicionado','Central de ar']}]},
 kitchen:{label:'Cozinha',kind:'kitchen',items:[{key:'fridge',label:'Geladeira'},{key:'stove',label:'Fogão'},{key:'cupboard',label:'Armário de cozinha',aliases:['Armário']},{key:'table',label:'Mesa'},{key:'chair',label:'Cadeira',aliases:['Cadeiras']},{key:'utensils',label:'Utensílios de cozinha',aliases:['Utensílios']}]},
 bathroom:{label:'Banheiro',kind:'other',items:[{key:'mirror',label:'Espelho'},{key:'waste_bin',label:'Lixeira'},{key:'bathroom_supports',label:'Suportes do banheiro',aliases:['Suportes']}]},
 laundry:{label:'Lavanderia',kind:'laundry',items:[{key:'laundry_sink',label:'Tanque'},{key:'washing_machine',label:'Máquina de lavar',aliases:['Máquina de lavar roupas']},{key:'clothesline',label:'Varal'},{key:'cleaning_kit',label:'Kit de limpeza'}]},
 common:{label:'Área de vivência',kind:'common',items:[{key:'tv',label:'TV',aliases:['Televisão','Televisor']},{key:'water_dispenser',label:'Bebedouro'},{key:'chair',label:'Cadeira',aliases:['Cadeiras']}]},
 safety:{label:'Segurança e sinalização',kind:'other',items:[]},
};
export type StandardSelection={template:string;environment_id:string|null;label:string};
const match=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();
export const standardEnvironmentMatch=(a:string,b:string)=>match(a)===match(b);
export function standardItemDefinition(key:string){return Object.values(FURNITURE_STANDARD).flatMap(t=>t.items).find(i=>i.key===key);}
export function matchesStandardItem(row:Pick<MobilizationEquipment,'label'|'standard_key'>,key:string){const item=standardItemDefinition(key);if(!item)return false;return row.standard_key===key||[item.label,...item.aliases??[]].map(match).some(name=>match(row.label)===name||match(row.label).startsWith(name+' ')&&/^\d/.test(match(row.label).slice(name.length+1)));}
/** Produces additions only; never overwrites an existing item, count, photo or ID. */
export function planFurnitureStandard(environments:MobilizationEnvironment[],items:Pick<MobilizationEquipment,'id'|'label'|'environment_id'|'standard_key'>[],selections:StandardSelection[],id=()=>crypto.randomUUID()){
 const addedEnvironments:MobilizationEnvironment[]=[],addedItems:MobilizationEquipment[]=[];let present=0;
 for(const choice of selections){const template=Object.hasOwn(FURNITURE_STANDARD,choice.template)?FURNITURE_STANDARD[choice.template]:null;if(!template)throw new Error('Selecione um modelo de ambiente válido.');const label=choice.label.trim();if(!label||label.length>200)throw new Error('Informe o nome de cada novo ambiente.');
 const target=choice.environment_id?[...environments,...addedEnvironments].find(e=>e.id===choice.environment_id):[...environments,...addedEnvironments].find(e=>match(e.label)===match(label));
 if(choice.environment_id&&!target)throw new Error('O ambiente selecionado mudou. Confira a lista.');
 const environment=target??{id:id(),label,kind:template.kind,level:null,layout:null,single_beds:null};if(!target)addedEnvironments.push(environment);
 for(const item of template.items){const names=[item.label,...item.aliases??[]].map(match);const duplicate=[...items,...addedItems].some(row=>row.environment_id===environment.id&&(row.standard_key===item.key||names.some(name=>match(row.label)===name||match(row.label).startsWith(name+' ')&&/^\d/.test(match(row.label).slice(name.length+1)))));if(duplicate){present++;continue;}addedItems.push({id:id(),environment_id:environment.id,label:item.label,planned:null,checked:null,condition:'',specification:'',applicability:'',standard_key:item.key,note:''});}
 }
 if(environments.length+addedEnvironments.length>100||items.length+addedItems.length>100)throw new Error('A lista admite até 100 ambientes e 100 itens. Aplique menos ambientes por vez ou revise a lista.');
 return {environments:addedEnvironments,items:addedItems,present};
}
