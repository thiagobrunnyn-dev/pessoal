import {ArrowLeft} from 'lucide-react';
import {notFound} from 'next/navigation';
import {requireOperator} from '../../../lib/app-access';
import {isRegionalRequest} from '../../../lib/regional-access';
import PropertyImport from '../../property-import';
export const dynamic='force-dynamic';
export const metadata={title:'Importar imóveis'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const op=await requireOperator('/imoveis/importar');if(isRegionalRequest())notFound();
 const query=await searchParams,initialBatchId=typeof query.batch==='string'?query.batch:'';
 return <><header className="topbar"><a className="brand" href="/"><img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza Facilities"/><span>MOBILIZA GESTÃO<br/><strong>Importar imóveis</strong></span></a><span className="clean-header-label">{op.actor.fullName||op.actor.displayName}</span></header><main className="shell"><a className="nav-back" href="/imoveis"><ArrowLeft size={19}/>Voltar aos imóveis</a><PropertyImport initialBatchId={initialBatchId}/></main></>;
}
