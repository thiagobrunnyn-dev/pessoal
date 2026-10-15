import {guestChannelData,guestChannelAccess,guestLimit,submitGuest,GUEST_HEADERS} from '../../../../lib/guest-channel-public';
import {boundedForm,requireSameOrigin,RequestError} from '../../../../lib/http-security';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:GUEST_HEADERS});
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){try{return reply(await guestChannelData((await params).token));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível abrir o canal.'},e instanceof RequestError?e.status:503);}}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){try{requireSameOrigin(request);const token=(await params).token,c=await guestChannelAccess(token);await guestLimit(request,c.id,'submit');return reply(await submitGuest(request,token,await boundedForm(request,13*1024*1024)));}catch(e){return reply({error:e instanceof RequestError?e.message:'O recebimento ainda não foi confirmado. Confira este mesmo envio antes de iniciar outro.'},e instanceof RequestError?e.status:503);}}
