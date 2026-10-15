import {getOperator} from '../../../../lib/app-access';
import {initializePersonNumbers} from '../../../../lib/person-numbering';
import {boundedJson, requireSameOrigin, RequestError} from '../../../../lib/http-security';
import {noCache} from '../../../../lib/maintenance';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:noCache});
  try{
    const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);
    requireSameOrigin(request);
    const body=await boundedJson(request,512);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||body.action!=='initialize_numbers')throw new RequestError('Solicitação inválida.');
    return reply(await initializePersonNumbers(op));
  }catch(error){return reply({error:error instanceof RequestError?error.message:'Não foi possível confirmar a numeração. Atualize a lista ou tente novamente; números já atribuídos serão preservados.'},error instanceof RequestError?error.status:503);}
}
