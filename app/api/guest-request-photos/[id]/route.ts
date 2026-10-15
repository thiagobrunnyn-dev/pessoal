import {getOperator} from '../../../../lib/app-access';
import {guestRequestPhoto} from '../../../../lib/guest-channel-management';
import {GUEST_HEADERS} from '../../../../lib/guest-channel-public';
import {RequestError} from '../../../../lib/http-security';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const op=await getOperator();if(!op)throw new RequestError('Acesso restrito.',401);return await guestRequestPhoto(op,(await params).id);}catch(e){return new Response(e instanceof RequestError?e.message:'Foto indisponível.',{status:e instanceof RequestError?e.status:503,headers:GUEST_HEADERS});}}
