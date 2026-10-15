import {db,noCache} from './maintenance';
import {getOwnerUser,SITE_OWNER_ID} from './owner-access';
import {boundedJson,RequestError,requireSameOrigin} from './http-security';
import type {IntegrationGrant} from './integration-context';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const integrationReply=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{...noCache,...headers}});
export const integrationError=(e:unknown)=>integrationReply({error:e instanceof RequestError?e.message:'Não foi possível confirmar a operação. Consulte o estado atual antes de repetir.'},e instanceof RequestError?e.status:503,e instanceof RequestError&&e.status===429?{'Retry-After':'60'}:{});
export async function tokenHash(token:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function authenticateIntegration(request:Request):Promise<IntegrationGrant>{
 if(request.headers.has('origin')||request.headers.has('cookie'))throw new RequestError('Use esta API no servidor do n8n, sem cookies ou Origin.',403);
 const match=/^Bearer (mbl_[a-f0-9]{64})$/.exec(request.headers.get('authorization')||'');if(!match)throw new RequestError('Informe uma credencial Bearer válida.',401);
 const key=await db().prepare("SELECT id,owner_id,name,permission FROM integration_keys WHERE token_hash=? AND owner_id=? AND revoked_at IS NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(await tokenHash(match[1]),SITE_OWNER_ID).first<{id:string;owner_id:string;name:string;permission:'read'|'write'}>();
 if(!key)throw new RequestError('Credencial inválida, expirada ou revogada.',401);
 const now=new Date().toISOString(),window=Math.floor(Date.now()/60000);
 const used=await db().prepare('UPDATE integration_keys SET last_used_at=?,rate_count=CASE WHEN rate_window=? THEN rate_count+1 ELSE 1 END,rate_window=? WHERE id=? AND revoked_at IS NULL AND expires_at>? AND (rate_window<>? OR rate_count<120) RETURNING id').bind(now,window,window,key.id,now,window).first();
 if(!used)throw new RequestError('Limite de 120 chamadas por minuto atingido ou credencial encerrada. Aguarde e confira a credencial.',429);
 return {id:key.id,ownerId:key.owner_id,name:key.name,permission:key.permission};
}
async function owner(){if(!await getOwnerUser())throw new RequestError('Configuração exclusiva do administrador.',401);}
export async function listIntegrationKeys(){try{await owner();const keys=await db().prepare('SELECT id,name,prefix,permission,created_at,expires_at,revoked_at,last_used_at FROM integration_keys WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(SITE_OWNER_ID).all();return integrationReply({keys:keys.results});}catch(e){return integrationError(e);}}
export async function createIntegrationKey(request:Request){try{
 await owner();requireSameOrigin(request);const body=await boundedJson(request,2048);
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['id','name','permission','days','confirmed'].includes(k))||!UUID.test(body.id)||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80||!['read','write'].includes(body.permission)||![7,30,90,365].includes(body.days)||body.confirmed!==true)throw new RequestError('Confira nome, validade e permissões da credencial.');
 const prior=await db().prepare('SELECT id FROM integration_keys WHERE id=? AND owner_id=?').bind(body.id,SITE_OWNER_ID).first();if(prior)throw new RequestError('Esta credencial já foi criada. O segredo não pode ser exibido novamente; revogue-a e crie outra se não o copiou.',409);
 const token='mbl_'+[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');const now=new Date().toISOString(),expires=new Date(Date.now()+body.days*86400000).toISOString();
 const result=await db().prepare('INSERT OR IGNORE INTO integration_keys(id,owner_id,name,token_hash,prefix,permission,created_at,expires_at,rate_window,rate_count) SELECT ?,?,?,?,?,?,?,?,0,0 WHERE (SELECT COUNT(*) FROM integration_keys WHERE owner_id=? AND revoked_at IS NULL AND expires_at>?)<20').bind(body.id,SITE_OWNER_ID,body.name.trim(),await tokenHash(token),token.slice(0,12),body.permission,now,expires,SITE_OWNER_ID,now).run();
 if(!result.meta.changes)throw new RequestError('Credencial já criada ou limite de 20 credenciais ativas atingido. Atualize a lista.',409);
 return integrationReply({id:body.id,token,expires_at:expires},201);
}catch(e){return integrationError(e);}}
export async function revokeIntegrationKey(request:Request){try{
 await owner();requireSameOrigin(request);const body=await boundedJson(request,256);if(!body||Object.keys(body).some(k=>!['id','confirmed'].includes(k))||!UUID.test(body.id)||body.confirmed!==true)throw new RequestError('Confirme a credencial que deseja revogar.');
 const result=await db().prepare('UPDATE integration_keys SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND owner_id=? RETURNING id').bind(new Date().toISOString(),body.id,SITE_OWNER_ID).first();if(!result)throw new RequestError('Credencial não encontrada.',404);return integrationReply({id:body.id,revoked:true});
}catch(e){return integrationError(e);}}
