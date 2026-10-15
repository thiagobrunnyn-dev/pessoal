import type {Metadata} from 'next';
import {requireOperator} from '../../lib/app-access';
import {controlData} from '../../lib/control-data';
import Control from '../control';
export const metadata:Metadata={title:'Imóveis e endereços'};
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams||{},op=await requireOperator('/imoveis');
 return <Control key="property-list" view="properties" initialNewProperty={query.new==='property'} initialData={await controlData(op.ownerId).catch(()=>null)} displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} canManageAccess={op.role==='owner'}/>;
}
