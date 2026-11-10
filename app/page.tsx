import {isRegionalRequest} from '../lib/regional-access';
import {requireOperator} from '../lib/app-access';
import {filtersFromSearchRecord} from '../lib/operation-filter-values';
import {hubData} from '../lib/hub-data';
import {getChatGPTUser} from './chatgpt-auth';
import PublicHome from './components/public-home';
import Hub from './hub';
export const dynamic='force-dynamic';
export const metadata={title:'Mobiliza Facilities'};

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const initialQuery=filtersFromSearchRecord(await searchParams||{});
  const returnTo='/'+(initialQuery?'?'+initialQuery:'');
  if (!await getChatGPTUser()) return <PublicHome teamHref={`/entrar?return_to=${encodeURIComponent(returnTo)}`}/>;

  const op=await requireOperator(returnTo);
  const summary=await hubData(op.ownerId,new URLSearchParams(initialQuery)).catch(()=>null);
  return <Hub regional={isRegionalRequest()} initialQuery={initialQuery} initialSummary={summary} displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} canManageAccess={op.role==='owner'} teamSession={op.actor.teamSession}/>;
}
