import {getOperator} from '../../../lib/app-access';
import {muralList,muralHistory,saveMural} from '../../../lib/mural-documents';
import {boundedForm,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {noCache} from '../../../lib/maintenance';
import {MURAL_FORM_LIMIT} from '../../../lib/mural-pdf';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:noCache});
export async function GET(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);const query=new URL(request.url).searchParams;return reply(query.has('document_id')?await muralHistory(op,query.get('document_id')!,query):await muralList(op,query));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível carregar os documentos.'},e instanceof RequestError?e.status:503);}}
export async function POST(request:Request){try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);requireSameOrigin(request);return reply(await saveMural(op,await boundedForm(request,MURAL_FORM_LIMIT)));}catch(e){return reply({error:e instanceof RequestError?e.message:'O resultado do envio ainda não foi confirmado. Tente conferir o mesmo envio.'},e instanceof RequestError?e.status:503);}}
