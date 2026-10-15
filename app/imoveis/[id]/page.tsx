import {ArrowLeft} from 'lucide-react';
import {notFound} from 'next/navigation';
import {requireOperator,recheckOperator,operatorGuard} from '../../../lib/app-access';
import {first} from '../../../lib/maintenance';
import {propertyNumber} from '../../../lib/property-number';
import {PropertyLocation} from '../../components/service-location';
import PropertyFurniture from '../../components/property-furniture';
import GuestChannelSetting from '../../components/guest-channel-setting';
import PropertyServiceSummary from '../../components/property-service-summary';
import {PropertyOccupancy} from '../../occupancy';
import PropertyInspections from '../../components/property-inspections';
export const dynamic='force-dynamic';
export const metadata={title:'Ficha do imóvel'};
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const op=await requireOperator('/imoveis/'+encodeURIComponent(id));
 const property=await first('SELECT id,control_number FROM properties WHERE id=? AND owner_id=?',id,op.ownerId);
 if(!property)notFound();
 await recheckOperator(op);const guard=operatorGuard(op);
 if(!await first('SELECT 1 allowed WHERE '+guard.sql,...guard.args))notFound();
 return <><header className="topbar"><a className="brand" href="/"><img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza Facilities"/><span>MOBILIZA GESTÃO<br/><strong>Imóveis</strong></span></a><span className="clean-header-label">{op.actor.fullName||op.actor.displayName}</span></header><main className="shell property-sheet"><a className="nav-back" href="/imoveis"><ArrowLeft size={19}/>Voltar aos imóveis</a><section className="page-title"><div><div className="eyebrow">CADASTRO COMPARTILHADO</div><h1>{propertyNumber(property.control_number)?'Imóvel '+propertyNumber(property.control_number):'Ficha do imóvel'}</h1><p>Dados do imóvel, hospedagem, mobília e vistorias.</p></div></section><PropertyLocation propertyId={id} title="Dados do imóvel" showFurnitureLink={false}/><section id="hospedagem"><PropertyOccupancy propertyId={id}/></section><section id="mobilia"><PropertyFurniture propertyId={id}/></section><PropertyServiceSummary propertyId={id}/><GuestChannelSetting key={id} propertyId={id}/><PropertyInspections propertyId={id}/></main></>;
}
