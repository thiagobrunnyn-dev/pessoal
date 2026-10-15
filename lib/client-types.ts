export const CLIENT_TYPES={external_client:'Cliente externo',internal_unit:'Unidade interna'} as const;
export type ClientType=keyof typeof CLIENT_TYPES;
export function isClientType(value:unknown):value is ClientType{return typeof value==='string'&&Object.hasOwn(CLIENT_TYPES,value);}
export function clientTypeLabel(value:unknown){return isClientType(value)?CLIENT_TYPES[value]:'Tipo não informado';}
export function clientDisplayName(row:{name?:unknown;entity_type?:unknown}){return String(row.name??'')+(row.entity_type==='internal_unit'?' · Unidade interna':'');}
