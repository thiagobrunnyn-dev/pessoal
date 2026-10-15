import {isRegionalRequest} from '../../lib/regional-access';
import {requireOperator} from '../../lib/app-access';
import {handoverData} from '../../lib/handover-data';
import Handovers from '../handovers';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const query=await searchParams;const op=await requireOperator('/entregas');return <Handovers initialTab={!isRegionalRequest()&&query.tab==='clients'?'clients':'deliveries'} initialData={await handoverData(op.ownerId).catch(()=>null)} displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title}/>;}
