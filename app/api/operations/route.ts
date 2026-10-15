import {getOperator} from '../../../lib/app-access';
import {operationDescriptor,saveOperation} from '../../../lib/operations';
import {boundedJson,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {noCache} from '../../../lib/maintenance';
export const dynamic='force-dynamic';const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:noCache});
export async function GET(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);const p=new URL(request.url).searchParams;return reply(await operationDescriptor(op.ownerId,p.get('kind')||'',p.get('type')||'',p.get('id')||'',p.get('routine')||''));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível abrir. Tente novamente.'},e instanceof RequestError?e.status:503);}}
export async function POST(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);requireSameOrigin(request);return reply(await saveOperation(op,await boundedJson(request,8192)));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível salvar. Os campos foram mantidos.'},e instanceof RequestError?e.status:503);}}
