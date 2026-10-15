import {requireOperator} from '../../lib/app-access';
import {archivedList} from '../../lib/archive';
import ArchivedCatalog from './archived-catalog';

export const dynamic='force-dynamic';
export const metadata={title:'Cadastros arquivados'};
export default async function Page(){
 const op=await requireOperator('/arquivados');
 return <ArchivedCatalog displayName={op.actor.fullName||op.actor.displayName} initialData={await archivedList(op,'property').catch(()=>null)}/>;
}
