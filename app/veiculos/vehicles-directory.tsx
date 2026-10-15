'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation is required by the deployed Worker router. */
/* eslint-disable @next/next/no-img-element -- The shared fixed-size local logo follows the existing app header. */

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {Archive, ArrowLeft, CarFront, History, Pencil, Plus, RefreshCw, RotateCcw, Search, X} from 'lucide-react';
import {BRAZIL_STATES} from '../../lib/brazil-states';
import type {Vehicle, VehicleAction, VehicleEvent, VehicleSnapshot} from '../../lib/vehicles';
import './vehicles-directory.css';

type DirectoryData = {vehicles: Vehicle[]; regional: boolean; page: number; has_more: boolean};
type Entry = {action: VehicleAction; vehicle?: Vehicle};
type Saved = {id: string; revision: number; alreadySaved?: boolean; unchanged?: boolean};
type HistoryData = {vehicle: Vehicle; events: VehicleEvent[]; history_limited: boolean};
const actionLabel = {create: 'Cadastro', update: 'Edição', archive: 'Arquivamento', restore: 'Restauração'};
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const dateText = (date: string) => new Date(date).toLocaleString('pt-BR');

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  let data;
  try {data = await response.json();} catch {throw new Error(fallback);}
  if (!data || typeof data !== 'object') throw new Error(fallback);
  if (!response.ok) throw new Error('error' in data && typeof data.error === 'string' ? data.error : fallback);
  return data as T;
}

