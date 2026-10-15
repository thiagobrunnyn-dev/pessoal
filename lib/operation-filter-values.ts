import {BRAZIL_STATES} from './brazil-states';
export const FILTER_KEYS=['state_code','client_id','worksite_id','property_id'] as const;
export type FilterKey=typeof FILTER_KEYS[number];
export type OperationFilters=Record<FilterKey,string>;
export type FilterOption={value:string;label:string};
export type OperationFilterOptions=Record<FilterKey,FilterOption[]>;
export const EMPTY_FILTERS:OperationFilters={state_code:'',client_id:'',worksite_id:'',property_id:''};
export const UNKNOWN_STATE='__unknown__',UNLINKED='__none__';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parseOperationFilters(query:URLSearchParams):OperationFilters{
 const result={...EMPTY_FILTERS};for(const key of FILTER_KEYS){const values=query.getAll(key);if(values.length>1)throw Error('Cada filtro deve ter apenas uma seleção.');const value=values[0]||'';if(value.length>64)throw Error('Selecione filtros válidos.');if(key==='state_code'){if(value&&value!==UNKNOWN_STATE&&!Object.hasOwn(BRAZIL_STATES,value))throw Error('Selecione um estado válido.');}else if(value&&!(key!=='property_id'&&value===UNLINKED)&&!uuid.test(value))throw Error('Selecione filtros válidos.');result[key]=value;}return result;
}
export function operationFilterQuery(filters:OperationFilters){const query=new URLSearchParams();for(const key of FILTER_KEYS)if(filters[key])query.set(key,filters[key]);return query.toString();}
export function filtersFromSearchRecord(record:Record<string,string|string[]|undefined>){const query=new URLSearchParams();for(const key of FILTER_KEYS){const value=record[key];for(const item of Array.isArray(value)?value:value===undefined?[]:[value])query.append(key,item);}return query.toString();}
export function changeOperationFilter(current:OperationFilters,key:FilterKey,value:string):OperationFilters{const next={...current,[key]:value};for(const child of FILTER_KEYS.slice(FILTER_KEYS.indexOf(key)+1))next[child]='';return next;}
