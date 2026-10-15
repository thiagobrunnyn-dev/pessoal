import {getOperator} from '../../../lib/app-access';
import {providerList,providerDetail,saveProvider} from '../../../lib/service-providers';
import {boundedJson,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {noCache} from '../../../lib/maintenance';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:noCache});
export async function GET(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);const q=new URL(request.url).searchParams;return reply(q.has('id')?await providerDetail(op,q.get('id')!):await providerList(op,q.get('view')==='archived'));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível consultar os prestadores.'},e instanceof RequestError?e.status:503);}}
export async function POST(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);requireSameOrigin(request);return reply(await saveProvider(op,await boundedJson(request,8192)));}catch(e){return reply({error:e instanceof RequestError?e.message:'O resultado ainda não foi confirmado. Confira este mesmo envio antes de tentar outro.'},e instanceof RequestError?e.status:503);}}
