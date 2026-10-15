import {requireOperator} from '../../lib/app-access';
import {todayData} from '../../lib/today-data';
import Today from '../today';
export const metadata={title:'Hoje · MBL'};
export const dynamic='force-dynamic';
export default async function Page(){const op=await requireOperator('/hoje');return <Today displayName={op.actor.fullName||op.actor.displayName} initialData={await todayData(op.ownerId).catch(()=>null)}/>;}
