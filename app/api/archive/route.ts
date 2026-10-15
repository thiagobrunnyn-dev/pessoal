import {getOperator,recheckOperator} from '../../../lib/app-access';
import {clean,noCache} from '../../../lib/maintenance';
import {boundedJson,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {applyArchive,archiveEntity,archivedList,archiveView} from '../../../lib/archive';

export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:noCache});

export async function GET(request:Request){
 try{
  const op=await getOperator();
  if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);
  const query=new URL(request.url).searchParams,entity=archiveEntity(query.get('entity'));
  if(query.get('list')==='1')return reply(await archivedList(op,entity,query.has('offset')?Number(query.get('offset')):0));
  const id=clean(query.get('id'),80);
  if(!id)throw new RequestError('Selecione um cadastro.');
  return reply(await archiveView(op,entity,id));
 }catch(error){return reply({error:error instanceof RequestError?error.message:'Não foi possível consultar os cadastros arquivados.'},error instanceof RequestError?error.status:503);}
}

export async function POST(request:Request){
 try{
  const op=await getOperator();
  if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);
  requireSameOrigin(request);
  const body=await boundedJson(request,8000);
  if(!body||typeof body!=='object'||Array.isArray(body))throw new RequestError('Formulário inválido.');
  await recheckOperator(op);
  return reply(await applyArchive(op,body));
 }catch(error){return reply({error:error instanceof RequestError?error.message:'Não foi possível confirmar a ação. O formulário foi preservado; tente novamente.'},error instanceof RequestError?error.status:503);}
}
