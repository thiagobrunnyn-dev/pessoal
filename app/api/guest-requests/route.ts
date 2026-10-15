import {getOperator} from '../../../lib/app-access';
import {guestRequestList,guestRequestDetail,triageGuestRequest} from '../../../lib/guest-channel-management';
import {boundedJson,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {GUEST_HEADERS} from '../../../lib/guest-channel-public';
export const dynamic='force-dynamic';
const reply=(b:unknown,status=200)=>Response.json(b,{status,headers:GUEST_HEADERS});
export async function GET(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);const q=new URL(request.url).searchParams;return reply(q.has('id')?await guestRequestDetail(op,q.get('id')!):await guestRequestList(op,q));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível consultar os envios.'},e instanceof RequestError?e.status:503);}}
export async function POST(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);requireSameOrigin(request);return reply(await triageGuestRequest(op,await boundedJson(request,5000)));}catch(e){return reply({error:e instanceof RequestError?e.message:'Resultado ainda não confirmado. Confira este mesmo envio.',code:e instanceof RequestError?(e as RequestError & {code?:string}).code:undefined},e instanceof RequestError?e.status:503);}}
