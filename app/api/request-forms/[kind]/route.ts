import {publicFormData,submitIntake,GUEST_HEADERS} from '../../../../lib/request-intake-public';
import {guestLimit} from '../../../../lib/guest-channel-public';
import {intakeKind} from '../../../../lib/request-intake-model';
import {boundedForm,requireSameOrigin,RequestError} from '../../../../lib/http-security';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:GUEST_HEADERS});
export async function GET(_request:Request,{params}:{params:Promise<{kind:string}>}){try{return reply(publicFormData((await params).kind));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível abrir o formulário.'},e instanceof RequestError?e.status:503);}}
export async function POST(request:Request,{params}:{params:Promise<{kind:string}>}){try{requireSameOrigin(request);const kind=intakeKind((await params).kind);await guestLimit(request,'general:'+kind,'submit');return reply(await submitIntake(request,kind,await boundedForm(request,13*1024*1024)));}catch(e){return reply({error:e instanceof RequestError?e.message:'O recebimento ainda não foi confirmado. Confira este mesmo envio antes de iniciar outro.'},e instanceof RequestError?e.status:503);}}
