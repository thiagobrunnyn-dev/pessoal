import {getOperator} from '../../../lib/app-access';
import {propertyServiceList,propertyServiceDetail,savePropertyService} from '../../../lib/property-service-reports';
import {boundedForm,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {noCache} from '../../../lib/maintenance';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:noCache});
export async function GET(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);const q=new URL(request.url).searchParams;return reply(q.has('id')?await propertyServiceDetail(op,q.get('id')!):await propertyServiceList(op,q));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível consultar os serviços.'},e instanceof RequestError?e.status:503);}}
export async function POST(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);requireSameOrigin(request);return reply(await savePropertyService(op,await boundedForm(request,13*1024*1024)));}catch(e){return reply({error:e instanceof RequestError?e.message:'O resultado ainda não foi confirmado. Confira este mesmo envio antes de tentar outro.'},e instanceof RequestError?e.status:503);}}
