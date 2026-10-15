import {getOperator} from '../../../../lib/app-access';
import {intakeFile} from '../../../../lib/request-intake-management';
import {RequestError} from '../../../../lib/http-security';
import {GUEST_HEADERS} from '../../../../lib/guest-channel-public';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const op=await getOperator();if(!op)throw new RequestError('Acesso restrito à gestão autorizada.',401);return await intakeFile(op,(await params).id);}catch(e){return Response.json({error:e instanceof RequestError?e.message:'Arquivo indisponível.'},{status:e instanceof RequestError?e.status:503,headers:GUEST_HEADERS});}}
