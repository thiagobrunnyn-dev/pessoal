'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowLeft, LockKeyhole, RefreshCw} from 'lucide-react';
import {GUEST_KIND_LABELS, GUEST_SCORE_LABELS, guestDate, guestJson, type GuestItem, type GuestRequestKind, type GuestScores} from './guest-channel-types';
import {guestCategoryLabel} from '../../lib/guest-request-categories';
import GuestRequestTriage from './guest-request-triage';
import './guest-requests.css';

type Summary = {
  id: string; protocol: string; kind: GuestRequestKind; status: string; received_at: string;
  property_id: string; property_name: string; name: string; job_title: string; category: string; description: string; photo_count: number;
};
type RequestDetail = Summary & {address: string; location: string; contact: string; company: string;
  cost_center: string; items: GuestItem[]; scores: GuestScores; unable_to_photo: boolean; revision: number;
  can_triage: boolean; scope_changed: boolean; linked_order_id: string | null};
type List = {requests: Summary[]; properties: {id: string; name: string}[]; truncated?: boolean; next_cursor?: string | null; query_key?: string};
export type GuestRequestDetail = {
  request: RequestDetail;
  events: {id: string; action: string; created_at: string; actor_name?: string; note?: string}[];
  photos: {id: string}[];
  orders: {id: string; description: string; status: string; version: number}[];
  linked_order?: {id: string; number?: string; status?: string} | null;
};
type Detail = GuestRequestDetail;
const statuses: Record<string, string> = {received: 'Recebida', reviewing: 'Em análise', linked_order: 'Encaminhada para OS', closed: 'Triagem encerrada'};
const statusLabel = (value: string) => statuses[value] || value;
const eventLabels: Record<string, string> = {received: 'Recebido pelo canal', review: 'Registro em análise', close: 'Triagem encerrada', reopen: 'Análise reaberta', link_order: 'Vinculado a uma ordem de serviço'};
const errorText = (cause: unknown) => cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'A consulta demorou mais do que o esperado. Tente novamente.';
const photoUrl = (id: string) => '/api/guest-request-photos/' + encodeURIComponent(id);
function safeList(value: unknown): value is List {
  if (!value || typeof value !== 'object') return false;
  const result = value as List;
  return Array.isArray(result.requests) && Array.isArray(result.properties)
    && result.requests.every(row => typeof row.id === 'string' && typeof row.protocol === 'string' && typeof row.property_name === 'string');
}
function safeDetail(value: unknown, id: string): value is Detail {
  if (!value || typeof value !== 'object') return false;
  const result = value as Detail;
  return result.request?.id === id && Array.isArray(result.photos) && Array.isArray(result.events)
    && Array.isArray(result.request.items);
}

