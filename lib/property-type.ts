import {RequestError} from './http-security';
export const PROPERTY_TYPES={house:'Casa',apartment:'Apartamento',building:'Prédio'} as const;
export type PropertyType=keyof typeof PROPERTY_TYPES;
export function propertyType(value:unknown):PropertyType|null{
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||!Object.hasOwn(PROPERTY_TYPES,value))throw new RequestError('Escolha casa, apartamento ou prédio, ou deixe o tipo não informado.');
 return value as PropertyType;
}
export const propertyTypeLabel=(value:unknown)=>typeof value==='string'&&Object.hasOwn(PROPERTY_TYPES,value)?PROPERTY_TYPES[value as PropertyType]:'Não informado';
