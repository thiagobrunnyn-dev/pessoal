import {requireOperator} from '../../lib/app-access';
import WorkOrders from '../work-orders';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const query=await searchParams;const op=await requireOperator('/ordens');return <WorkOrders displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} initialId={typeof query.id==='string'?query.id:undefined}/>;}
