import {requireOperator} from '../../lib/app-access';
import {providerList} from '../../lib/service-providers';
import Providers from './providers';
export const dynamic='force-dynamic';
export const metadata={title:'Prestadores de serviço'};
export default async function Page(){const op=await requireOperator('/prestadores');return <Providers displayName={op.actor.fullName||op.actor.displayName} initialData={await providerList(op).catch(()=>null)}/>;}
