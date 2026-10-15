'use client';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {CalendarDays,RefreshCw} from 'lucide-react';
import type {LodgingReport} from '../../lib/lodging-report';
import {occupancyDate} from '../occupancy-model';

export default function LodgingReportPanel({today,propertyId='',refreshKey=''}:{today:string;propertyId?:string;refreshKey?:string}){
 const monthEnd=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).toISOString().slice(0,10);
 const [from,setFrom]=useState(today.slice(0,7)+'-01'),[to,setTo]=useState(monthEnd);
 const [range,setRange]=useState({from,to}),[client,setClient]=useState(''),[center,setCenter]=useState(''),[group,setGroup]=useState<'people'|'properties'|'companies'>('people');
 const [report,setReport]=useState<LodgingReport|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
 const query=useMemo(()=>{const q=new URLSearchParams({report:'nights',from:range.from,to:range.to});if(propertyId)q.set('property_id',propertyId);if(client)q.set('client_id',client);if(center)q.set('cost_center_id',center);return q.toString();},[range,propertyId,client,center]);
 useEffect(()=>{const controller=new AbortController();let active=true;setLoading(true);setError('');setReport(null);
  fetch('/api/occupancy?'+query,{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async response=>{const data=await response.json() as LodgingReport & {error?:string};if(!response.ok)throw new Error(data.error||'Não foi possível calcular as diárias.');if(!data||!data.totals||!Array.isArray(data.clients)||!Array.isArray(data.cost_centers)||!Array.isArray(data.people)||!Array.isArray(data.properties)||!Array.isArray(data.companies))throw new Error('O relatório não pôde ser confirmado.');if(active)setReport(data);}).catch(cause=>{if(active&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Não foi possível calcular as diárias.');}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[query,refresh,refreshKey]);
 function apply(event:FormEvent){event.preventDefault();if(!from||!to||from>to){setError('Confira as datas inicial e final do período.');return;}setRange({from,to});setClient('');setCenter('');setRefresh(n=>n+1);}
 const rows=report?.[group]||[];
 return <details className="occ-report occ-panel" open>
  <summary><CalendarDays size={20} aria-hidden="true"/><span>Diárias por período</span></summary>
  <p className="occ-help">Uma diária por pessoa e por noite. Entrada dia 8 e saída dia 10 = 2 diárias; entrada e saída no mesmo dia = 0.</p>
  <form className="occ-report-period" onSubmit={apply}><label className="field"><span>De (inclusive)</span><input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="field"><span>Até (inclusive)</span><input type="date" required value={to} onChange={e=>setTo(e.target.value)}/></label><button className="button secondary" type="submit" disabled={loading}><RefreshCw size={17}/>{loading?'Calculando…':'Calcular período'}</button></form>
  <div className="occ-report-filters"><label className="field"><span>Empresa</span><select value={client} disabled={loading} onChange={e=>{setClient(e.target.value);setCenter('');}}><option value="">Todas as empresas e vínculos pendentes</option>{report?.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field"><span>Centro de custo</span><select value={center} disabled={loading} onChange={e=>setCenter(e.target.value)}><option value="">Todos os centros de custo</option>{report?.cost_centers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field"><span>Agrupar</span><select value={group} onChange={e=>setGroup(e.target.value as typeof group)}><option value="people">Por colaborador</option><option value="properties">Por imóvel</option><option value="companies">Por empresa</option></select></label></div>
  {loading&&<p className="occ-state" role="status">Calculando as diárias…</p>}
  {error&&<div className="occ-error" role="alert"><p>{error}</p><button type="button" className="button secondary" onClick={()=>setRefresh(n=>n+1)}>Tentar novamente</button></div>}
  {report&&<><p className="occ-help">Noites iniciadas de {occupancyDate(report.from)} a {occupancyDate(report.to)}, inclusive. A data do check-out não conta. Realizadas: até ontem, no horário de Belém. Previstas: de hoje até o check-out previsto, somente em hospedagens abertas.</p>
   <div className="occ-report-totals"><div><strong>{report.totals.realized.toLocaleString('pt-BR')}</strong><span>Diárias realizadas</span></div><div><strong>{report.totals.forecast.toLocaleString('pt-BR')}</strong><span>Diárias previstas</span></div><div><strong>{report.totals.unknown_entry}</strong><span>Hospedagens com check-in a confirmar</span></div></div>
   {!!report.totals.unknown_entry&&<p className="occ-info">{report.totals.unknown_entry} hospedagem(ns) sem data de entrada não entram nas somas. O horário do cadastro não substitui a chegada.</p>}
   {!!report.totals.without_forecast&&<p className="occ-help">{report.totals.without_forecast} hospedagem(ns) aberta(s) sem previsão de saída. As diárias futuras dessas hospedagens ainda não podem ser calculadas.</p>}
   {rows.length?<div className="occ-report-table-wrap"><table className="occ-report-table"><thead><tr><th scope="col">{group==='people'?'Colaborador':group==='properties'?'Imóvel':'Empresa'}</th><th scope="col">Realizadas</th><th scope="col">Previstas</th><th scope="col">Check-in pendente</th></tr></thead><tbody>{rows.map(row=><tr key={row.key}><th scope="row"><strong>{row.name}</strong>{row.detail&&<span>{row.detail}</span>}</th><td>{row.realized}</td><td>{row.forecast}</td><td>{row.unknown_entry||'—'}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total no filtro</th><td>{report.totals.realized}</td><td>{report.totals.forecast}</td><td>{report.totals.unknown_entry||'—'}</td></tr></tfoot></table></div>:<p className="occ-state">Nenhuma hospedagem neste período e filtro.</p>}
   <p className="occ-help">Empresa e centro de custo são os registrados na entrada. Hospedagens antigas sem esse vínculo ficam identificadas como “Vínculo não registrado”. Este relatório conta noites; não calcula valores de cobrança.</p>
  </>}
 </details>;
}
