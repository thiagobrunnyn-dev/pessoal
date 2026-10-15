import {resolveOperationFilters} from '../../../lib/operation-filters';
import {RequestError} from '../../../lib/http-security';
import {dashboardData} from '../../../lib/dashboard-data';
import {getOperator} from '../../../lib/app-access';
import {noCache} from '../../../lib/maintenance';
import {belemToday,periodBounds,type Period} from '../../../lib/dashboard-period';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>Response.json(d,{status,headers:noCache});
export async function GET(request:Request){
 try{const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);
 const query=new URL(request.url).searchParams;let period;try{period=periodBounds((query.has('period')?query.get('period')!:'week') as Period,query.has('date')?query.get('date')!:belemToday());}catch{return reply({error:'Selecione um período e uma data válidos.'},400);}const {start,end}=period,owner=op.ownerId;
 const resolved=await resolveOperationFilters(owner,query);return reply(await dashboardData(owner,period,resolved.filters));
 }catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível carregar os gráficos.'},e instanceof RequestError?e.status:503);}
}
