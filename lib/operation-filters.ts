import {all} from './maintenance';
import {RequestError} from './http-security';
import {BRAZIL_STATES} from './brazil-states';
import {parseOperationFilters,UNKNOWN_STATE,UNLINKED,type OperationFilters,type OperationFilterOptions,type FilterOption} from './operation-filter-values';
type PropertyScope={id:string;name:string;control_number:number|null;state_code:string|null;archived_at:string|null;worksite_id:string|null;center_id:string|null;center_name:string|null;center_archived:string|null;client_id:string|null;client_name:string|null;client_archived:string|null};
export type ResolvedOperationFilters={filters:OperationFilters;filterOptions:OperationFilterOptions};
const matchesState=(p:PropertyScope,value:string)=>!value||(value===UNKNOWN_STATE?!p.state_code:p.state_code===value);
const matchesClient=(p:PropertyScope,value:string)=>!value||(value===UNLINKED?p.worksite_id===null:p.client_id===value);
const matchesCenter=(p:PropertyScope,value:string)=>!value||(value===UNLINKED?p.worksite_id===null:p.center_id===value);
const unique=(values:FilterOption[])=>[...new Map(values.map(v=>[v.value,v])).values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'));
/** Options come only from properties visible through the same live regional facade. */
export async function resolveOperationFilters(owner:string,query:URLSearchParams):Promise<ResolvedOperationFilters>{
 let filters:OperationFilters;try{filters=parseOperationFilters(query);}catch(e){throw new RequestError((e as Error).message,400);}
 const properties=await all(`SELECT p.id,p.name,p.control_number,p.state_code,p.archived_at,p.worksite_id,
 c.id center_id,c.name center_name,c.archived_at center_archived,n.id client_id,n.name client_name,n.archived_at client_archived
 FROM properties p LEFT JOIN cost_centers c ON c.id=p.worksite_id AND c.owner_id=p.owner_id
 LEFT JOIN clients n ON n.id=c.client_id AND n.owner_id=p.owner_id WHERE p.owner_id=? ORDER BY p.control_number,p.name,p.id`,owner) as PropertyScope[];
 const stateRows=properties.filter(p=>matchesState(p,filters.state_code));
 const clientRows=stateRows.filter(p=>matchesClient(p,filters.client_id));
 const centerRows=clientRows.filter(p=>matchesCenter(p,filters.worksite_id));
 const filterOptions:OperationFilterOptions={
  state_code:unique(properties.map(p=>({value:p.state_code||UNKNOWN_STATE,label:p.state_code?(BRAZIL_STATES[p.state_code as keyof typeof BRAZIL_STATES]||p.state_code)+' · '+p.state_code:'UF a confirmar'}))),
  client_id:unique(stateRows.flatMap(p=>p.worksite_id===null?[{value:UNLINKED,label:'Sem empresa vinculada'}]:p.client_id?[{value:p.client_id,label:p.client_name+(p.client_archived?' (arquivada)':'')}]:[])),
  worksite_id:unique(clientRows.flatMap(p=>p.worksite_id===null?[{value:UNLINKED,label:'Sem centro de custo'}]:p.center_id?[{value:p.center_id,label:p.center_name+(p.center_archived?' (arquivado)':'')}]:[])),
  property_id:centerRows.map(p=>({value:p.id,label:(p.control_number===null?'':String(p.control_number).padStart(2,'0')+' · ')+p.name+(p.archived_at?' (arquivado)':'')+(p.worksite_id&&(!p.center_id||!p.client_id)?' (vínculo a conferir)':'')})),
 };
 for(const key of ['state_code','client_id','worksite_id','property_id'] as const)if(filters[key]&&!filterOptions[key].some(v=>v.value===filters[key]))throw new RequestError('Esta combinação de filtros não está disponível para o seu acesso. Ajuste ou limpe os filtros.',400);
 return {filters,filterOptions};
}
/** Alias is from product code, values are always bound. The regional facade still scopes each table. */
export function operationPropertyPredicate(filters:OperationFilters,alias='p'):{sql:string;args:unknown[]}{
 if(!/^[a-z_]+$/.test(alias))throw Error('Invalid property alias');const clauses:string[]=[],args:unknown[]=[];
 if(filters.state_code===UNKNOWN_STATE)clauses.push(`(${alias}.state_code IS NULL OR ${alias}.state_code='')`);else if(filters.state_code){clauses.push(`${alias}.state_code=?`);args.push(filters.state_code);}
 if(filters.client_id===UNLINKED)clauses.push(`${alias}.worksite_id IS NULL`);else if(filters.client_id){clauses.push(`EXISTS(SELECT 1 FROM cost_centers fc WHERE fc.id=${alias}.worksite_id AND fc.owner_id=${alias}.owner_id AND fc.client_id=?)`);args.push(filters.client_id);}
 if(filters.worksite_id===UNLINKED)clauses.push(`${alias}.worksite_id IS NULL`);else if(filters.worksite_id){clauses.push(`${alias}.worksite_id=?`);args.push(filters.worksite_id);}
 if(filters.property_id){clauses.push(`${alias}.id=?`);args.push(filters.property_id);}
 return {sql:clauses.length?clauses.join(' AND '):'1',args};
}
