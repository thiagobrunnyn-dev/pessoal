import {getOperator} from '../../../lib/app-access';
import {hubData} from '../../../lib/hub-data';
import {RequestError} from '../../../lib/http-security';
import {noCache} from '../../../lib/maintenance';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const owner=await getOperator();if(!owner)return Response.json({error:'Acesso restrito à gestão autorizada.'},{status:401,headers:noCache});return Response.json(await hubData(owner.ownerId,new URL(request.url).searchParams),{headers:noCache});}catch(e){return Response.json({error:e instanceof RequestError?e.message:'Não foi possível carregar o resumo operacional.'},{status:e instanceof RequestError?e.status:503,headers:noCache});}}
