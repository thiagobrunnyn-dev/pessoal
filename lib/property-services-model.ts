import {RequestError} from './http-security';
export const PROPERTY_SERVICES={pest_control:'Dedetização',water_tank:'Higienização de caixa d’água'} as const;
export type PropertyServiceKind=keyof typeof PROPERTY_SERVICES;
export const serviceUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function serviceText(value:unknown,max:number,required=false){if(typeof value!=='string')throw new RequestError('Confira os textos informados.');const text=value.trim();if(text.length>max||required&&!text||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw new RequestError('Confira os textos informados.');return text;}
export function serviceFormText(form:FormData,key:string,max:number,required=false){return serviceText(form.get(key)??'',max,required);}
export async function serviceHash(value:unknown){const bytes=new TextEncoder().encode(JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
