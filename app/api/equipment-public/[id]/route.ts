import {equipmentPublicData,publicEquipmentHeaders} from '../../../../lib/equipment-public';
import {RequestError} from '../../../../lib/http-security';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params,p=new URL(request.url).searchParams.get('page')||'0';if(!/^\d{1,4}$/.test(p))throw new RequestError('Página inválida.');return Response.json(await equipmentPublicData(id,Number(p)),{headers:publicEquipmentHeaders});}catch(e){return Response.json({error:e instanceof RequestError?e.message:'Consulta temporariamente indisponível.'},{status:e instanceof RequestError?e.status:503,headers:publicEquipmentHeaders});}}
