import {RequestError} from './http-security';
export type FurnitureDetails={condition?:string;specification?:string;applicability?:''|'applicable'|'not_applicable';standard_key?:string};
export const furnitureDetailKeys=['condition','specification','applicability','standard_key'] as const;
export function readFurnitureDetails(value:Record<string,unknown>):FurnitureDetails{
 const result:FurnitureDetails={};
 for(const key of furnitureDetailKeys){if(!Object.hasOwn(value,key))continue;const raw=value[key];if(typeof raw!=='string')throw new RequestError('Confira os detalhes do item.');const text=raw.trim();if(key==='applicability'){if(!['','applicable','not_applicable'].includes(text))throw new RequestError('Escolha a aplicação do item.');result.applicability=text as FurnitureDetails['applicability'];}else if(key==='standard_key'){if(!/^[a-z][a-z0-9_]{0,59}$/.test(text))throw new RequestError('Modelo de item inválido.');result.standard_key=text;}else{if(text.length>200)throw new RequestError('Use até 200 caracteres nos detalhes do item.');result[key]=text;}}
 return result;
}
export function furnitureDetailsFromForm(form:FormData){return readFurnitureDetails(Object.fromEntries(furnitureDetailKeys.filter(key=>form.has(key)).map(key=>[key,form.get(key)])));}
export function furnitureDetails(value:FurnitureDetails){return Object.fromEntries(furnitureDetailKeys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]])) as FurnitureDetails;}
export function preserveFurnitureDetails<T extends FurnitureDetails>(before:T|undefined,next:T):T{return {...furnitureDetails(before??{}),...next};}
export const furnitureApplies=(item:FurnitureDetails)=>item.applicability!=='not_applicable';
