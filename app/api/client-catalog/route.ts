import {getOperator,recheckOperator} from '../../../lib/app-access';
import {clientCatalog} from '../../../lib/client-catalog';
import {isRegionalRequest} from '../../../lib/regional-access';
import {noCache} from '../../../lib/maintenance';
import {RequestError} from '../../../lib/http-security';
export const dynamic='force-dynamic';
export async function GET(){try{const op=await getOperator();if(!op)return Response.json({error:'Entre com uma conta autorizada.'},{status:401,headers:noCache});const data=await clientCatalog(op.ownerId);await recheckOperator(op);return Response.json({...data,regional:isRegionalRequest()},{headers:noCache});}catch(e){return Response.json({error:e instanceof RequestError?e.message:'Não foi possível atualizar empresas e centros de custo.'},{status:e instanceof RequestError?e.status:503,headers:noCache});}}
