import {filtersFromSearchRecord} from '../../lib/operation-filter-values';
import {requireOperator} from '../../lib/app-access';
import GuestRequests from '../components/guest-requests';
import RequestIntakeInbox from '../components/request-intake-inbox';

export const dynamic = 'force-dynamic';
export const metadata = {title: {absolute: 'Solicitações | MOBILIZA FACILITIES'}};

export default async function Page({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const query = await searchParams;
  const op = await requireOperator('/solicitacoes');
  if (query.overview==='1' || (query.origem!=='imovel' && !query.property_id && !query.id)) return <RequestIntakeInbox displayName={op.actor.fullName || op.actor.displayName} accessTitle={op.title} initialId={typeof query.request_id==='string'?query.request_id:''} initialKind={typeof query.kind==='string'?query.kind:''} initialStatus={typeof query.status==='string'?query.status:''} overviewQuery={query.overview==='1'?filtersFromSearchRecord(query)+'&overview=1'+(typeof query.alert==='string'?'&alert='+encodeURIComponent(query.alert):''):''}/>;
  return <GuestRequests displayName={op.actor.fullName || op.actor.displayName} accessTitle={op.title}
    initialId={typeof query.id === 'string' ? query.id : ''} initialPropertyId={typeof query.property_id === 'string' ? query.property_id : ''}/>;
}
