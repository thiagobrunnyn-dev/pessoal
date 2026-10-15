'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Native links preserve the tested full-page navigation used throughout this Site. */

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, ArrowRight, BedDouble, Building2, CalendarDays, Check, DoorOpen, House, Pencil, Plus, RefreshCw, Search, Users, X} from 'lucide-react';
import {occupancyCapacityStatus} from '../lib/occupancy';
import type {OccupancyDetail, OccupancyMetrics, OccupancyPropertySummary, OccupancyStay} from '../lib/occupancy';
import {makeOccupancyDraft, occupancyDate, occupancyDraftIssue, occupancyError, occupancyPayload, occupancyPropertyUrl, occupancySlots, occupancyText, occupancyTotals, type OccupancyDraft, type OccupancyEntry} from './occupancy-model';
import './occupancy.css';
import dynamic from 'next/dynamic';
const OccupancyImport=dynamic(()=>import('./components/occupancy-import'));
import LodgingReportPanel from './components/lodging-report';
import OccupancyGuestForm from './components/occupancy-guest-form';

type Catalog = {properties: OccupancyPropertySummary[]; today: string};
type SaveResult = {id: string; event_id: string; revision: number; alreadySaved: boolean};
const number = (value: number) => value.toLocaleString('pt-BR', {maximumFractionDigits: 1});
const ACTION_TITLES = {room_create: 'Cadastrar quarto', room_update: 'Editar quarto', check_in: 'Adicionar hóspede', check_out: 'Registrar check-out real', plan_checkout: 'Salvar previsão de check-out'};

async function occupancyGet<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', credentials: 'same-origin', signal});
  let parsed: unknown;
  try { parsed = await response.json(); } catch { throw new Error('Não foi possível conferir os dados. Tente novamente.'); }
  const body = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  if (!body) throw new Error('Não foi possível conferir os dados. Tente novamente.');
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível carregar a ocupação.');
  return body as T;
}

