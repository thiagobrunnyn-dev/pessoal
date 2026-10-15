import {Building2,ChartNoAxesCombined} from 'lucide-react';
import type {HubSummary,ServiceSource,ServiceStatus} from '../../lib/hub-data';

const sources:{key:ServiceSource;label:string;href:string}[]=[
 {key:'orders',label:'Manutenção geral',href:'/ordens'},
 {key:'air',label:'Centrais de ar',href:'/centrais'},
 {key:'cleaning',label:'Limpeza',href:'/limpeza'},
];
const statusLabels:Record<ServiceStatus,string>={open:'Abertos',in_progress:'Em andamento',pending:'Com pendência / parados',completed:'Concluídos',not_performed:'Não realizados'};
const width=(value:number,max:number)=>`${Math.max(0,Math.min(100,max>0?value/max*100:0))}%`;

/** Native bars share the Hub payload: no chart library, extra request, images or animation. */
export default function HubCharts({data,loading=false}:{data:HubSummary|null;loading?:boolean}){
 const occupancy=data?.charts?.occupancy,services=data?.charts?.services;
 const occupancyMax=Math.max(1,...(occupancy||[]).map(p=>Math.max(p.guests,p.capacity??0)));
 const servicesMax=Math.max(1,...(services||[]).map(s=>s.total));
 const servicesTotal=services?.reduce((sum,s)=>sum+s.total,0);
 const hasRooms=occupancy?.some(p=>p.room_count>0);
 return <section className="hub-charts" aria-label="Gráficos da operação" aria-busy={loading}>
  <article className="hub-chart-panel" aria-labelledby="occupancy-chart-title">
   <header className="hub-chart-header"><div><span className="hub-chart-kicker"><Building2 size={16}/>Hospedagem</span><h2 id="occupancy-chart-title">Ocupação por imóvel</h2></div><a href="/ocupacao" className="hub-chart-total"><strong>{data?.occupancy.guests??'—'}</strong><span>hóspedes</span></a></header>
   {!occupancy?<p className="hub-chart-empty" role="status">{loading?'Carregando ocupação…':'Ocupação indisponível. Atualize para consultar.'}</p>:occupancy.length===0?<p className="hub-chart-empty">Sem registros de imóveis.</p>:<>
    <div className="hub-chart-legend"><span><i className="chart-occupied"/>Ocupadas</span><span><i className="chart-available"/>Disponíveis</span></div>
    {!hasRooms&&<p className="hub-chart-note">Sem registros de quartos. Capacidade a confirmar.</p>}
    <div className="hub-occupancy-plot" role="region" tabIndex={0} aria-label="Ocupação de todos os imóveis; role para ver a lista completa">
     {occupancy.map(p=><a className="hub-occupancy-row" key={p.property_id} href={'/ocupacao?property_id='+encodeURIComponent(p.property_id)}>
      <span className="hub-chart-row-heading"><span>{p.control_number!==null&&<b>{String(p.control_number).padStart(2,'0')} · </b>}{p.name}</span><strong>{p.guests}<span> ocupadas</span></strong></span>
      <span className={'hub-chart-track'+(p.capacity===null?' capacity-unknown':'')} aria-hidden="true"><span className="chart-occupied" style={{width:width(p.guests,occupancyMax)}}/>{p.available!==null&&<span className="chart-available" style={{width:width(p.available,occupancyMax)}}/>}</span>
      <span className="hub-chart-row-meta">{p.available===null?'Vagas disponíveis: a confirmar':`${p.available} disponíveis · ${p.capacity} vagas confirmadas`}</span>
     </a>)}
    </div>
    <div className="hub-chart-axis" aria-hidden="true"><span>0</span><span>{occupancyMax===1&&!occupancy.some(p=>p.capacity||p.guests)?'Vagas por imóvel':occupancyMax+' vagas'}</span></div>
    {data.occupancy.unknown_properties>0&&hasRooms&&<p className="hub-chart-note">Capacidade a confirmar em {data.occupancy.unknown_properties} {data.occupancy.unknown_properties===1?'imóvel':'imóveis'}.</p>}
   </>}
  </article>
  <article className="hub-chart-panel" aria-labelledby="services-chart-title">
   <header className="hub-chart-header"><div><span className="hub-chart-kicker"><ChartNoAxesCombined size={16}/>Serviços</span><h2 id="services-chart-title">Situação dos serviços</h2></div><a className="hub-chart-total" href="/hoje"><strong>{data?.pending.total??'—'}</strong><span>pendentes</span></a></header>
   {!services?<p className="hub-chart-empty" role="status">{loading?'Carregando serviços…':'Serviços indisponíveis. Atualize para consultar.'}</p>:<>
    <div className="hub-chart-legend hub-service-legend">{sources.map(source=><a href={source.href} key={source.key}><i className={'chart-'+source.key}/>{source.label}</a>)}</div>
    {servicesTotal===0?<p className="hub-chart-empty">Sem registros de serviços.</p>:<div className="hub-service-plot">
     {services.map(row=><details className="hub-service-row" key={row.status}>
      <summary aria-label={`${statusLabels[row.status]}: ${row.total}. Ver por área.`}><span className="hub-chart-row-heading"><span>{statusLabels[row.status]}</span><strong>{row.total}</strong></span><span className="hub-chart-track" aria-hidden="true">{sources.map(source=><span className={'chart-'+source.key} key={source.key} style={{width:width(row[source.key],servicesMax)}}/>)}</span></summary>
      <div className="hub-chart-source-detail">{sources.map(source=><a href={source.href} key={source.key}>{source.label}<strong>{row[source.key]}</strong></a>)}</div>
     </details>)}
     <div className="hub-chart-axis" aria-hidden="true"><span>0</span><span>{servicesMax} registros</span></div>
    </div>}
    <p className="hub-chart-note">OS atuais e último registro real de cada central ou local/frequência de limpeza. Testes excluídos. Concluído indica execução declarada.</p>
   </>}
  </article>
 </section>;
}
