import {isRegionalRequest} from '../lib/regional-access';
import {requireOperator} from '../lib/app-access';
import {filtersFromSearchRecord} from '../lib/operation-filter-values';
import {hubData} from '../lib/hub-data';
import Hub from './hub';
export const dynamic='force-dynamic';
export const metadata={title:'Visão Geral da Operação'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const initialQuery=filtersFromSearchRecord(await searchParams||{});const op=await requireOperator('/'+(initialQuery?'?'+initialQuery:''));const summary=await hubData(op.ownerId,new URLSearchParams(initialQuery)).catch(()=>null);return <Hub regional={isRegionalRequest()} initialQuery={initialQuery} initialSummary={summary} displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} canManageAccess={op.role==='owner'}/>;}
