import {requireOperator} from '../../lib/app-access';
import {propertyServiceList} from '../../lib/property-service-reports';
import Services from './services';
export const dynamic='force-dynamic';
export const metadata={title:'Serviços e laudos'};
export default async function Page({searchParams}:{searchParams:Promise<{property_id?:string;kind?:string;new?:string}>}){const q=await searchParams,op=await requireOperator('/servicos-laudos');const propertyId=typeof q.property_id==='string'?q.property_id:'';return <Services displayName={op.actor.fullName||op.actor.displayName} propertyId={propertyId} initialNew={q.new==='1'} initialData={await propertyServiceList(op,new URLSearchParams(propertyId?{property_id:propertyId}:{})).catch(()=>null)}/>;}