export default function GuestRequests({displayName, accessTitle, initialId = '', initialPropertyId = ''}: {displayName: string; accessTitle: string; initialId?: string; initialPropertyId?: string}) {
  const [data, setData] = useState<List | null>(null), [detail, setDetail] = useState<Detail | null>(null);
  const [triageBlocked,setTriageBlocked]=useState(false);
  const [loading, setLoading] = useState(true), [opening, setOpening] = useState(false), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [kind, setKind] = useState(''), [property, setProperty] = useState(initialPropertyId), [status, setStatus] = useState('');
  const listAbort = useRef<AbortController | null>(null), detailAbort = useRef<AbortController | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null), lastTrigger = useRef<HTMLButtonElement | null>(null);
  const listGeneration = useRef(0), detailGeneration = useRef(0);
  const queryKey = JSON.stringify([property, kind, status]);
  const load = useCallback(async (cursor = '') => {
    const generation = ++listGeneration.current;
    listAbort.current?.abort(); const controller = new AbortController(); listAbort.current = controller;
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams();
      if (property) query.set('property_id', property);
      if (kind) query.set('kind', kind);
      if (status) query.set('status', status);
      if (cursor) query.set('cursor', cursor);
      const value = await guestJson('/api/guest-requests' + (query.size ? '?' + query.toString() : ''), {signal: controller.signal});
      if (!safeList(value)) throw new Error('A lista recebida está incompleta. Atualize a consulta.');
      if (generation === listGeneration.current && !controller.signal.aborted) setData(previous => ({...value, query_key: queryKey, requests: cursor && previous?.query_key === queryKey
        ? [...previous.requests, ...value.requests.filter(row => !previous.requests.some(old => old.id === row.id))] : value.requests}));
    } catch (cause) { if (generation === listGeneration.current && !controller.signal.aborted) setError(errorText(cause)); }
    finally { if (generation === listGeneration.current && !controller.signal.aborted) setLoading(false); }
  }, [property, kind, status, queryKey]);
  const open = useCallback(async (id: string) => {
    const generation = ++detailGeneration.current;
    detailAbort.current?.abort(); const controller = new AbortController(); detailAbort.current = controller;
    setOpening(true); setError('');
    try {
      const value = await guestJson('/api/guest-requests?id=' + encodeURIComponent(id), {signal: controller.signal});
      if (!safeDetail(value, id)) throw new Error('Não foi possível confirmar os dados deste registro.');
      if (generation === detailGeneration.current && !controller.signal.aborted) setDetail(value);
    } catch (cause) { if (generation === detailGeneration.current && !controller.signal.aborted) setError(errorText(cause)); }
    finally { if (generation === detailGeneration.current && !controller.signal.aborted) setOpening(false); }
  }, []);
  useEffect(() => { void load(); return () => {listGeneration.current++; listAbort.current?.abort();}; }, [load]);
  useEffect(() => { if (initialId) void open(initialId); return () => {detailGeneration.current++; detailAbort.current?.abort();}; }, [initialId, open]);
  useEffect(() => { if (detail) detailHeading.current?.focus(); }, [detail]);
  function back() {
    detailGeneration.current++; detailAbort.current?.abort(); setDetail(null); setOpening(false); setError('');
    window.setTimeout(() => lastTrigger.current?.focus(), 0);
  }
  const normalized = search.trim().toLocaleLowerCase('pt-BR');
  const rows = (data?.requests ?? []).filter(row => (!kind || row.kind === kind) && (!property || row.property_id === property)
    && (!status || row.status === status) && (!normalized || [row.protocol, row.property_name, row.name, row.job_title, row.description, row.kind === 'maintenance' ? guestCategoryLabel(row.category) : '']
      .join(' ').toLocaleLowerCase('pt-BR').includes(normalized)));
  const allStatuses = Object.keys(statuses);
  return <div className="guest-requests"><header className="topbar"><a className="brand" href="/">
    <img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza Facilities"/><span>MOBILIZA FACILITIES<br/><strong>Solicitações do imóvel</strong></span></a>
    <span className="clean-header-label">{accessTitle} · {displayName}</span></header>
    <main className="shell"><p className="gr-help"><a href="/solicitacoes">Abrir manutenção e compras dos formulários gerais</a></p><div className="gr-topline">{detail ? <button type="button" className="button secondary" disabled={triageBlocked} onClick={back}><ArrowLeft size={18}/>Voltar à lista</button>
      : <a className="nav-back" href="/"><ArrowLeft size={18}/>Voltar ao painel</a>}<span><LockKeyhole size={17} aria-hidden="true"/>Acesso privado da gestão</span></div>
      <section className="page-title"><div><div className="eyebrow">CANAL DOS IMÓVEIS</div><h1>Solicitações do imóvel</h1>
        <p>Registros identificados, enviados pelo canal de cada imóvel. As informações são declaradas por quem envia.</p></div>
        <button type="button" className="button secondary" disabled={loading || opening || triageBlocked} onClick={() => void (detail ? open(detail.request.id) : load())}><RefreshCw size={18}/>Atualizar</button></section>
      {error && <p className="error gr-error" role="alert">{error}{data || detail ? ' Os dados exibidos são da última leitura concluída.' : ''}</p>}
      {opening && <p className="gr-loading" role="status">Abrindo registro…</p>}
      {detail ? <><DetailView detail={detail} headingRef={detailHeading}/><GuestRequestTriage key={detail.request.id + ':' + detail.request.revision} detail={detail} onPendingChange={setTriageBlocked} onSaved={async()=>{await open(detail.request.id);await load();}}/></> : <>
        <section className="panel gr-filters" aria-label="Filtrar registros"><label className="field"><span>Buscar protocolo, nome, assunto ou descrição</span><input type="search" value={search} onChange={event => setSearch(event.target.value)}/></label>
          <label className="field"><span>Imóvel</span><select value={property} onChange={event => setProperty(event.target.value)}><option value="">Todos os imóveis</option>{data?.properties.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label className="field"><span>Tipo</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="">Todos os tipos</option>{Object.entries(GUEST_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Situação</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Todas as situações</option>{allStatuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label></section>
        {loading && <p role="status">Carregando registros…</p>}
        {data?.truncated && <p className="today-alert">Há registros anteriores. Use “Carregar anteriores” para consultar o histórico. A busca por texto se aplica aos registros carregados.</p>}
        {data && <p className="gr-count">{rows.length} registro{rows.length === 1 ? '' : 's'} na consulta</p>}
        {!loading && !error && !rows.length && <section className="panel gr-empty"><h2>{data?.requests.length ? 'Nenhum registro com esses filtros' : 'Nenhum registro recebido'}</h2>
          <p>{data?.requests.length ? 'Ajuste os filtros para conferir a lista.' : 'As solicitações e avaliações recebidas pelos canais dos imóveis aparecerão aqui.'}</p></section>}
        <div className="gr-list">{rows.map(row => <article className="panel gr-card" key={row.id}><div className="gr-card-main"><div className="gr-card-meta"><strong>{row.protocol}</strong><span className="pill neutral">{statusLabel(row.status)}</span></div>
          <h2>{row.property_name}</h2><p className="gr-kind">{GUEST_KIND_LABELS[row.kind] || 'Registro'}{row.kind === 'maintenance' ? ' · ' + guestCategoryLabel(row.category) : ''}</p>
          <p>{row.name}{row.job_title ? ' · ' + row.job_title : ''}</p><p className="gr-description">{row.description || 'Sem comentário'}</p>
          <p className="gr-meta">{guestDate(row.received_at)}{row.photo_count ? ' · ' + row.photo_count + ' foto(s)' : ''}</p></div>
          <button type="button" className="button secondary" disabled={opening} onClick={event => {lastTrigger.current = event.currentTarget; void open(row.id);}}>Ver registro</button></article>)}</div>
        {data?.next_cursor && data.query_key === queryKey && <button type="button" className="button secondary" disabled={loading || opening}
          onClick={() => void load(data.next_cursor!)}>{loading ? 'Carregando…' : 'Carregar anteriores'}</button>}
      </>}
    </main></div>;
}

function DetailView({detail, headingRef}: {detail: Detail; headingRef: {current: HTMLHeadingElement | null}}) {
  const row = detail.request;
  return <section className="panel gr-detail"><div className="gr-detail-heading"><div><p className="eyebrow">{GUEST_KIND_LABELS[row.kind] || 'Registro'}{row.kind === 'maintenance' ? ' · ' + guestCategoryLabel(row.category) : ''}</p>
    <h2 ref={headingRef} tabIndex={-1}>{row.protocol}</h2><p>{guestDate(row.received_at)}</p></div><span className="pill neutral">{statusLabel(row.status)}</span></div>
    <p className="gr-declared">Identidade, vínculo e informações declarados pelo solicitante. O canal não verifica hospedagem nem vínculo com a empresa.</p>
    <dl className="gr-fields"><div><dt>Imóvel</dt><dd>{row.property_name}</dd></div><div><dt>Endereço no recebimento</dt><dd>{row.address || 'Não informado'}</dd></div>
      <div><dt>Nome informado</dt><dd>{row.name}</dd></div><div><dt>Perfil / função informada</dt><dd>{row.job_title || 'Não informada'}</dd></div>
      {row.kind === 'maintenance' && <div><dt>Assunto</dt><dd>{guestCategoryLabel(row.category)}</dd></div>}
      <div><dt>Quarto, ambiente ou área</dt><dd>{row.location || 'Não informado'}</dd></div><div><dt>Contato informado</dt><dd>{row.contact || 'Não informado'}</dd></div>
      <div><dt>Empresa informada</dt><dd>{row.company || 'Não informada'}</dd></div><div><dt>Centro de custo informado</dt><dd>{row.cost_center || 'Não informado'}</dd></div></dl>
    <section className="gr-detail-section"><h3>{row.kind === 'rating' ? 'Comentário' : 'Descrição'}</h3><p className="gr-full-text">{row.description || 'Nenhum comentário informado.'}</p></section>
    {row.kind === 'rating' && <section className="gr-detail-section"><h3>Notas da hospedagem</h3><dl className="gr-fields gr-ratings">{(Object.keys(GUEST_SCORE_LABELS) as (keyof GuestScores)[]).map(key => <div key={key}><dt>{GUEST_SCORE_LABELS[key]}</dt>
      <dd>{row.scores?.[key] == null ? 'Não avaliado' : row.scores[key] + ' de 5'}</dd></div>)}</dl></section>}
    {row.kind === 'material' && <section className="gr-detail-section"><h3>Materiais pedidos</h3><ul className="gr-materials">{row.items.map((item, index) => <li key={index}><strong>{item.name}</strong>
      <span>{item.quantity.toLocaleString('pt-BR')}{item.unit ? ' ' + item.unit : ''}</span></li>)}</ul><p className="gr-help">Pedido declarado, sujeito à análise da gestão. Não representa compra realizada.</p></section>}
    <section className="gr-detail-section"><h3>Fotos recebidas</h3>{row.unable_to_photo && <p className="gr-help">A pessoa informou: “Não consigo fotografar agora”.</p>}
      {detail.photos.length ? <div className="gr-photos">{detail.photos.map((photo, index) => <a key={photo.id} href={photoUrl(photo.id)} target="_blank" rel="noopener noreferrer" aria-label={'Abrir foto ' + (index + 1) + ' em outra aba'}>
        <img src={photoUrl(photo.id)} alt={'Foto recebida ' + (index + 1)} loading="lazy"/><span>Foto {index + 1}</span></a>)}</div> : <p className="gr-help">Nenhuma foto recebida.</p>}</section>
    {detail.linked_order && <section className="gr-detail-section"><h3>Manutenção vinculada</h3><a className="button secondary" href={'/ordens?id=' + encodeURIComponent(detail.linked_order.id)}>
      Abrir ordem {detail.linked_order.number || ''}</a></section>}
    <section className="gr-detail-section"><h3>Histórico interno</h3>{detail.events.length ? <ol className="gr-events">{detail.events.map(event => <li key={event.id}><strong>{eventLabels[event.action] || event.action}</strong>
      <p>{guestDate(event.created_at)}{event.actor_name ? ' · ' + event.actor_name : ''}</p>{event.note && <p className="gr-full-text">{event.note}</p>}</li>)}</ol> : <p className="gr-help">Sem atualizações internas registradas.</p>}</section>
  </section>;
}
