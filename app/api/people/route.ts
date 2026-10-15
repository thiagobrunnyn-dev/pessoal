import {getOperator} from '../../../lib/app-access';
import {personDirectory,savePersonProfile} from '../../../lib/person-profiles';
import {boundedForm,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {first,noCache} from '../../../lib/maintenance';

export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:noCache});

export async function GET(request?:Request){
 try{
  const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);
  return reply(await personDirectory(op,!!request&&new URL(request.url).searchParams.get('registry')==='guests'));
 }catch(error){return reply({error:error instanceof RequestError?error.message:'Não foi possível carregar as pessoas.'},error instanceof RequestError?error.status:503);}
}

export async function POST(request:Request){
 try{
  const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);
  requireSameOrigin(request);
  const form=await boundedForm(request,4*1024*1024+32*1024),guestRegistry=new URL(request.url).searchParams.get('registry')==='guests';
  if(guestRegistry){if(form.get('action')==='create'){if(form.get('directory')!=='guest')throw new RequestError('Use o cadastro de hóspedes.');}else if(!await first("SELECT id FROM person_profiles WHERE id=? AND owner_id=? AND directory='guest'",form.get('id'),op.ownerId))throw new RequestError('Hóspede não encontrado.',404);}
  return reply(await savePersonProfile(op,form,guestRegistry?{guestCreate:true}:undefined));
 }catch(error){return reply({error:error instanceof RequestError?error.message:'Não foi possível salvar. Os dados e a foto selecionada foram mantidos.'},error instanceof RequestError?error.status:503);}
}
