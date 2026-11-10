import {canAdminister,getOperator} from '../../../../lib/app-access';
import {OwnerCleaning,TeamCleaning} from '../../../cleaning';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params,op=await getOperator();return op?<OwnerCleaning key={id} locationId={id} displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} canManageAccess={canAdminister(op)}/>:<TeamCleaning key={id} locationId={id}/>;}
