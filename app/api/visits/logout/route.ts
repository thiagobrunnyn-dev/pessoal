import {getVisit,sessionCookie} from '../../../../lib/visit-security';
import {db,noCache} from '../../../../lib/maintenance';
import {requireSameOrigin,RequestError} from '../../../../lib/http-security';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{requireSameOrigin(request);const visit=await getVisit(request);if(visit)await db().prepare('UPDATE visit_sessions SET revoked_at=unixepoch() WHERE id=?').bind(visit.session_id).run();return Response.json({ok:true},{headers:{...noCache,'Set-Cookie':sessionCookie('',0)}});}catch(e){return Response.json({error:'Não foi possível encerrar.'},{status:e instanceof RequestError?e.status:503,headers:noCache});}}
