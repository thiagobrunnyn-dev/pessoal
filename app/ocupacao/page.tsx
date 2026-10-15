import {redirect} from 'next/navigation';
import {requireOperator} from '../../lib/app-access';
import {isRegionalRequest} from '../../lib/regional-access';
import Occupancy from '../occupancy';
export const dynamic='force-dynamic';
export const metadata={title:'Ocupação dos alojamentos · MBL'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams,op=await requireOperator('/ocupacao');
 if(typeof query.property_id==='string')redirect('/imoveis/'+encodeURIComponent(query.property_id)+'#hospedagem');
 return <Occupancy displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} guestIntent={query.intent==='guest'} regional={isRegionalRequest()} initialPropertyId={typeof query.property_id==='string'?query.property_id:''}/>;
}
