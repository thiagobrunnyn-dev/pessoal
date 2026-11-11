'use client';
import AdminMenu from './components/admin-menu';
import HubNavigation from './components/hub-navigation';
import HubRequests from './components/hub-requests';
import HubCharts from './components/hub-charts';
import HubFilters from './components/hub-filters';
import {HubRing,HubSegments} from './components/hub-visuals';
import {hubThemeCookie,type HubTheme} from '../lib/hub-theme';
import {FILTER_KEYS,EMPTY_FILTERS,parseOperationFilters,operationFilterQuery,changeOperationFilter,type FilterKey,type OperationFilterOptions} from '../lib/operation-filter-values';
import {useEffect,useState,useRef} from 'react';
import dynamic from 'next/dynamic';
import {RefreshCw,CalendarDays,Building2,BarChart3,UsersRound,BedDouble,ClipboardList,Moon,Sun} from 'lucide-react';
import './hub.css';
import './hub-theme.css';
const DashboardMetrics=dynamic(()=>import('./dashboard-metrics'),{loading:()=> <p className="muted" role="status">Carregando indicadores…</p>});
import type {HubSummary as Summary} from '../lib/hub-data';
const displayDate=(v:string)=>new Date(v+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC'});
const displayTime=(v:string)=>new Date(v).toLocaleTimeString('pt-BR',{timeZone:'America/Belem',hour:'2-digit',minute:'2-digit'});
export default function Hub({displayName,accessTitle='Sócio-administrador',canManageAccess=true,passwordSession=false,regional=false,initialSummary=null,initialMetrics=null,initialQuery='',initialTheme='dark'}:{initialTheme?:HubTheme;initialQuery?:string;initialSummary?:any;initialMetrics?:any;displayName:string;accessTitle?:string;canManageAccess?:boolean;passwordSession?:boolean;regional?:boolean}){
 const [data,setData]=useState<Summary|null>(initialSummary),[loading,setLoading]=useState(!initialSummary),[error,setError]=useState(''),[reloadKey,setReloadKey]=useState(0),[indicatorsOpen,setIndicatorsOpen]=useState(false),[query,setQuery]=useState(initialQuery),[options,setOptions]=useState<OperationFilterOptions|null>(initialSummary?.filterOptions||null),[theme,setTheme]=useState<HubTheme>(initialTheme);const generation=useRef(0),controller=useRef<AbortController|null>(null),firstLoad=useRef(true),queryRef=useRef(query);queryRef.current=query;
 let filters={...EMPTY_FILTERS};try{filters=parseOperationFilters(new URLSearchParams(query));}catch{/* Invalid URL is kept for an explicit error/clear, never silently applied as global. */}
 async function refresh(currentQuery=query){controller.current?.abort();controller.current=new AbortController();const n=++generation.current,request=controller.current,timer=setTimeout(()=>request.abort(),25000);setLoading(true);setData(null);setError('');try{const expected=parseOperationFilters(new URLSearchParams(currentQuery));const r=await fetch('/api/hub'+(currentQuery?'?'+currentQuery:''),{cache:'no-store',signal:request.signal});const d=await r.json() as Summary&{error?:string};if(n!==generation.current)return;if(!r.ok)throw new Error(d.error||'Resumo indisponível.');if(!d.filters||!d.filterOptions||FILTER_KEYS.some(key=>d.filters[key]!==expected[key]))throw new Error('Não foi possível conferir o recorte. Atualize a página.');setData(d);setOptions(d.filterOptions);}catch(e){if(n===generation.current){setOptions(null);setError((e as Error).name==='AbortError'?'A consulta demorou. Tente atualizar mantendo os filtros.':(e as Error).message);}}finally{clearTimeout(timer);if(n===generation.current)setLoading(false);}}
 function updateQuery(next:string,push=true){if(push){const url=new URL(window.location.href);for(const key of FILTER_KEYS)url.searchParams.delete(key);for(const [key,value]of new URLSearchParams(next))url.searchParams.set(key,value);window.history.pushState(window.history.state,'',url.pathname+url.search+url.hash);}generation.current++;controller.current?.abort();setData(null);setError('');if(next===query)void refresh(next);else setQuery(next);}
 function toggleTheme(){const next:HubTheme=theme==='dark'?'light':'dark';setTheme(next);try{document.cookie=hubThemeCookie(next,window.location.protocol==='https:');}catch{/* The look still changes for this visit. */}}
 function selectFilter(key:FilterKey,value:string){updateQuery(operationFilterQuery(changeOperationFilter(filters,key,value)));}
 useEffect(()=>{const changed=()=>{const url=new URL(window.location.href),next=new URLSearchParams();for(const key of FILTER_KEYS)for(const value of url.searchParams.getAll(key))next.append(key,value);generation.current++;controller.current?.abort();setData(null);setError('');if(next.toString()===queryRef.current)void refresh(next.toString());else setQuery(next.toString());};window.addEventListener('popstate',changed);return()=>window.removeEventListener('popstate',changed);},[]);
 useEffect(()=>{if(!firstLoad.current||!initialSummary)void refresh(query);firstLoad.current=false;let timer:ReturnType<typeof setTimeout>|undefined;const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void refresh(query),150);},shown=(e:PageTransitionEvent)=>{if(e.persisted)schedule();},visible=()=>{if(document.visibilityState==='visible')schedule();};window.addEventListener('focus',schedule);window.addEventListener('pageshow',shown);document.addEventListener('visibilitychange',visible);return()=>{generation.current++;controller.current?.abort();clearTimeout(timer);window.removeEventListener('focus',schedule);window.removeEventListener('pageshow',shown);document.removeEventListener('visibilitychange',visible);};},[query]);
 // Occupancy share uses only properties whose capacity is confirmed, so it never mixes known guests with unknown beds.
 const knownRows=(data?.charts?.occupancy||[]).filter(p=>p.capacity!==null&&p.capacity>0),knownCapacity=knownRows.reduce((sum,p)=>sum+(p.capacity||0),0),occupancyShare=knownCapacity>0?knownRows.reduce((sum,p)=>sum+p.guests,0)/knownCapacity:null;
 const stats=[
  {key:'properties',label:'Imóveis',href:'/imoveis',icon:Building2,value:data?.counts.properties,help:'Cadastros ativos'},
  {key:'guests',label:'Hóspedes alojados',href:'/ocupacao',icon:UsersRound,value:data?.occupancy?.guests,help:occupancyShare===null?'Com registro ativo':Math.round(occupancyShare*100)+'% das vagas confirmadas'},
  {key:'available',label:'Vagas disponíveis',href:'/ocupacao',icon:BedDouble,value:data?.counts.properties===0?'Sem imóveis':data?.occupancy?.available===null?'A confirmar':data?.occupancy?.available,help:!data?.occupancy?'Aguardando leitura':data.counts.properties===0?'Neste filtro':data.occupancy.available===null?'Conferir capacidade':'Capacidade confirmada'},
 ] as const;

 return <div className="hub-workspace" data-theme={theme}>
  <header className="hub-compact-header no-print"><HubNavigation displayName={displayName} accessTitle={accessTitle} regional={regional}/><a className="hub-mobile-brand" href="/" aria-label="MOBILIZA GESTÃO, visão geral"><img src="/icons/symbol-192-v54.png" width={36} height={36} alt=""/><span>MOBILIZA GESTÃO</span></a><div className="hub-header-options"><span className="hub-header-label">Mobiliza Facilities</span><button type="button" className="hub-theme-toggle" aria-pressed={theme==='dark'} title={theme==='dark'?'Mudar para o visual claro':'Mudar para o visual escuro'} onClick={toggleTheme}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}<span>{theme==='dark'?'Visual claro':'Visual escuro'}</span></button>{passwordSession&&<PasswordSignOut/>}<AdminMenu compact canManageAccess={canManageAccess} canManageCatalog={!regional}/></div></header>
  <main className="hub-compact-main"><section className="hub-intro"><div><div className="eyebrow">MOBILIZA GESTÃO</div><h1>Visão Geral da Operação</h1><p>{regional?'Imóveis, hospedagem e serviços do Pará.':'Imóveis, hospedagem e serviços.'}</p></div><div className="hub-intro-actions"><span className={'hub-live'+(loading?' is-busy':data?'':' is-off')}><i aria-hidden="true"/>{loading?'Atualizando…':data?'Atualizado às '+displayTime(data.asOf):'Sem leitura'}</span><a className="button" href="/hoje"><CalendarDays size={18}/>Tarefas de hoje</a><button type="button" className="button secondary" disabled={loading} onClick={()=>{void refresh(query);setReloadKey(k=>k+1);}}><RefreshCw size={17} className={loading?'spin':''}/>{loading?'Atualizando…':'Atualizar'}</button></div></section>
  <HubFilters hasQuery={!!query} filters={filters} options={options} loading={loading} onChange={selectFilter} onClear={()=>updateQuery('')}/>
  {error&&<p className="error" role="alert">{error}</p>}
  <section className="hub-overview hub-operational-overview" aria-label="Resumo da operação" aria-busy={loading}>{stats.map(s=><a className="hub-overview-card" href={s.href} key={s.key}>{s.key==='guests'&&occupancyShare!==null?<span className="hub-stat-icon hub-stat-gauge"><HubRing value={occupancyShare} size={46} stroke={4}/><s.icon size={18}/></span>:<span className="hub-stat-icon"><s.icon size={21}/></span>}<strong className={typeof s.value==='string'?'hub-value-text':''}>{s.value??'—'}</strong><span>{s.label}</span><small>{s.help}</small></a>)}
   <details className="hub-overview-card hub-pending-card"><summary><span className="hub-stat-icon"><ClipboardList size={21}/></span><strong>{data?.pending?.total??'—'}</strong><span>Serviços pendentes</span><small>Ver por área</small>{data?.pending&&data.pending.total>0&&<HubSegments parts={[{key:'orders',label:'Manutenção geral',value:data.pending.orders,tone:'orders'},{key:'air',label:'Centrais de ar',value:data.pending.air,tone:'air'},{key:'cleaning',label:'Limpeza de imóveis',value:data.pending.cleaning,tone:'cleaning'}]}/>}</summary><div className="hub-pending-breakdown">{data?.pending?<><a href="/ordens">Manutenção geral <strong>{data.pending.orders}</strong></a><a href="/centrais">Centrais de ar <strong>{data.pending.air}</strong></a><a href="/limpeza">Limpeza de imóveis <strong>{data.pending.cleaning}</strong></a><small>Ordens abertas, em andamento ou paradas. Nas centrais e limpezas, conta o último registro real de cada aparelho ou local/frequência com pendência ou em andamento.</small></>:<p className="muted">Resumo indisponível. Atualize para consultar.</p>}</div></details>
  </section>
  <HubRequests rows={data?.requests} loading={loading} query={query}/>
  <HubCharts data={data} loading={loading}/>
  <details className="hub-maintenance-summary"><summary><CalendarDays size={20}/><span>Próxima manutenção das centrais</span><strong>{loading&&!data?'Consultando…':!data?'Indisponível':data.nextMaintenance?displayDate(data.nextMaintenance.due_date):'Sem data'}</strong></summary><div className="hub-maintenance-detail">{!data?<p className="muted">Atualize o resumo para conferir a programação.</p>:data.nextMaintenance?<><p><span className={'pill '+(data.nextMaintenance.due_date<data.today?'danger':'neutral')}>{data.nextMaintenance.due_date<data.today?'Vencida':'Programada'}</span></p><h3>{data.nextMaintenance.equipment_name}</h3><p>{data.nextMaintenance.property_name} · {data.nextMaintenance.location}</p><a className="button secondary" href={'/equipamentos/'+data.nextMaintenance.equipment_id}>Ver aparelho</a></>:<p className="muted">Nenhuma data programada. Informe a data inicial ou registre a manutenção no aparelho.</p>}{data&&<p className="hub-air-totals">{data.counts.equipment} centrais cadastradas · {data.counts.overdue} com limpeza vencida</p>}</div></details>
  <details className="hub-indicators" onToggle={event=>setIndicatorsOpen(event.currentTarget.open)}><summary><BarChart3 size={20}/><span>Ver indicadores dos controles</span><small>Dia, semana, quinzena e mês</small></summary>{indicatorsOpen&&<><DashboardMetrics reloadKey={reloadKey} initialData={query?null:initialMetrics} filterQuery={query}/>{data&&<p className="hub-history-total">Histórico das centrais: {data.counts.completed} serviços concluídos registrados, excluindo testes.</p>}</>}</details>
  <footer className="hub-compact-footer">{data&&<p>Resumo atualizado em {new Date(data.asOf).toLocaleString('pt-BR',{timeZone:'America/Belem'})} (Belém).</p>}<details><summary>Avisos e acesso</summary><p>Novidades das centrais e da lavanderia: verificação horária, das 8h às 20h (Belém), no chat. Alertas das centrais: 5 dias antes do vencimento.</p><p>O acesso dos técnicos continua pelo QR e código de visita. A Lavanderia abre o controle existente, com permissão própria.</p></details></footer>
  </main>
 </div>;
}

function PasswordSignOut() {
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState(false);

 async function signOut() {
  setBusy(true);
  setError(false);
  try {
   const response = await fetch('/api/password-session/logout', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
   });
   if (!response.ok) throw new Error();
   window.location.replace('/');
  } catch {
   setError(true);
   setBusy(false);
  }
 }

 return <div>
  <button className="text-button" type="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Saindo…' : 'Sair'}</button>
  {error && <small role="alert">Não foi possível sair. Tente novamente.</small>}
 </div>;
}
