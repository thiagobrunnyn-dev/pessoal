import {getOperator} from '../../../lib/app-access';
import {todayData} from '../../../lib/today-data';
import {noCache} from '../../../lib/maintenance';
export const dynamic='force-dynamic';
export async function GET(request:Request){const op=await getOperator();if(!op)return Response.json({error:'Acesso restrito à gestão autorizada.'},{status:401,headers:noCache});try{const p=new URL(request.url).searchParams;return Response.json(await todayData(op.ownerId,{view:p.get('view')||'',source:p.get('source')||'',responsible:p.get('responsible')||'',search:p.get('search')||'',offset:Number(p.get('offset')||0)}),{headers:noCache});}catch{return Response.json({error:'Não foi possível carregar as tarefas. Tente novamente.'},{status:503,headers:noCache});}}
