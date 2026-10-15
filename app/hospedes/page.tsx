import {requireOperator} from '../../lib/app-access';
import PeopleDirectory from '../pessoas/people-directory';
export const dynamic='force-dynamic';
export const metadata={title:'Cadastro de hóspedes · Mobiliza'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const query=await searchParams,view=query.view==='archived'?'archived':query.view==='trash'?'trash':'active',op=await requireOperator('/hospedes');return <PeopleDirectory guests key={view} view={view} displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title}/>;}
