import {getOperator} from '../../../../../lib/app-access';
import {muralFile} from '../../../../../lib/mural-documents';
import {RequestError} from '../../../../../lib/http-security';
import {MURAL_FILE_HEADERS} from '../../../../../lib/mural-pdf';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const op=await getOperator();if(!op)throw new RequestError('Acesso restrito à gestão autorizada.',401);return await muralFile(op,(await params).id);}catch(e){return new Response(e instanceof RequestError?e.message:'Arquivo indisponível.',{status:e instanceof RequestError?e.status:503,headers:{...MURAL_FILE_HEADERS,'Content-Type':'text/plain; charset=utf-8'}});}}
