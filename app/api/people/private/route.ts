import {getOperator} from '../../../../lib/app-access';
import {personPrivateDetails} from '../../../../lib/person-profiles';
import {RequestError} from '../../../../lib/http-security';
import {noCache} from '../../../../lib/maintenance';

export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{...noCache,'Referrer-Policy':'no-referrer'}});

export async function GET(request:Request){
 try{
  const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);
  return reply(await personPrivateDetails(op,new URL(request.url).searchParams.get('id')||''));
 }catch(error){return reply({error:error instanceof RequestError?error.message:'Não foi possível carregar os dados privados.'},error instanceof RequestError?error.status:503);}
}