export default function VehiclesDirectory({displayName, accessTitle}: {displayName: string; accessTitle: string}) {
  const [data, setData] = useState<DirectoryData | null>(null);
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [entry, setEntry] = useState<Entry | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const alive = useRef(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({status, q: query, page: String(page)});
      const response = await fetch('/api/vehicles?' + params, {cache: 'no-store', signal: controller.signal});
      const result = await readResponse<DirectoryData>(response, 'Não foi possível carregar os veículos.');
      if (!Array.isArray(result.vehicles) || typeof result.regional !== 'boolean' || result.page !== page || typeof result.has_more !== 'boolean') throw new Error('Não foi possível conferir a lista. Atualize a página.');
      if (alive.current && generation.current === current) setData(result);
    } catch (cause) {
      if (alive.current && generation.current === current && !controller.signal.aborted) {
        setData(null);
        setError(errorText(cause, 'Não foi possível carregar os veículos.'));
      }
    } finally {
      if (alive.current && generation.current === current) setLoading(false);
    }
  }, [status, query, page]);

  useEffect(() => {
    alive.current = true;
    const timer = window.setTimeout(() => void load(), 0);
    const active = request, counter = generation;
    return () => {alive.current = false; window.clearTimeout(timer); counter.current++; active.current?.abort();};
  }, [load]);

  useEffect(() => {
    if (!entry) return;
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault();};
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [entry]);

  function open(next: Entry, button: HTMLButtonElement) {
    trigger.current = button;
    setNotice('');
    setEntry(next);
    setHistoryId(null);
  }
  function close() {
    setEntry(null);
    setHistoryId(null);
    window.requestAnimationFrame(() => trigger.current?.focus());
  }
  async function saved(action: VehicleAction, result: Saved) {
    setEntry(null);
    setNotice(result.alreadySaved ? 'Cadastro já salvo.' : result.unchanged ? 'Nenhuma alteração necessária.' : action === 'archive' ? 'Veículo arquivado.' : action === 'restore' ? 'Veículo restaurado.' : 'Veículo salvo.');
    await load();
  }
  function navigation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (entry && !window.confirm('Sair sem salvar este formulário?')) event.preventDefault();
  }
  const occupied = !!entry || !!historyId;

  return <>
    <header className="topbar">
      <a className="brand" href="/" onClick={navigation}><img src="/mobiliza-logo-0cff20bedde7.jpeg" width={48} height={48} alt="Mobiliza Facilities"/><span>MOBILIZA GESTÃO<br/><strong>Veículos</strong></span></a>
      <span className="clean-header-label">{accessTitle} · {displayName}</span>
    </header>
    <main className="shell work-orders-shell vehicles-shell">
      <a className="nav-back" href="/cadastros" onClick={navigation}><ArrowLeft size={19}/>Voltar aos cadastros</a>
      <section className="page-title">
        <div><div className="eyebrow">CADASTROS MBL</div><h1>Veículos</h1><p>Placa, marca, modelo e ano.</p></div>
        <button className="button secondary" type="button" disabled={loading || occupied} onClick={() => void load()}><RefreshCw size={18}/>Atualizar</button>
      </section>
      {data?.regional && <p className="clean-access-note">Veículos do Pará · UF fixa PA.</p>}
      {notice && <p className="visit-success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!occupied && <button type="button" className="button work-order-create" disabled={!data || loading} onClick={event => open({action: 'create'}, event.currentTarget)}><Plus size={18}/>Cadastrar veículo</button>}
      {entry && data && <VehicleForm key={entry.action + ':' + (entry.vehicle?.id || 'new')} entry={entry} regional={data.regional} onClose={close} onSaved={result => saved(entry.action, result)}/>}
      {historyId && <VehicleHistory id={historyId} onClose={close}/>}
      <section className="panel" aria-busy={loading}>
        <div className="section-heading"><h2>{status === 'archived' ? 'Veículos arquivados' : status === 'all' ? 'Todos os veículos' : 'Veículos ativos'}</h2></div>
        <form className="vehicles-filters" onSubmit={event => {event.preventDefault(); setQuery(search.trim()); setPage(0);}}>
          <label className="field"><span>Buscar placa, marca, modelo ou UF</span><input type="search" maxLength={100} value={search} disabled={occupied} onChange={event => setSearch(event.target.value)}/></label>
          <label className="field"><span>Situação</span><select value={status} disabled={occupied} onChange={event => {setStatus(event.target.value); setPage(0);}}><option value="active">Ativos</option><option value="archived">Arquivados</option><option value="all">Todos</option></select></label>
          <button type="submit" className="button secondary" disabled={occupied || loading}><Search size={18}/>Buscar</button>
        </form>
        {loading ? <p role="status">Carregando veículos…</p> : !data ? <div className="empty"><h3>Lista indisponível</h3><button className="button secondary" type="button" onClick={() => void load()}>Tentar novamente</button></div>
          : !data.vehicles.length ? <div className="empty"><div className="empty-icon"><CarFront size={30}/></div><h3>Nenhum veículo neste filtro</h3><p>Altere a busca ou cadastre um veículo.</p></div>
            : data.vehicles.map(vehicle => <article key={vehicle.id} className="handover-card vehicle-card">
              <div className="section-heading"><div><h3 className="vehicle-plate">{vehicle.plate}</h3><p className="muted">{[vehicle.brand, vehicle.model].filter(Boolean).join(' · ') || 'Marca e modelo não informados'}</p></div><span className={'pill ' + (vehicle.archived_at ? 'neutral' : 'ok')}>{vehicle.archived_at ? 'Arquivado' : 'Ativo'}</span></div>
              <dl className="handover-details"><div><dt>Ano</dt><dd>{vehicle.year || 'Não informado'}</dd></div><div><dt>UF</dt><dd>{vehicle.state_code || 'Não informada'}</dd></div>{vehicle.archived_at && <div><dt>Arquivado em</dt><dd>{dateText(vehicle.archived_at)}</dd></div>}</dl>
              <div className="form-actions">
                <button type="button" className="button secondary edit-action" disabled={occupied} onClick={event => open({action: 'update', vehicle}, event.currentTarget)} aria-label={'Editar veículo ' + vehicle.plate}><Pencil size={16}/>Editar</button>
                <button type="button" className="button secondary edit-action" disabled={occupied} onClick={event => {trigger.current = event.currentTarget; setHistoryId(vehicle.id);}} aria-label={'Histórico do veículo ' + vehicle.plate}><History size={16}/>Histórico</button>
                <button type="button" className="button secondary edit-action" disabled={occupied} onClick={event => open({action: vehicle.archived_at ? 'restore' : 'archive', vehicle}, event.currentTarget)} aria-label={(vehicle.archived_at ? 'Restaurar veículo ' : 'Arquivar veículo ') + vehicle.plate}>{vehicle.archived_at ? <RotateCcw size={16}/> : <Archive size={16}/>} {vehicle.archived_at ? 'Restaurar' : 'Arquivar'}</button>
              </div>
            </article>)}
        {data && (page > 0 || data.has_more) && <nav className="vehicles-pagination" aria-label="Páginas de veículos"><button className="button secondary" type="button" disabled={loading || occupied || page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button className="button secondary" type="button" disabled={loading || occupied || !data.has_more} onClick={() => setPage(page + 1)}>Próxima</button></nav>}
      </section>
    </main>
  </>;
}

function VehicleForm({entry, regional, onClose, onSaved}: {entry: Entry; regional: boolean; onClose: () => void; onSaved: (result: Saved) => Promise<void>}) {
  const {action, vehicle} = entry;
  const statusAction = action === 'archive' || action === 'restore';
  const [plate, setPlate] = useState(vehicle?.plate || '');
  const [brand, setBrand] = useState(vehicle?.brand || '');
  const [model, setModel] = useState(vehicle?.model || '');
  const [year, setYear] = useState(vehicle?.year ? String(vehicle.year) : '');
  const [stateCode, setStateCode] = useState(regional ? 'PA' : vehicle?.state_code || '');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useRef(vehicle?.id || '');
  const requestId = useRef('');
  const busyRef = useRef(false);
  const failed = useRef(false);
  const alive = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {alive.current = true; heading.current?.focus(); return () => {alive.current = false;};}, []);
  function changed() {
    if (failed.current) {requestId.current = ''; failed.current = false;}
    setConfirmed(false);
    setError('');
  }
  function close() {if (!busyRef.current && window.confirm('Fechar sem salvar este formulário?')) onClose();}
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !confirmed) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (!id.current) id.current = crypto.randomUUID();
      if (!requestId.current) requestId.current = crypto.randomUUID();
      const form = new FormData();
      form.set('id', id.current);
      form.set('request_id', requestId.current);
      form.set('action', action);
      form.set('expected_revision', String(vehicle?.revision || 0));
      form.set('confirmed', 'yes');
      if (action !== 'create') form.set('reason', reason.trim());
      if (!statusAction) {
        form.set('plate', plate);
        form.set('brand', brand);
        form.set('model', model);
        form.set('year', year);
        form.set('state_code', regional ? 'PA' : stateCode);
      }
      const response = await fetch('/api/vehicles', {method: 'POST', body: form});
      const result = await readResponse<Saved>(response, 'Não foi possível confirmar o salvamento. Os dados continuam neste formulário; tente novamente.');
      if (result.id !== id.current || !Number.isSafeInteger(result.revision) || result.revision < 1) throw new Error('Resposta incompleta. Mantenha o formulário e tente novamente.');
      if (alive.current) await onSaved(result);
    } catch (cause) {
      failed.current = true;
      if (alive.current) setError(errorText(cause, 'Não foi possível salvar. Seus dados foram mantidos.'));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const title = action === 'create' ? 'Cadastrar veículo' : action === 'update' ? 'Editar veículo' : action === 'archive' ? 'Arquivar veículo' : 'Restaurar veículo';
  return <section className="panel vehicle-form" aria-labelledby="vehicle-form-title">
    <div className="section-heading"><h2 id="vehicle-form-title" tabIndex={-1} ref={heading}>{title}</h2><button type="button" className="button secondary" disabled={busy} aria-label="Fechar formulário" onClick={close}><X size={18}/></button></div>
    {statusAction && <div className="clean-inset"><strong>{vehicle?.plate}</strong><p>{action === 'archive' ? 'O veículo sairá da lista de ativos e poderá ser restaurado. Seu histórico será preservado.' : 'O veículo voltará à lista de ativos.'}</p></div>}
    {action === 'update' && vehicle?.archived_at && <p className="clean-access-note">Este veículo continuará arquivado após a edição.</p>}
    <form onSubmit={submit}>
      <fieldset className="correction-fields" disabled={busy}>
        {!statusAction && <>
          <div className="two-col"><label className="field"><span>Placa (obrigatória)</span><input autoComplete="off" autoCapitalize="characters" maxLength={20} required value={plate} placeholder="ABC1D23" onChange={event => {changed(); setPlate(event.target.value);}}/></label>
            <label className="field"><span>Marca (opcional)</span><input maxLength={100} value={brand} onChange={event => {changed(); setBrand(event.target.value);}}/></label></div>
          <div className="two-col"><label className="field"><span>Modelo (opcional)</span><input maxLength={100} value={model} onChange={event => {changed(); setModel(event.target.value);}}/></label>
            <label className="field"><span>Ano (opcional)</span><input inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={year} placeholder="2026" onChange={event => {changed(); setYear(event.target.value);}}/></label></div>
          <label className="field"><span>UF {regional ? '' : '(opcional)'}</span>{regional ? <input readOnly value="PA · Pará"/> : <select value={stateCode} onChange={event => {changed(); setStateCode(event.target.value);}}><option value="">Não informada</option>{Object.entries(BRAZIL_STATES).map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select>}<small>A UF é informada no cadastro e não é deduzida pela placa.</small></label>
        </>}
        {action !== 'create' && <label className="field"><span>Motivo (obrigatório)</span><textarea rows={3} maxLength={1000} required value={reason} onChange={event => {changed(); setReason(event.target.value);}}/></label>}
        <label className="confirm"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{action === 'archive' ? 'Conferi o veículo e confirmo o arquivamento reversível.' : action === 'restore' ? 'Conferi o veículo e confirmo a restauração.' : 'Conferi os dados e confirmo este cadastro.'}</span></label>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancelar</button><button className="button" type="submit" disabled={busy || !confirmed || (action !== 'create' && !reason.trim())}>{busy ? 'Salvando…' : action === 'archive' ? 'Arquivar veículo' : action === 'restore' ? 'Restaurar veículo' : 'Salvar veículo'}</button></div>
    </form>
  </section>;
}

function snapshotText(value: VehicleSnapshot | null) {
  return value ? [value.plate, value.brand || 'Marca não informada', value.model || 'Modelo não informado', value.year || 'Ano não informado', value.state_code || 'UF não informada', value.archived_at ? 'Arquivado' : 'Ativo'].join(' · ') : 'Cadastro ainda não existia';
}
function VehicleHistory({id, onClose}: {id: string; onClose: () => void}) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    heading.current?.focus();
    const timer = window.setTimeout(() => {
      setError('');
      void fetch('/api/vehicles?' + new URLSearchParams({id, history: 'yes'}), {cache: 'no-store', signal: controller.signal})
        .then(response => readResponse<HistoryData>(response, 'Não foi possível carregar o histórico.'))
        .then(result => {if (result.vehicle?.id !== id || !Array.isArray(result.events)) throw new Error('Histórico indisponível.'); if (!controller.signal.aborted) setData(result);})
        .catch(cause => {if (!controller.signal.aborted) {setData(null); setError(errorText(cause, 'Não foi possível carregar o histórico.'));}});
    }, 0);
    return () => {window.clearTimeout(timer); controller.abort();};
  }, [id, retry]);
  return <section className="panel vehicle-history" aria-labelledby="vehicle-history-title">
    <div className="section-heading"><h2 ref={heading} tabIndex={-1} id="vehicle-history-title">Histórico{data ? ' · ' + data.vehicle.plate : ''}</h2><button type="button" className="button secondary" onClick={onClose} aria-label="Fechar histórico"><X size={18}/></button></div>
    {error ? <><p className="error" role="alert">{error}</p><button type="button" className="button secondary" onClick={() => setRetry(retry + 1)}>Tentar novamente</button></> : !data ? <p role="status">Carregando histórico…</p> : <>
      {data.history_limited && <p className="clean-access-note">Exibindo as 100 alterações mais recentes disponíveis neste acesso.</p>}
      {!data.events.length && <p>Nenhuma alteração disponível neste acesso.</p>}
      {data.events.map(event => <article className="vehicle-history-event" key={event.id}><h3>{actionLabel[event.action]} · versão {event.revision}</h3><p className="muted">{dateText(event.created_at)} · {event.actor_name}</p><p>{event.reason}</p><dl><div><dt>Antes</dt><dd>{snapshotText(event.before_snapshot)}</dd></div><div><dt>Depois</dt><dd>{snapshotText(event.after_snapshot)}</dd></div></dl></article>)}
    </>}
  </section>;
}
