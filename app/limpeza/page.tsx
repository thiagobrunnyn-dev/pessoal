import {requireOperator} from '../../lib/app-access';
import {OwnerCleaning} from '../cleaning';
export const dynamic='force-dynamic';
export default async function Page(){const op=await requireOperator('/limpeza');return <OwnerCleaning key="cleaning-list" displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} canManageAccess={op.role==='owner'}/>;}
