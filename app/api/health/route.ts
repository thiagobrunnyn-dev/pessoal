import {env} from '../../../lib/runtime/env';
export const dynamic='force-dynamic';
/** Verificação de saúde para o Docker/Caddy. Não expõe detalhes internos. */
export async function GET(){
 try{await env.DB!.prepare('SELECT 1').first();return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});}
}
