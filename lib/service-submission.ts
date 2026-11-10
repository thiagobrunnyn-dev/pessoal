import {RequestError} from './http-security';

async function sha256(bytes:ArrayBuffer|Uint8Array<ArrayBuffer>){
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function serviceSubmissionFingerprint(form:FormData){
 // Sort by field name while preserving the order of repeated fields such as photos.
 const fields=[...form].sort(([a],[b])=>a<b?-1:a>b?1:0);
 const entries:[string,string|[string,string]][]=[];
 for(const [name,value] of fields){
  if(name==='request_id')continue;
  entries.push([name,typeof value==='string'?value:[value.type,await sha256(await value.arrayBuffer())]]);
 }
 return sha256(new TextEncoder().encode(JSON.stringify(entries)));
}

export function requireMatchingServiceSubmission(saved:string|null,fingerprint:string){
 // Records saved before fingerprinting cannot establish an exact replay.
 if(saved!==fingerprint)throw new RequestError('Já existe um registro para este envio. Confira o histórico antes de registrar novamente.',409);
}