export default function Occupancy({displayName, accessTitle, regional = false, initialPropertyId = '',guestIntent=false}: {
  displayName: string; accessTitle: string; guestIntent?:boolean; regional?: boolean; initialPropertyId?: string;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [propertyId] = useState(initialPropertyId);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [editing, setEditing] = useState(false),[importOpen,setImportOpen]=useState(false);
  useEffect(()=>{if(new URL(window.location.href).searchParams.has('import_id'))setImportOpen(true);},[]);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try {
      const result = await occupancyGet<Catalog>('/api/occupancy', request.signal);
      if (!result || !Array.isArray(result.properties) || typeof result.today !== 'string') throw new Error('Não foi possível conferir a lista de imóveis. Tente novamente.');
      if (current === generation.current && !request.signal.aborted) setCatalog(result);
    } catch (cause) {
      if (current === generation.current && !request.signal.aborted) setError(occupancyError(cause));
    } finally { if (current === generation.current && !request.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const requests = generation, pending = controller;
    return () => { window.clearTimeout(timer); requests.current++; pending.current?.abort(); };
  }, [load]);
  const query = occupancyText(search.trim());
  const properties = (catalog?.properties || []).filter(property => !query || occupancyText([
    property.name, property.address, property.control_number ?? '', property.state_code ?? '', property.worksite_name ?? '',
  ].join(' ')).includes(query));
  const operational = (catalog?.properties || []).filter(property => !property.archived_at);
  return <>
    <header className="topbar occ-topbar">
      <a className="brand" href="/"><img src="/mobiliza-logo-0cff20bedde7.jpeg" width={48} height={48} alt="Mobiliza Facilities"/><span>MOBILIZA GESTÃO<br/><strong>Ocupação</strong></span></a>
      <span className="clean-header-label">{accessTitle} · {displayName}</span>
    </header>
    <main className="shell occ-shell">
      <a className="nav-back" href="/"><ArrowLeft size={19} aria-hidden="true"/>Voltar ao painel</a>
      <section className="page-title occ-title">
        <div><div className="eyebrow">ALOJAMENTOS E REPÚBLICAS</div><h1>Ocupação dos alojamentos</h1><p>Pessoas, quartos e vagas vinculados aos imóveis da Mobiliza.</p></div>
        <div className="occ-tools"><a className="button secondary" href="/hospedes"><Users size={18} aria-hidden="true"/>Cadastro de hóspedes</a><button type="button" className="button secondary" disabled={!catalog||editing} onClick={()=>setImportOpen(true)}>Importar lista de hóspedes</button></div>
      </section>
      {guestIntent&&<p className="occ-info">{propertyId?'Escolha o quarto e toque em Adicionar hóspede. Você poderá escolher uma pessoa existente ou cadastrar uma nova.':'Para cadastrar um hóspede, escolha primeiro o imóvel. Depois, selecione o quarto e a vaga.'}</p>}
      {regional && <p className="clean-access-note">Imóveis e pessoas do Pará · PA.</p>}{importOpen&&catalog&&<OccupancyImport properties={catalog.properties} onClose={()=>setImportOpen(false)} onSaved={()=>void load()}/>}

      {!propertyId && <>
        <section className="occ-overview" aria-label="Resumo dos alojamentos">
          <div className="occ-section-heading"><div><h2>Visão geral</h2><p>Totais dos imóveis ativos, antes dos filtros.</p></div><button type="button" className="button secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true"/>{loading ? 'Atualizando…' : 'Atualizar'}</button></div>
          {catalog && operational.length > 0 ? <OccupancySummary metrics={occupancyTotals(operational)}/>
            : <p className="occ-state" role="status">{loading ? 'Carregando a ocupação…' : catalog ? 'Ainda não há imóveis ativos para acompanhar.' : 'O resumo está indisponível.'}</p>}
          {catalog && operational.some(property => property.capacity_total === null) && <p className="occ-help">Capacidade a confirmar em {operational.filter(property => property.capacity_total === null).length} imóvel(is). Os totais de vagas e a taxa aparecem após confirmar todos os quartos.</p>}
        </section>
        {error && <div className="occ-error" role="alert"><p>{error}{catalog ? ' A última leitura continua visível; atualize antes de usar os totais.' : ''}</p><button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>Tentar novamente</button></div>}
        {catalog && <LodgingReportPanel today={catalog.today}/>}
        <section className="occ-catalog" aria-busy={loading}>
          <div className="occ-section-heading"><h2>Imóveis</h2>{catalog && <span className="pill neutral">{properties.length} de {catalog.properties.length}</span>}</div>
          <label className="field occ-search"><span><Search size={16} aria-hidden="true"/>Buscar imóvel, endereço ou obra</span><input type="search" placeholder="Nome, rua, número ou obra" value={search} onChange={event => setSearch(event.target.value)}/></label>
          {catalog && !catalog.properties.length ? <div className="occ-empty"><Building2 size={30} aria-hidden="true"/><h3>Nenhum imóvel cadastrado</h3><p>Use o cadastro existente para adicionar os imóveis.</p><a className="button secondary" href="/imoveis">Abrir imóveis e endereços</a></div>
            : catalog && !properties.length ? <div className="occ-empty"><Search size={28} aria-hidden="true"/><h3>Nenhum imóvel nesta busca</h3><button type="button" className="button secondary" onClick={() => setSearch('')}>Limpar busca</button></div>
              : <div className="occ-property-grid">{properties.map(property => <article className="occ-property-card" key={property.id}>
                <div className="occ-property-heading"><span className="occ-house-icon"><House size={23} aria-hidden="true"/></span><div><span className="occ-kicker">{property.control_number == null ? 'IMÓVEL' : 'IMÓVEL ' + property.control_number}</span><h3>{property.name}</h3></div></div>
                <p className="occ-address">{property.address || 'Endereço não informado'}</p><p className="occ-location">{[property.state_code, property.worksite_name].filter(Boolean).join(' · ') || 'Região não informada'}</p>
                {property.archived_at && <span className="pill neutral">Arquivado · consulta</span>}
                <div className="occ-card-metrics"><span><strong>{property.occupied_count}</strong> ocupação(ões) registrada(s)</span><span><strong>{property.room_count}</strong> quarto(s)</span><span><strong>{property.available_count === null ? 'A confirmar' : property.available_count}</strong> vagas livres</span></div>
                {property.capacity_total === null ? <p className="occ-capacity-note">Capacidade a confirmar</p> : <p className="occ-capacity-note">{property.capacity_total} vaga(s) confirmada(s){property.occupancy_rate === null ? '' : ' · ' + number(property.occupancy_rate) + '% de ocupação'}</p>}
                <a className="button" href={'/imoveis/'+encodeURIComponent(property.id)+'#hospedagem'}>{guestIntent?'Escolher este imóvel':'Ver quartos e hóspedes'}<ArrowRight size={17} aria-hidden="true"/></a>
              </article>)}</div>}
        </section>
      </>}
      {propertyId && <>
        <a className="occ-back-list" href={guestIntent?'/ocupacao?intent=guest':'/ocupacao'} aria-disabled={editing} onClick={event=>{if(editing)event.preventDefault();}}><ArrowLeft size={17} aria-hidden="true"/>Ver todos os imóveis</a>
        <OccupancyPropertyPanel key={propertyId} propertyId={propertyId} onChanged={load} onEditing={setEditing}/>
      </>}
      <p className="occ-footnote">Os quartos e a capacidade operacional são confirmados neste controle. A quantidade de móveis ou as vagas da Entrega não definem a ocupação. Este registro não atesta lotação legal.</p>
    </main>
  </>;
}

function OccupancySummary({metrics}: {metrics: OccupancyMetrics}) {
  const cards = [
    {label: 'Vagas confirmadas', value: metrics.capacity_total === null ? 'A confirmar' : number(metrics.capacity_total), icon: BedDouble},
    {label: 'Ocupações registradas', value: number(metrics.occupied_count), icon: Users},
    {label: 'Vagas livres', value: metrics.available_count === null ? 'A confirmar' : number(metrics.available_count), icon: DoorOpen},
    {label: 'Ocupação', value: metrics.occupancy_rate === null ? metrics.capacity_total === 0 ? 'Sem vagas' : 'A confirmar' : number(metrics.occupancy_rate) + '%', icon: House},
  ];
  return <div className="occ-summary">{cards.map(card => <div className="occ-stat" key={card.label}><card.icon size={19} aria-hidden="true"/><strong className={card.value.length > 6 ? 'occ-stat-text' : ''}>{card.value}</strong><span>{card.label}</span></div>)}</div>;
}

const noOccupancyChange = async () => {};
const noOccupancyEdit = () => {};
export function PropertyOccupancy({propertyId}: {propertyId: string}) { return <OccupancyPropertyPanel propertyId={propertyId} embedded onChanged={noOccupancyChange} onEditing={noOccupancyEdit}/>; }

function OccupancyPropertyPanel({propertyId, onChanged, onEditing, embedded=false}: {propertyId: string; onChanged: () => Promise<void>; onEditing: (value: boolean) => void; embedded?: boolean}) {
  const [data, setData] = useState<OccupancyDetail | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [roomQuery, setRoomQuery] = useState(''), [shift, setShift] = useState('');
  const [entry, setEntry] = useState<OccupancyEntry | null>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), trigger = useRef<HTMLButtonElement | null>(null);
  const load = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try {
      const result = await occupancyGet<OccupancyDetail>('/api/occupancy?' + new URLSearchParams({property_id: propertyId}), request.signal);
      if (!result?.property || result.property.id !== propertyId || !Array.isArray(result.rooms) || !Array.isArray(result.stays) || !Array.isArray(result.people)
        || !Array.isArray(result.historical_rooms) || typeof result.today !== 'string' || typeof result.truncated !== 'boolean'
        || result.rooms.some(room => room.property_id !== propertyId) || result.stays.some(stay => stay.property_id !== propertyId)) {
        throw new Error('Não foi possível conferir os dados deste imóvel. Atualize a consulta.');
      }
      if (current === generation.current && !request.signal.aborted) setData(result);
    } catch (cause) {
      if (current === generation.current && !request.signal.aborted) setError(occupancyError(cause));
    } finally { if (current === generation.current && !request.signal.aborted) setLoading(false); }
  }, [propertyId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const requests = generation, pending = controller;
    return () => { window.clearTimeout(timer); requests.current++; pending.current?.abort(); };
  }, [load]);
  useEffect(() => { onEditing(!!entry); return () => onEditing(false); }, [entry, onEditing]);
  function open(next: OccupancyEntry, button: HTMLButtonElement) { trigger.current = button; setNotice(''); setEntry(next); }
  function restoreFocus() { window.requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus()); }
  function close() { setEntry(null); restoreFocus(); void load(); void onChanged(); }
  async function saved(result: SaveResult) {
    const action = entry?.action;
    setEntry(null); restoreFocus();
    setNotice(result.alreadySaved ? 'Registro já confirmado. A consulta foi atualizada.' : action === 'check_in' ? 'Entrada registrada.' : action === 'check_out' ? 'Saída registrada. A vaga foi liberada.' : action === 'plan_checkout' ? 'Previsão atualizada. A vaga continua ocupada até registrar a saída real.' : 'Quarto salvo.');
    await Promise.all([load(), onChanged()]);
  }
  if (!data) return <section className="occ-detail occ-panel" aria-busy={loading}>{loading ? <p className="occ-state" role="status">Carregando quartos e pessoas…</p> : <div className="occ-empty"><Building2 size={28} aria-hidden="true"/><h2>Consulta indisponível</h2><p role="alert">{error}</p><button type="button" className="button secondary" onClick={() => void load()}>Tentar novamente</button></div>}</section>;
  const active = data.stays.filter(stay => stay.exit_on === null && !stay.scope_changed);
  const closed = data.stays.filter(stay => stay.exit_on !== null);
  const oldActive = data.stays.filter(stay => stay.exit_on === null && stay.scope_changed);
  const shifts = [...new Set(active.map(stay => stay.shift).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const query = occupancyText(roomQuery.trim());
  const matchesShift = (stay: OccupancyStay) => !shift || (shift === '__none' ? !stay.shift : stay.shift === shift);
  const rooms = data.rooms.filter(room => (!query || occupancyText(room.name).includes(query))
    && (!shift || active.some(stay => stay.room_id === room.id && matchesShift(stay))));
  const disabled = loading || !!error || !!entry || !!data.property.archived_at;
  return <section className="occ-detail" aria-busy={loading}>
    <div className="occ-property-intro occ-panel">
      {embedded ? <div className="occ-section-heading"><h2>Hospedagem</h2><a className="button secondary" href="/hospedes">Cadastro de hóspedes</a></div> : <>
      <div className="occ-section-heading"><div className="occ-property-heading"><span className="occ-house-icon"><House size={27} aria-hidden="true"/></span><div><span className="occ-kicker">{data.property.control_number == null ? 'IMÓVEL' : 'IMÓVEL ' + data.property.control_number}</span><h2>{data.property.name}</h2></div></div><a className="text-button" href={occupancyPropertyUrl(propertyId)}>Abrir ficha do imóvel<ArrowRight size={16} aria-hidden="true"/></a></div>
      <p className="occ-address">{data.property.address || 'Endereço não informado'}</p><p className="occ-location">{[data.property.state_code, data.property.worksite_name].filter(Boolean).join(' · ') || 'Região não informada'}</p>
      </>}
      {data.property.archived_at && <p className="occ-info">Imóvel arquivado. Quartos e estadias estão disponíveis para consulta.</p>}
      <OccupancySummary metrics={data.property}/>
      {occupancyCapacityStatus(data.property) === 'full' && <p className="occ-full-note" role="status">100% de ocupação · todas as vagas confirmadas estão ocupadas.</p>}
      {occupancyCapacityStatus(data.property) === 'over' && <p className="occ-error" role="alert">Ocupação acima da capacidade informada. Confira os quartos e as hospedagens antes de uma nova entrada.</p>}
      {data.property.capacity_total === null && <p className="occ-help">Capacidade a confirmar. Cadastre os quartos e confirme a quantidade de vagas de cada um para calcular o total.</p>}
    </div>
    {notice && <p className="occ-notice" role="status"><Check size={18} aria-hidden="true"/>{notice}</p>}
    {error && <div className="occ-error" role="alert"><p>{error} A última leitura continua visível; atualize antes de fazer alterações.</p><button type="button" className="button secondary" disabled={loading || !!entry} onClick={() => void load()}>Tentar novamente</button></div>}
    {data.truncated && <p className="occ-info">Esta consulta tem uma lista parcial de pessoas ou estadias. Os totais vêm da consulta completa do servidor. Entradas ficam bloqueadas nos quartos cuja lista de ocupações está incompleta.</p>}
    <div className="occ-section-heading occ-rooms-heading"><div><h2>Quartos e hóspedes</h2><p>Totais do imóvel; os filtros alteram apenas os cartões.</p></div><div className="occ-tools"><button type="button" className="button secondary" disabled={loading || !!entry} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true"/>{loading ? 'Atualizando…' : 'Atualizar'}</button><button type="button" className="button" disabled={disabled} onClick={event => open({action: 'room_create'}, event.currentTarget)}><Plus size={17} aria-hidden="true"/>Cadastrar quarto</button></div></div>
    {data.rooms.length > 0 && <div className="occ-filters"><label className="field"><span>Buscar quarto</span><input type="search" value={roomQuery} placeholder="Nome do quarto" onChange={event => setRoomQuery(event.target.value)}/></label><label className="field"><span>Turno das pessoas hospedadas</span><select value={shift} onChange={event => setShift(event.target.value)}><option value="">Todos os turnos</option>{shifts.map(value => <option key={value} value={value}>{value}</option>)}<option value="__none">Não informado</option></select></label></div>}
    {!data.rooms.length ? <div className="occ-empty occ-panel"><BedDouble size={32} aria-hidden="true"/><h3>Cadastre os quartos deste imóvel</h3><p>Defina o nome de cada quarto. A capacidade pode ficar em branco até a conferência.</p><p className="occ-help">Os quartos são criados neste controle de ocupação.</p></div>
      : !rooms.length ? <div className="occ-empty occ-panel"><Search size={28} aria-hidden="true"/><h3>Nenhum quarto neste filtro</h3><button type="button" className="button secondary" onClick={() => { setRoomQuery(''); setShift(''); }}>Limpar filtros</button></div>
        : <div className="occ-room-grid">{rooms.map(room => {
          const residents = active.filter(stay => stay.room_id === room.id).sort((a, b) => a.slot_number - b.slot_number);
          const shown = residents.filter(matchesShift);
          const known = room.capacity !== null && room.capacity_confirmed;
          const free = occupancySlots(room, data.stays);
          const incomplete = new Set(residents.map(stay => stay.slot_number)).size !== room.occupied_count;
          return <article className="occ-room-card" key={room.id}>
            <div className="occ-room-heading"><div><span className="occ-room-icon"><BedDouble size={22} aria-hidden="true"/></span><h3>{room.name}</h3></div><button type="button" className="button icon-edit" disabled={disabled || room.scope_changed} title={'Editar ' + room.name} aria-label={'Editar ' + room.name} onClick={event => open({action: 'room_update', room}, event.currentTarget)}><Pencil size={16} aria-hidden="true"/></button></div>
            <div className="occ-room-status"><span>{known ? room.occupied_count + ' de ' + room.capacity + ' vagas ocupadas' : 'Capacidade a confirmar'}</span>{known && <span className={'occ-vacancy ' + (room.available_count === 0 ? 'occ-vacancy-full' : '')}>{room.available_count !== null && room.available_count < 0 ? 'Acima da capacidade' : room.available_count + ' livre(s)'}</span>}</div>
            {known && room.capacity! > 0 && <div className="occ-capacity-track" aria-hidden="true"><span style={{width: Math.min(100, room.occupied_count / room.capacity! * 100) + '%'}}/></div>}
            {shown.length ? <ul className="occ-residents">{shown.map(stay => <li key={stay.id}>
              <div className="occ-slot">Vaga {stay.slot_number}</div><div className="occ-person"><strong>{stay.person_name}</strong>{stay.person_name_pending&&<small>Nome a conferir no cadastro</small>}<span>{stay.person_title || 'Função não informada'}</span><div className="occ-stay-meta"><span>{stay.shift || 'Turno não informado'}</span><span>Check-in {occupancyDate(stay.entry_on)}</span><span>Check-out previsto: {stay.planned_exit_on ? occupancyDate(stay.planned_exit_on) : 'não informado'}</span>{stay.planned_exit_on && stay.planned_exit_on < data.today && <span className="occ-overdue">Previsão vencida · saída real pendente</span>}{stay.entry_on===null&&<span>Levantamento registrado em {new Date(stay.recorded_at).toLocaleDateString('pt-BR',{timeZone:'America/Belem'})}</span>}</div><small>{stay.assignment_unavailable ? 'Empresa/centro de custo fora deste acesso' : !stay.assignment_captured_at ? 'Vínculo da empresa não registrado nesta hospedagem' : [stay.client_name || 'Empresa não informada', stay.cost_center_name].filter(Boolean).join(' · ')}</small></div>
              <div className="occ-stay-actions"><button type="button" className="occ-checkout" disabled={disabled || stay.scope_changed} onClick={event => open({action: 'plan_checkout', stay}, event.currentTarget)}><CalendarDays size={16} aria-hidden="true"/>Prever saída</button><button type="button" className="occ-checkout" disabled={disabled || stay.scope_changed} onClick={event => open({action: 'check_out', stay}, event.currentTarget)} aria-label={'Registrar saída de ' + stay.person_name}><DoorOpen size={16} aria-hidden="true"/>Check-out real</button></div>
            </li>)}</ul> : <p className="occ-room-empty">{incomplete ? 'Lista de pessoas incompleta nesta consulta.' : known && room.capacity === 0 ? 'Sem vagas operacionais.' : 'Nenhuma ocupação registrada.'}</p>}
            {incomplete && shown.length > 0 && <p className="occ-help">A lista de pessoas deste quarto está incompleta nesta consulta.</p>}
            {shift && shown.length < residents.length && <p className="occ-help">Mostrando {shown.length} de {residents.length} pessoa(s) deste quarto.</p>}
            {!known ? <button type="button" className="button secondary occ-room-action" disabled={disabled || room.scope_changed} onClick={event => open({action: 'room_update', room}, event.currentTarget)}>Confirmar capacidade</button>
              : <button type="button" className="button secondary occ-room-action" disabled={disabled || room.scope_changed || !free.length} onClick={event => open({action: 'check_in', room}, event.currentTarget)}><Plus size={17} aria-hidden="true"/>{incomplete ? 'Lista de ocupações incompleta' : !free.length ? 'Sem vaga disponível' : 'Adicionar hóspede'}</button>}
          </article>;
        })}</div>}
    {oldActive.length > 0 && <div className="occ-info"><strong>Estadias de região anterior · consulta</strong>{oldActive.map(stay => <p key={stay.id}>{stay.person_name} · {stay.room_name} · vaga {stay.slot_number}</p>)}</div>}
    <LodgingReportPanel today={data.today} propertyId={propertyId} refreshKey={data.stays.map(stay=>stay.id+':'+stay.revision).join(',')}/>
    <details className="occ-history occ-panel">
      <summary><CalendarDays size={20} aria-hidden="true"/><span>Histórico de estadias encerradas</span><span className="pill neutral">{closed.length}{data.truncated ? '+' : ''}</span></summary>
      <p className="occ-help">Entradas e saídas preservadas para consulta, com o nome e a função registrados na estadia.</p>
      {data.truncated && <p className="occ-info">Esta consulta atingiu o limite de pessoas ou estadias. Registros mais antigos podem não aparecer aqui. Os totais de ocupação vêm da consulta completa do servidor.</p>}
      {closed.length ? <ul>{[...closed].sort((a, b) => (b.exit_on || '').localeCompare(a.exit_on || '') || (b.entry_on||'').localeCompare(a.entry_on||'')).map(stay => <li key={stay.id}><div><strong>{stay.person_name}</strong>{stay.person_name_pending&&<small>Nome a conferir no cadastro</small>}<span>{stay.person_title || 'Função não informada'}</span></div><p>{stay.room_name} · vaga {stay.slot_number} · {stay.shift || 'Turno não informado'}</p><p>Check-in {occupancyDate(stay.entry_on)} · Check-out real {occupancyDate(stay.exit_on!)}</p><p>{stay.assignment_unavailable ? 'Empresa/centro de custo fora deste acesso' : !stay.assignment_captured_at ? 'Vínculo da empresa não registrado nesta hospedagem' : [stay.client_name || 'Empresa não informada', stay.cost_center_name].filter(Boolean).join(' · ')}</p>{stay.scope_changed && <small>Região anterior do imóvel · {stay.state_code || 'UF não informada'}</small>}</li>)}</ul> : <p className="occ-history-empty">Nenhuma saída registrada.</p>}
    </details>
    {entry && <OccupancyEditor key={entry.action + ':' + ('room' in entry ? entry.room.id : 'stay' in entry ? entry.stay.id : propertyId)} entry={entry} data={data} onClose={close} onSaved={saved}/>}
  </section>;
}

function OccupancyEditor({entry, data: initialData, onClose, onSaved}: {entry: OccupancyEntry; data: OccupancyDetail; onClose: () => void; onSaved: (result: SaveResult) => Promise<void>}) {
  const [extraPeople,setExtraPeople]=useState<OccupancyDetail['people']>([]),[newGuest,setNewGuest]=useState(false),[guestBusy,setGuestBusy]=useState(false);
  const data={...initialData,people:[...initialData.people.filter(p=>!extraPeople.some(e=>e.id===p.id)),...extraPeople]};
  const [draft, setDraft] = useState(() => makeOccupancyDraft(entry, data.today));
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false);
  const dialog = useRef<HTMLDialogElement | null>(null), alive = useRef(false), saving = useRef(false), pending = useRef<AbortController | null>(null);
  const dirty = useRef(false), uncertainRef = useRef(false), request = useRef<{fingerprint: string; body: string} | null>(null);
  const roomAction = entry.action === 'room_create' || entry.action === 'room_update';
  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current || saving.current || uncertainRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    const activeDialog = dialog.current;
    return () => { alive.current = false; pending.current?.abort(); window.removeEventListener('beforeunload', beforeUnload); activeDialog?.close(); };
  }, []);
  function change<K extends keyof OccupancyDraft>(key: K, value: OccupancyDraft[K]) {
    if (saving.current || uncertainRef.current) return;
    dirty.current = true;
    setDraft(current => ({...current, [key]: value, ...(key !== 'confirmed' ? {confirmed: false} : {}), ...(key === 'capacity' ? {capacityConfirmed: false} : {})}));
    setError(''); setConflict(false);
  }
  function close() {
    if (saving.current || guestBusy) return;
    if (uncertainRef.current) {
      if (!window.confirm('O envio ainda não foi confirmado. Fechar e atualizar a consulta para conferir se o registro foi salvo?')) return;
    } else if (dirty.current && !window.confirm('Fechar sem salvar as alterações deste formulário?')) return;
    onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || guestBusy) return;
    const issue = occupancyDraftIssue(entry, draft, data);
    if (issue) { setError(issue); return; }
    const fingerprint = JSON.stringify(occupancyPayload(entry, draft, data));
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = {fingerprint, body: JSON.stringify({...JSON.parse(fingerprint), request_id: crypto.randomUUID()})};
    const body = request.current.body;
    const controller = new AbortController(); pending.current = controller;
    saving.current = true; setBusy(true); setError(''); setConflict(false);
    let definitelyRejected = false;
    try {
      const response = await fetch('/api/occupancy', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', cache: 'no-store', signal: controller.signal, body});
      definitelyRejected = [400, 401, 403, 404, 409, 413, 422, 429].includes(response.status);
      let parsed: unknown;
      try { parsed = await response.json(); } catch { throw new Error('A resposta do envio não pôde ser confirmada.'); }
      const result = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
      if (!response.ok) {
        if (alive.current && response.status === 409) setConflict(true);
        throw new Error(typeof result?.error === 'string' ? result.error : 'Não foi possível salvar este registro.');
      }
      if (!result || typeof result.id !== 'string' || typeof result.revision !== 'number') throw new Error('A confirmação recebida está incompleta.');
      if (!alive.current || controller.signal.aborted) return;
      uncertainRef.current = false; dirty.current = false;
      await onSaved(result as SaveResult);
    } catch (cause) {
      if (alive.current && !controller.signal.aborted) {
        uncertainRef.current = !definitelyRejected;
        setUncertain(!definitelyRejected); setError(occupancyError(cause));
      }
    } finally { saving.current = false; if (alive.current && !controller.signal.aborted) setBusy(false); }
  }
  const selectedPerson = data.people.find(person => person.id === draft.personId);
  const slots = entry.action === 'check_in' ? occupancySlots(entry.room, data.stays) : [];
  return <dialog ref={dialog} className="occ-editor" aria-labelledby="occ-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="occ-section-heading"><div><span className="occ-kicker">{data.property.name}</span><h2 id="occ-editor-title">{ACTION_TITLES[entry.action]}</h2></div><button type="button" className="button icon-edit" disabled={busy||guestBusy} onClick={close} aria-label="Fechar formulário"><X size={21} aria-hidden="true"/></button></div>
    <form onSubmit={submit} noValidate>
      <fieldset className="occ-form-fields" disabled={busy || uncertain}>
        {roomAction && <>
          <p className="occ-help">Quarto deste controle de ocupação. A capacidade é conferida pela operação.</p>
          <label className="field"><span>Nome do quarto</span><input value={draft.name} maxLength={100} required autoComplete="off" placeholder="Ex.: Quarto térreo" onChange={event => change('name', event.target.value)}/></label>
          <label className="field"><span>Capacidade operacional do quarto</span><input type="number" inputMode="numeric" min={0} max={200} step={1} value={draft.capacity} placeholder="A confirmar" onChange={event => change('capacity', event.target.value)}/><small>Número inteiro de vagas, de 0 a 200. Em branco significa “Capacidade a confirmar”; zero significa sem vagas.</small></label>
          {draft.capacity.trim() !== '' && <label className="occ-check"><input type="checkbox" checked={draft.capacityConfirmed} onChange={event => change('capacityConfirmed', event.target.checked)}/><span>Conferi e confirmo esta capacidade operacional.</span></label>}
          <p className="occ-help">A capacidade não é calculada a partir da Mobília ou da Entrega.</p>
        </>}
        {entry.action === 'check_in' && <>
          <div className="occ-form-context"><BedDouble size={21} aria-hidden="true"/><div><strong>{entry.room.name}</strong><span>{slots.length} vaga(s) livre(s) · capacidade confirmada de {entry.room.capacity}</span></div></div>
          {!newGuest && data.people.length > 0 && <>
            <label className="field"><span>Hóspede / pessoa já cadastrada</span><select required value={draft.personId} onChange={event => change('personId', event.target.value)}><option value="">Selecione uma pessoa ativa</option>{data.people.map(person => <option key={person.id} value={person.id}>{person.display_name}{person.job_title ? ' · ' + person.job_title : ''}</option>)}</select><small>O nome e a função atuais são preservados no registro da entrada.</small></label>
            {selectedPerson && <p className="occ-selected-person"><strong>{selectedPerson.display_name}</strong><span>{selectedPerson.job_title || 'Função não informada'}</span></p>}
            <label className="field"><span>Vaga no quarto</span><select required value={draft.slot} onChange={event => change('slot', event.target.value)}><option value="">Selecione uma vaga livre</option>{slots.map(slot => <option value={slot} key={slot}>Vaga {slot}</option>)}</select></label>
            <label className="occ-check"><input type="checkbox" checked={draft.entryUnknown} onChange={e=>change('entryUnknown',e.target.checked)}/><span>A pessoa já está hospedada e a data de entrada não é conhecida.</span></label><div className="occ-form-grid"><label className="field"><span>Data do check-in</span><input type="date" required={!draft.entryUnknown} disabled={draft.entryUnknown} max={data.today} value={draft.entryOn} onChange={event => change('entryOn', event.target.value)}/></label><label className="field"><span>Turno (opcional)</span><input maxLength={80} autoComplete="off" placeholder="Ex.: Turno A" value={draft.shift} onChange={event => change('shift', event.target.value)}/></label></div>
          </>}
          {!newGuest && data.people.length > 0 && <><label className="field"><span>Check-out previsto (opcional)</span><input type="date" min={data.today} value={draft.plannedExitOn} onChange={event => change('plannedExitOn', event.target.value)}/><small>A previsão não libera a vaga. Registre o check-out real quando a pessoa sair.</small></label><p className="occ-help">A empresa e o centro de custo do cadastro da pessoa serão preservados nesta hospedagem ao confirmar a entrada.</p></>}
          {newGuest ? <OccupancyGuestForm propertyId={data.property.id} propertyRevision={data.property.revision} roomId={entry.room.id} onBusy={setGuestBusy} onCancel={()=>setNewGuest(false)} onSaved={person=>{setExtraPeople(p=>[...p.filter(x=>x.id!==person.id),person]);change('personId',person.id);setNewGuest(false);}}/> : <button type="button" className="button secondary" onClick={()=>{dirty.current=true;setNewGuest(true);}}>Cadastrar novo hóspede</button>}
        </>}
        {entry.action === 'plan_checkout' && <><div className="occ-form-context"><CalendarDays size={22}/><div><strong>{entry.stay.person_name}</strong><span>{entry.stay.room_name} · vaga {entry.stay.slot_number}</span></div></div><label className="field"><span>Check-out previsto</span><input type="date" min={data.today} value={draft.plannedExitOn} onChange={event => change('plannedExitOn', event.target.value)}/><small>Deixe em branco para retirar a previsão. A vaga continua ocupada até registrar o check-out real.</small></label></>}
        {entry.action === 'check_out' && <>
          <div className="occ-form-context"><DoorOpen size={22} aria-hidden="true"/><div><strong>{entry.stay.person_name}</strong><span>{entry.stay.person_title || 'Função não informada'}</span><span>{entry.stay.room_name} · vaga {entry.stay.slot_number}</span></div></div>
          <p className="occ-help">Entrada registrada em {occupancyDate(entry.stay.entry_on)}. A saída libera a vaga e preserva a estadia no histórico.</p>
          <label className="field"><span>Data do check-out real</span><input type="date" required min={entry.stay.entry_on||undefined} max={data.today} value={draft.exitOn} onChange={event => change('exitOn', event.target.value)}/></label>
        </>}
        {(entry.action !== 'check_in' || data.people.length > 0 && !newGuest) && <label className="occ-check occ-final-check"><input type="checkbox" checked={draft.confirmed} onChange={event => change('confirmed', event.target.checked)}/><span>{entry.action === 'plan_checkout' ? 'Conferi a pessoa e a previsão. Esta ação não registra uma saída real.' : entry.action === 'check_out' ? 'Conferi a pessoa, a vaga e a data de saída.' : entry.action === 'check_in' ? draft.entryUnknown?'Confirmo que a pessoa está hospedada nesta vaga; a data da chegada não foi informada.':'Conferi a pessoa, a vaga e a data de entrada.' : 'Conferi os dados deste quarto.'}</span></label>}
      </fieldset>
      {error && <div className="occ-error" role="alert"><p>{error}</p>{uncertain ? <p>O envio ainda não foi confirmado. Seus dados foram mantidos. Tente novamente para conferir o mesmo registro, sem duplicar.</p> : <p>Os dados do formulário foram mantidos.</p>}{conflict && <p>Os dados podem ter mudado em outra sessão. Feche e atualize a consulta antes de enviar uma nova alteração.</p>}</div>}
      <div className="occ-form-actions"><button type="button" className="button secondary" disabled={busy||guestBusy} onClick={close}>{uncertain || conflict ? 'Fechar e atualizar' : 'Cancelar'}</button><button type="submit" className="button" disabled={busy || guestBusy || newGuest || entry.action === 'check_in' && !data.people.length}>{busy ? 'Salvando…' : uncertain ? 'Tentar novamente' : ACTION_TITLES[entry.action]}</button></div>
    </form>
  </dialog>;
}
