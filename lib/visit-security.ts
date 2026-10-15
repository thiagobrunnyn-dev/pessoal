import {anonymousGrantProfileSql} from './anonymous-profile-guard';
import {db,first} from './maintenance';
import {SITE_OWNER_ID} from './owner-access';
import {RequestError} from './http-security';
export const VISIT_COOKIE='__Host-mobiliza-visit';
export const CODE_TTL_SECONDS=30*60;
export const VISIT_TTL_SECONDS=8*60*60;
export const CODE_ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const encoder=new TextEncoder();
export const epoch=()=>Math.floor(Date.now()/1000);
export const isEquipmentId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export function randomHex(bytes=32){return [...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function normalizeCode(code:string){return code.toUpperCase().replace(/[\s-]/g,'');}
export function generateVisitCode(){const raw=[...crypto.getRandomValues(new Uint8Array(12))].map(v=>CODE_ALPHABET[v&31]).join('');return raw.match(/.{4}/g)!.join('-');}
export async function hashVisitCode(code:string,salt:string){const material=await crypto.subtle.importKey('raw',encoder.encode(normalizeCode(code)),{name:'PBKDF2'},false,['deriveBits']);const result=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},material,256);return [...new Uint8Array(result)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function constantEqual(a:string,b:string){if(a.length!==64||b.length!==64)return false;let difference=0;for(let i=0;i<64;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
export function sessionCookie(token:string,maxAge:number){return `${VISIT_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.max(0,Math.floor(maxAge))}`;}
function cookieToken(request:Request){const values=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(VISIT_COOKIE+'='));if(values.length!==1)return null;const token=values[0].slice(VISIT_COOKIE.length+1);return /^[a-f0-9]{64}$/.test(token)?token:null;}
export type VisitPrincipal={session_id:string;grant_id:string;owner_id:string;equipment_id:string;technician_name:string;expires_at:number;session_hash:string;person_profile_id?:string|null};
export async function getVisit(request:Request,equipmentId?:string):Promise<VisitPrincipal|null>{
 const token=cookieToken(request);if(!token)return null;const hash=await sha256(token);
 const visit=await first(`SELECT s.id session_id,g.id grant_id,g.owner_id,g.equipment_id,g.technician_name,g.person_profile_id,min(g.expires_at,s.expires_at) expires_at,s.token_hash session_hash FROM visit_sessions s JOIN visit_grants g ON g.id=s.grant_id JOIN equipment e ON e.id=g.equipment_id AND e.owner_id=g.owner_id WHERE s.token_hash=? AND g.owner_id=? AND s.revoked_at IS NULL AND g.revoked_at IS NULL AND s.expires_at>unixepoch() AND g.expires_at>unixepoch() AND ${anonymousGrantProfileSql('g.person_profile_id','g.owner_id')}`,hash,SITE_OWNER_ID);
 if(!visit||(equipmentId&&visit.equipment_id!==equipmentId))return null;return visit;
}
async function increment(key:string,expiresAt:number){const row=await db().prepare('INSERT INTO visit_rate_limits (id,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,expiresAt).first<{attempts:number}>();return row!.attempts;}
export async function limitRedemption(request:Request,equipmentId:string){
 // CF-Connecting-IP is supplied by Cloudflare; never trust arbitrary X-Forwarded-For.
 // If absent, fail conservatively into a shared unknown-client bucket.
 const ip=request.headers.get('cf-connecting-ip')||'unknown';const now=epoch(),window=Math.floor(now/900),ends=(window+1)*900;
 const client=await sha256('visit-login:'+ip);
 if(await increment(`global:${window}`,ends)>600)throw new RequestError('Muitas tentativas. Aguarde até 15 minutos e tente novamente.',429);
 if(await increment(`client:${client}:${window}`,ends)>15)throw new RequestError('Muitas tentativas. Aguarde até 15 minutos e tente novamente.',429);
 if(await increment(`pair:${client}:${equipmentId}:${window}`,ends)>5)throw new RequestError('Muitas tentativas. Aguarde até 15 minutos e tente novamente.',429);
 if(await increment(`asset:${equipmentId}:${window}`,ends)>20)throw new RequestError('Muitas tentativas. Aguarde até 15 minutos e tente novamente.',429);
 // Bounded cleanup of expired counters only; no grant/session/audit data is deleted.
 await db().prepare('DELETE FROM visit_rate_limits WHERE id IN (SELECT id FROM visit_rate_limits WHERE expires_at<? LIMIT 100)').bind(now-900).run();
}
export async function limitVisitWrite(visit:VisitPrincipal){const now=epoch(),window=Math.floor(now/3600);if(await increment(`write:${visit.grant_id}:${window}`,(window+1)*3600)>10)throw new RequestError('Muitas tentativas de registro nesta visita. Peça orientação ao responsável.',429);}
