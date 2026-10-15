import {anonymousGrantProfileSql} from '../../../../lib/anonymous-profile-guard';
import {db,first,clean,noCache} from '../../../../lib/maintenance';
import {SITE_OWNER_ID} from '../../../../lib/owner-access';
import {boundedJson,requireSameOrigin,RequestError} from '../../../../lib/http-security';
import {epoch,normalizeCode,hashVisitCode,constantEqual,randomHex,sha256,sessionCookie,limitRedemption,isEquipmentId} from '../../../../lib/visit-security';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{...noCache,...headers}});
const invalid=()=>reply({error:'Código inválido, expirado ou já utilizado. Peça um novo código ao responsável.'},401);
export async function POST(request:Request){try{requireSameOrigin(request);const body=await boundedJson(request),equipmentId=clean(body.equipment_id,80),code=normalizeCode(clean(body.code,80));
 await limitRedemption(request,isEquipmentId(equipmentId)?equipmentId:'invalid-id');
 if(!isEquipmentId(equipmentId)||!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(code))return invalid();
 const grant=await first('SELECT g.* FROM visit_grants g JOIN equipment e ON e.id=g.equipment_id AND e.owner_id=g.owner_id WHERE g.equipment_id=? AND g.owner_id=? AND g.revoked_at IS NULL AND '+anonymousGrantProfileSql('g.person_profile_id','g.owner_id')+' ORDER BY g.created_at DESC,g.rowid DESC LIMIT 1',equipmentId,SITE_OWNER_ID);
 const candidateHash=await hashVisitCode(code,grant?.code_salt||'00000000000000000000000000000000');
 if(!grant||grant.redeemed_at!==null||grant.code_expires_at<=epoch()||grant.expires_at<=epoch()||!constantEqual(candidateHash,grant.code_hash))return invalid();
 const token=randomHex(32),hash=await sha256(token),sessionId=crypto.randomUUID(),now=epoch();
 const results=await db().batch([db().prepare('UPDATE visit_grants SET redeemed_at=unixepoch(),redeemed_session_id=? WHERE id=? AND owner_id=? AND equipment_id=? AND redeemed_at IS NULL AND revoked_at IS NULL AND code_expires_at>unixepoch() AND expires_at>unixepoch() AND '+anonymousGrantProfileSql('visit_grants.person_profile_id','visit_grants.owner_id')).bind(sessionId,grant.id,SITE_OWNER_ID,equipmentId),db().prepare('INSERT INTO visit_sessions (id,grant_id,token_hash,created_at,expires_at) SELECT ?,id,?,unixepoch(),expires_at FROM visit_grants WHERE id=? AND redeemed_session_id=? AND revoked_at IS NULL AND expires_at>unixepoch() AND '+anonymousGrantProfileSql('visit_grants.person_profile_id','visit_grants.owner_id')).bind(sessionId,hash,grant.id,sessionId)]);
 if(results[0].meta.changes<1||results[1].meta.changes<1)return invalid();
 return reply({ok:true,expires_at:grant.expires_at},200,{'Set-Cookie':sessionCookie(token,grant.expires_at-now)});
 }catch(e){if(e instanceof RequestError)return reply({error:e.message},e.status,e.status===429?{'Retry-After':'900'}:{});return reply({error:'Acesso temporariamente indisponível. Tente novamente.'},503);}}
