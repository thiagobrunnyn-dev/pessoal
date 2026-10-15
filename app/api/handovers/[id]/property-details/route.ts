import {getOperator} from '../../../../../lib/app-access';
import {privateHandoverDetails} from '../../../../../lib/property-front-photo-data';
import {noCache} from '../../../../../lib/maintenance';
import {RequestError} from '../../../../../lib/http-security';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const op=await getOperator();if(!op)return Response.json({error:'Acesso restrito à gestão.'},{status:401,headers:noCache});const result=await privateHandoverDetails(op.ownerId,{id:(await params).id});if(result.status==='unavailable')return Response.json({error:'Detalhes não disponíveis.'},{status:404,headers:noCache});return Response.json(result,{headers:noCache});}catch(e){return Response.json({error:e instanceof RequestError?e.message:'Não foi possível consultar os detalhes.'},{status:e instanceof RequestError?e.status:503,headers:noCache});}}
