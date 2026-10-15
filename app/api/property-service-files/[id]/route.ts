import {getOperator} from '../../../../lib/app-access';
import {propertyServiceFile} from '../../../../lib/property-service-reports';
import {RequestError} from '../../../../lib/http-security';
import {noCache} from '../../../../lib/maintenance';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const op=await getOperator();if(!op)return new Response('Acesso restrito',{status:401,headers:noCache});return await propertyServiceFile(op,(await params).id);}catch(e){return new Response(e instanceof RequestError?e.message:'Arquivo indisponível.',{status:e instanceof RequestError?e.status:503,headers:noCache});}}
