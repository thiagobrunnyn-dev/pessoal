import {redirect} from 'next/navigation';
import type {Metadata} from 'next';
import {requireOperator} from '../../lib/app-access';
import {controlData} from '../../lib/control-data';
import Control from '../control';
export const metadata:Metadata={title:'Centrais de ar'};
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const query=await searchParams||{};const op=await requireOperator('/centrais');if(query.new==='property')redirect('/imoveis?new=property');return <Control key="central-list" initialNewProperty={query.new==='property'} initialData={await controlData(op.ownerId).catch(()=>null)} displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} canManageAccess={op.role==='owner'}/>;}
