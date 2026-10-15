import {requireOperator} from '../../lib/app-access';
import Mural from './mural';
export const dynamic='force-dynamic';
export const metadata={title:'Gestão à Vista'};
export default async function Page(){const op=await requireOperator('/gestao-a-vista');return <Mural displayName={op.actor.fullName||op.actor.displayName}/>;}
