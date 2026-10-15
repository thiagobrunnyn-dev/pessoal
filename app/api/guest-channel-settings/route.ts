import {getOperator} from '../../../lib/app-access';
import {guestChannelSetting,saveGuestChannel} from '../../../lib/guest-channel-management';
import {boundedJson,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {GUEST_HEADERS} from '../../../lib/guest-channel-public';
export const dynamic='force-dynamic';
const reply=(b:unknown,status=200)=>Response.json(b,{status,headers:GUEST_HEADERS});
export async function GET(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito.'},401);return reply(await guestChannelSetting(op,new URL(request.url).searchParams.get('property_id')||''));}catch(e){return reply({error:e instanceof RequestError?e.message:'Canal indisponível.'},e instanceof RequestError?e.status:503);}}
export async function POST(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito.'},401);requireSameOrigin(request);return reply(await saveGuestChannel(op,await boundedJson(request,1500)));}catch(e){return reply({error:e instanceof RequestError?e.message:'Resultado ainda não confirmado. Confira este mesmo envio.',code:e instanceof RequestError?(e as RequestError & {code?:string}).code:undefined},e instanceof RequestError?e.status:503);}}
