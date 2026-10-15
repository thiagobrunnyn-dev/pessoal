import {equipmentPublicPhoto,publicEquipmentHeaders} from '../../../../../../lib/equipment-public';
import {RequestError} from '../../../../../../lib/http-security';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string;photoId:string}>}){try{const {id,photoId}=await params;return await equipmentPublicPhoto(id,photoId);}catch(e){return new Response(e instanceof RequestError?e.message:'Foto temporariamente indisponível.',{status:e instanceof RequestError?e.status:503,headers:publicEquipmentHeaders});}}
