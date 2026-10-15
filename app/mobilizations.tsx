'use client';
import PhotoFileControls from './components/photo-file-controls';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft, CalendarDays, Camera, CheckCircle2, ClipboardList, ExternalLink, House, Plus, RefreshCw, Trash2, X} from 'lucide-react';
import ClientCatalogSelector, {type CatalogStatus} from './components/client-catalog-selector';
import {PropertyLocation} from './components/service-location';
import {propertyLabel} from '../lib/property-number';
import {
  MOBILIZATION_CATEGORIES, MOBILIZATION_STAGES, MOBILIZATION_TYPES, MOBILIZATION_BUILDING_TYPES, MAX_MOBILIZATION_PHOTOS,
  type MobilizationChecklist, type MobilizationEnvironment, type MobilizationStage,
} from '../lib/mobilizations';
import {
  appendMobilizationDraft, equipmentShortfall, equipmentUnknown, equipmentTemplate, needsEquipmentNote, ENVIRONMENT_KINDS, ROOM_LEVELS, makeMobilizationDraft, mobilizationDraftIssue,
  prepareMobilizationPhoto, type DraftSource, type EquipmentDraft, type MobilizationDraft,
} from './mobilization-form';
import './mobilizations.css';

type Property = {id: string; name: string; address: string; state_code?: string; control_number?: number};
type Snapshot = DraftSource & {
  property_name: string; address: string; client_name: string; cost_center_name: string;
  handover_id: string | null; handover_snapshot?: Handover | null; version: number;
};
type Mobilization = Snapshot & {
  id: string; status: MobilizationStage | 'delivered'; pending_count: number; equipment_shortfall_count: number; equipment_unknown_count: number;
  handover_link_status: 'none' | 'linked' | 'needs_review'; created_at: string; updated_at: string;
};
type Metadata = Omit<Mobilization, 'equipment' | 'checklist'>;
type Handover = {id: string; delivered_on: string; returned_on: string | null; slots: number; level: string};
type Evidence = {id: string; event_id: string; position: number; uploaded_at: string; equipment_item_id?: string | null; equipment_item_snapshot?: {id: string; label: string; environment_id: string | null; environment_label: string | null; planned: number | null; checked: number | null; condition?: string; version: number} | null};
type HistoryEvent = {id: string; action: string; before_snapshot: Snapshot | null; after_snapshot: Snapshot; note: string; actor_name: string; created_at: string};
type Detail = {mobilization: Mobilization; events: HistoryEvent[]; photos: Evidence[]; eligibleHandovers: Handover[]};
type Catalog = {mobilizations: Metadata[]; properties: Property[]; truncated?: boolean};
type Entry = 'create' | 'update' | 'link' | null;
const CHECK_STATUSES = {todo: 'A conferir', pending: 'Com pendência', done: 'Conferido', na: 'Não se aplica'} as const;
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Belem', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const date = (value?: string | null) => value ? new Date(value + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'Não informado';
const when = (value: string) => new Date(value).toLocaleString('pt-BR', {timeZone: 'America/Belem'});
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.';
const statusLabel = (value: string) => value === 'delivered' ? 'Entregue' : MOBILIZATION_STAGES[value as MobilizationStage] || value;
const photoUrl = (id: string) => '/api/mobilization-photos/' + encodeURIComponent(id);
const overdue = (row: Metadata) => row.status !== 'delivered' && row.status !== 'ready' && !!row.due_on && row.due_on < today();
async function read<T>(id?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/mobilizations' + (id ? '?id=' + encodeURIComponent(id) : ''), {cache: 'no-store', credentials: 'same-origin', signal});
  const value = await response.json() as {error?: string; id: string; version: number; alreadySaved?: boolean};
  if (!response.ok) throw new Error(value.error || 'Não foi possível carregar as mobilizações.');
  return value as T;
}
async function post(form: FormData) {
  const response = await fetch('/api/mobilizations', {method: 'POST', credentials: 'same-origin', body: form});
  const value = await response.json() as {error?: string; id: string; version: number; alreadySaved?: boolean};
  if (!response.ok) {
    const failure = new Error(value.error || 'Não foi possível salvar. Seu rascunho foi mantido.') as Error & {conflict?: boolean};
    failure.conflict = response.status === 409; throw failure;
  }
  return value as {id: string; version: number; alreadySaved?: boolean};
}
function Status({value}: {value: string}) {
  return <span className={'pill ' + (value === 'delivered' || value === 'ready' ? 'ok' : value === 'inspection' ? 'warning' : 'neutral')}>{statusLabel(value)}</span>;
}
function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
}
function focusHeading(ref: {current: HTMLElement | null}) {
  ref.current?.scrollIntoView?.({block: 'start'});
  ref.current?.focus({preventScroll: true});
}

export default function Mobilizations({displayName, accessTitle, initialId, initialData, initialNew=false}: {displayName: string; accessTitle: string; initialNew?:boolean; initialId?: string; initialData?: Catalog | null}) {
  const [data, setData] = useState<Catalog | null>(initialData ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [entry, setEntry] = useState<Entry>(initialNew?'create':null);
  const [loading, setLoading] = useState(!initialData), [opening, setOpening] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''), [stage, setStage] = useState(''), [deadline, setDeadline] = useState(''), [responsible, setResponsible] = useState('');
  const [photo, setPhoto] = useState('');
  const listGeneration = useRef(0), detailGeneration = useRef(0);
  const listAbort = useRef<AbortController | null>(null), detailAbort = useRef<AbortController | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null), createButton = useRef<HTMLButtonElement>(null);
  const load = useCallback(async () => {
    const generation = ++listGeneration.current;
    listAbort.current?.abort(); const controller = new AbortController(); listAbort.current = controller;
    setLoading(true);
    try {
      const next = await read<Catalog>(undefined, controller.signal);
      if (generation === listGeneration.current) { setData(next); setError(''); }
      return next;
    } catch (cause) {
      if (!controller.signal.aborted && generation === listGeneration.current) setError(errorMessage(cause));
      return null;
    } finally { if (generation === listGeneration.current) setLoading(false); }
  }, []);
  const open = useCallback(async (id: string) => {
    const generation = ++detailGeneration.current;
    detailAbort.current?.abort(); const controller = new AbortController(); detailAbort.current = controller;
    setOpening(true); setError('');
    try {
      const next = await read<Detail>(id, controller.signal);
      if (generation === detailGeneration.current) { setDetail(next); setEntry(null); }
    } catch (cause) {
      if (!controller.signal.aborted && generation === detailGeneration.current) setError(errorMessage(cause));
    } finally { if (generation === detailGeneration.current) setOpening(false); }
  }, []);
  useEffect(() => {
    if (!initialData) void load(); if (initialId) void open(initialId);
    return () => { listGeneration.current++; detailGeneration.current++; listAbort.current?.abort(); detailAbort.current?.abort(); };
  }, [initialId, initialData, load, open]);
  useEffect(() => { if (detail && !entry) focusHeading(detailHeading); }, [detail, entry]);
  function closeEntry() { setEntry(null); setError(''); setTimeout(() => { if (detail) focusHeading(detailHeading); else createButton.current?.focus(); }, 0); }
  async function saved(id: string, linked = false) {
    setEntry(null);
    setNotice(linked ? 'Entrega vinculada. O ciclo original e o histórico foram preservados.' : 'Mobilização salva. A atualização está no histórico.');
    await Promise.all([load(), open(id)]);
  }
  function back() { detailGeneration.current++; detailAbort.current?.abort(); setOpening(false); setDetail(null); setError(''); setPhoto(''); }
  const rows = data?.mobilizations ?? [];
  const filtered = rows.filter(row => (!stage || (stage === 'delivered' ? row.status === 'delivered' : row.stage === stage && row.status !== 'delivered')) &&
    (!responsible || row.responsible.toLocaleLowerCase('pt-BR').includes(responsible.toLocaleLowerCase('pt-BR'))) &&
    (!deadline || (deadline === 'overdue' ? overdue(row) : deadline === 'today' ? row.due_on === today() && row.status !== 'delivered' : deadline === 'none' ? !row.due_on : !!row.due_on && row.due_on > today() && row.status !== 'delivered')) &&
    [row.property_name, row.address, row.client_name, row.cost_center_name, row.responsible, MOBILIZATION_TYPES[row.housing_type]].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const current = detail?.mobilization;
  return <>
    <header className="topbar"><a className="brand" href="/"><img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza Facilities"/><span>MOBILIZA GESTÃO<br/><strong>Mobilização</strong></span></a><span className="clean-header-label">{accessTitle} · {displayName}</span></header>
    <main className="shell mobilizations-shell">
      {!entry && (detail ? <button className="nav-back" onClick={back}><ArrowLeft size={19}/>Voltar às mobilizações</button> : <a className="nav-back" href="/"><ArrowLeft size={19}/>Voltar ao painel</a>)}
      <section className="page-title"><div><div className="eyebrow">PREPARAÇÃO DOS IMÓVEIS</div><h1>Mobilização de repúblicas e alojamentos</h1><p>Acompanhe o levantamento, a preparação e a vistoria até a entrega do imóvel.</p></div>{!entry && <button className="button secondary" disabled={loading || opening} onClick={() => { if (current) void open(current.id); else void load(); }}><RefreshCw size={18}/>Atualizar</button>}</section>
      {notice && <p className="visit-success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}{data && <span> Os dados exibidos são da última leitura concluída.</span>}</p>}
      {opening && <p className="mobilization-loading" role="status">Carregando a ficha e o histórico…</p>}
      {(entry === 'create' || entry === 'update') && data ? <MobilizationForm key={entry === 'create' ? 'create' : current!.id + ':' + current!.version} source={entry === 'update' ? current : undefined} properties={data.properties} onRefresh={load} onClose={closeEntry} onSaved={saved}/>
        : entry === 'link' && detail ? <LinkHandoverForm detail={detail} onClose={closeEntry} onSaved={id => saved(id, true)}/>
        : !detail ? <>
          <div className="stats mobilization-stats">
            <article className="stat"><ClipboardList size={21}/><strong>{data ? rows.filter(row => row.status !== 'delivered').length : '—'}</strong><span>Em mobilização</span></article>
            <article className="stat"><CalendarDays size={21}/><strong>{data ? rows.filter(overdue).length : '—'}</strong><span>Prazo vencido</span></article>
            <article className="stat"><CheckCircle2 size={21}/><strong>{data ? rows.filter(row => row.status === 'ready').length : '—'}</strong><span>Prontas para entrega</span></article>
            <article className="stat"><House size={21}/><strong>{data ? rows.filter(row => row.status === 'delivered').length : '—'}</strong><span>Entregues</span></article>
          </div>
          <button ref={createButton} className="button mobilization-create" disabled={!data || loading || opening} onClick={() => { setEntry('create'); setNotice(''); setError(''); }}><Plus size={18}/>Nova mobilização</button>
          <section className="panel"><div className="section-heading"><h2>Mobilizações cadastradas</h2><span className="count">{filtered.length} registros</span></div>
            <div className="mobilization-filters">
              <label className="field"><span>Buscar imóvel, cliente ou centro de custo</span><input type="search" value={search} onChange={event => setSearch(event.target.value)}/></label>
              <label className="field"><span>Etapa / situação</span><select value={stage} onChange={event => setStage(event.target.value)}><option value="">Todas</option>{Object.entries(MOBILIZATION_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="delivered">Entregue</option></select></label>
              <label className="field"><span>Prazo</span><select value={deadline} onChange={event => setDeadline(event.target.value)}><option value="">Todos</option><option value="overdue">Vencido</option><option value="today">Hoje</option><option value="upcoming">Futuro</option><option value="none">Sem prazo informado</option></select></label>
              <label className="field"><span>Responsável informado</span><input value={responsible} onChange={event => setResponsible(event.target.value)}/></label>
            </div>
            {data?.truncated && <p className="today-alert">A lista atingiu o limite de consulta. Os totais refletem apenas os registros exibidos.</p>}
            {!filtered.length ? <div className="empty"><div className="empty-icon"><House size={30}/></div><h3>{loading ? 'Carregando…' : data ? 'Nenhuma mobilização neste filtro' : 'Dados indisponíveis'}</h3><p>{data ? 'Registre a preparação de um imóvel já cadastrado para acompanhar as próximas etapas.' : 'Toque em Atualizar para tentar novamente.'}</p></div> : filtered.map(row => <article className="handover-card mobilization-card" key={row.id}>
              <div className="section-heading"><div><small className="muted">{MOBILIZATION_TYPES[row.housing_type]}</small><h3>{row.property_name}</h3><p className="muted">{row.client_name} · {row.cost_center_name}</p></div><Status value={row.status}/></div>
              <p className="muted">Responsável informado: {row.responsible}</p><p className={overdue(row) ? 'mobilization-overdue' : 'muted'}>Prazo: {date(row.due_on)}{overdue(row) ? ' · Vencido' : ''}</p>
              <div className="mobilization-tags">{row.pending_count > 0 && <span className="pill warning">{row.pending_count} pendência(s) no checklist</span>}{row.equipment_shortfall_count > 0 && <span className="pill warning">{row.equipment_shortfall_count} item(ns) com falta informada</span>}{row.equipment_unknown_count > 0 && <span className="pill neutral">{row.equipment_unknown_count} item(ns) com quantidade não informada</span>}{row.handover_link_status === 'needs_review' && <span className="pill danger">Revisar vínculo de entrega</span>}</div>
              <button className="button secondary" disabled={opening} onClick={() => void open(row.id)}>Abrir ficha e histórico</button>
            </article>)}
          </section>
        </> : current && <>
          <section className="panel"><div className="section-heading"><div><div className="eyebrow">{MOBILIZATION_TYPES[current.housing_type]} · {current.building_type ? MOBILIZATION_BUILDING_TYPES[current.building_type] : ''} · MOB {current.id.slice(0, 8).toUpperCase()}</div><h2 ref={detailHeading} tabIndex={-1}>{current.property_name}</h2><p className="muted">{current.address}</p></div><Status value={current.status}/></div>
            <dl className="handover-details"><div><dt>Empresa / centro de custo</dt><dd>{current.client_name} · {current.cost_center_name}</dd></div><div><dt>Responsável informado</dt><dd>{current.responsible}</dd></div><div><dt>Prazo informado</dt><dd className={overdue(current) ? 'mobilization-overdue' : ''}>{date(current.due_on)}{overdue(current) ? ' · Vencido' : ''}</dd></div><div><dt>Vagas previstas</dt><dd>{current.planned_slots ?? 'Não informadas'}</dd></div></dl>
            <p className="muted mobilization-help">As vagas são planejamento informado. O responsável é declarado pela equipe.</p>
            {current.notes && <p className="notes">{current.notes}</p>}
            {current.handover_link_status === 'needs_review' && <p className="today-alert" role="status">O vínculo da entrega precisa de revisão. Confira o ciclo e os vínculos na área Entregas. O vínculo original permanece preservado no histórico.</p>}
            {current.status === 'delivered' && current.handover_snapshot && <p className="visit-success">Entrega vinculada em {date(current.handover_snapshot.delivered_on)} · {current.handover_snapshot.slots} vagas{current.handover_snapshot.returned_on ? ' · Devolução em ' + date(current.handover_snapshot.returned_on) : ''}.</p>}
            <div className="form-actions"><button className="button" disabled={opening} onClick={() => { setEntry('update'); setNotice(''); }}>Atualizar mobilização</button><a className="button secondary" href="/entregas">Registrar entrega</a>{current.stage === 'ready' && current.handover_link_status === 'none' && <button className="button secondary" disabled={opening} onClick={() => { setEntry('link'); setNotice(''); }}>Vincular entrega registrada</button>}</div>
            <p className="muted mobilization-help">A situação Entregue aparece após vincular um ciclo de entrega compatível já registrado.</p>
          </section>
          <PreparationSummary value={current}/>
          <details className="panel mobilization-property"><summary>Ficha atual do imóvel</summary><PropertyLocation key={current.property_id} propertyId={current.property_id} onChanged={async () => { await load(); }}/></details>
          <section className="panel"><h2>Histórico e evidências</h2><p className="muted mobilization-help">Cada atualização preserva os dados anteriores e as fotos já registradas.</p>
            {detail.events.length ? detail.events.map(event => <article className="history-item" key={event.id}>
              <div className="section-heading"><div><h3>{event.action === 'create' ? 'Mobilização criada' : event.action === 'link_handover' ? 'Entrega vinculada' : event.action === 'item_update' ? 'Móvel ou equipamento atualizado' : 'Mobilização atualizada'}</h3><p className="muted">{when(event.created_at)} (Belém) · Conta: {event.actor_name}</p></div><Status value={event.after_snapshot.stage}/></div>
              {event.note && <p className="notes">{event.note}</p>}
              <details className="mobilization-snapshot"><summary>Ver dados antes e depois</summary>{event.before_snapshot ? <SnapshotDetails title="Antes desta atualização" value={event.before_snapshot}/> : <p className="muted">Primeiro registro desta mobilização.</p>}<SnapshotDetails title="Depois desta atualização" value={event.after_snapshot}/></details>
              <EvidencePhotos photos={detail.photos.filter(item => item.event_id === event.id)} onOpen={setPhoto}/>
            </article>) : <p className="muted">Nenhuma atualização disponível.</p>}
            {detail.photos.some(item => !detail.events.some(event => event.id === item.event_id)) && <div className="history-item"><h3>Outras evidências preservadas</h3><EvidencePhotos photos={detail.photos.filter(item => !detail.events.some(event => event.id === item.event_id))} onOpen={setPhoto}/></div>}
          </section>
        </>}
    </main>
    {photo && <PhotoDialog url={photo} onClose={() => setPhoto('')}/>}
  </>;
}

function PreparationSummary({value}: {value: Pick<Snapshot, 'environments' | 'equipment' | 'checklist'>}) {
  const groups = [{id: null, label: 'Geral do imóvel'}, ...value.environments];
  return <section className="panel"><h2>Preparação por ambiente</h2>
    {!value.environments.length && <p className="muted mobilization-help">Nenhum ambiente individual informado.</p>}
    {groups.filter(group => group.id || value.equipment.some(item => !item.environment_id) || value.checklist.some(item => !item.environment_id)).map(group => {
      const equipment = value.equipment.filter(item => (item.environment_id || null) === group.id);
      const checklist = value.checklist.filter(item => (item.environment_id || null) === group.id);
      const environment = value.environments.find(item => item.id === group.id);
      return <div className="mobilization-summary-environment" key={group.id ?? 'general'}><h3>{group.label}</h3>
        {environment && <p className="muted">{ENVIRONMENT_KINDS[environment.kind]}{environment.level ? ' · ' + ROOM_LEVELS[environment.level] : ''}{environment.layout ? ' · ' + {double: 'Cama de casal', single: 'Camas de solteiro', bunk: 'Beliches'}[environment.layout] : ''}{environment.single_beds ? ' · ' + environment.single_beds + ' camas de solteiro' : ''}</p>}
        <h4>Móveis e equipamentos</h4>{!equipment.length ? <p className="muted">Nenhum item informado.</p> : <ul className="mobilization-read-list">{equipment.map(item => <li key={item.id}><strong>{item.label}</strong><span>Necessário: {item.planned ?? 'Não informado'} · Disponível informado: {item.checked ?? 'Não informado'}</span>{item.planned != null && item.checked != null ? <span className={'pill ' + (item.checked < item.planned ? 'warning' : 'neutral')}>Falta: {Math.max(0, item.planned - item.checked)}</span> : <span className="pill neutral">Falta ainda não calculada</span>}<p className="muted">Condição informada: {item.condition?.trim() || 'Não informada'}</p>{item.note && <p className="notes">{item.note}</p>}</li>)}</ul>}
        <h4>Checklist</h4>{checklist.length ? <ul className="mobilization-read-list">{checklist.map(item => <li key={item.id}><strong>{item.label}</strong><small>{MOBILIZATION_CATEGORIES[item.category]}</small><span className={'pill ' + (item.status === 'pending' ? 'warning' : item.status === 'done' ? 'ok' : 'neutral')}>{CHECK_STATUSES[item.status]}</span>{item.note && <p className="notes">{item.note}</p>}</li>)}</ul> : <p className="muted">Nenhum item de checklist neste ambiente.</p>}
      </div>;
    })}
  </section>;
}
function equipmentTemplateAvailable(environment: MobilizationEnvironment, buildingType: MobilizationDraft['building_type']) {
  return environment.kind === 'common' ? buildingType === 'building' : environment.kind === 'bedroom' && (!!environment.level && environment.level !== 'operacional' || environment.level === 'operacional' && (environment.layout === 'bunk' || environment.layout === 'single' && !!environment.single_beds));
}
function EnvironmentSelect({environments, value, onChange}: {environments: MobilizationEnvironment[]; value: string | null; onChange: (id: string | null) => void}) {
  return <label className="field"><span>Ambiente</span><select value={value ?? ''} onChange={event => onChange(event.target.value || null)}><option value="">Geral do imóvel</option>{environments.map(item => <option value={item.id} key={item.id}>{item.label || 'Ambiente sem nome'}</option>)}</select></label>;
}
function SnapshotDetails({title, value}: {title: string; value: Snapshot}) {
  return <section className="mobilization-snapshot-values"><h4>{title} · versão {value.version}</h4><dl className="handover-details"><div><dt>Imóvel / endereço</dt><dd>{value.property_name} · {value.address}</dd></div><div><dt>Empresa / centro de custo</dt><dd>{value.client_name} · {value.cost_center_name}</dd></div><div><dt>Tipo / etapa</dt><dd>{MOBILIZATION_TYPES[value.housing_type]} · {value.building_type ? MOBILIZATION_BUILDING_TYPES[value.building_type] : ''} · {statusLabel(value.stage)}</dd></div><div><dt>Responsável informado</dt><dd>{value.responsible}</dd></div><div><dt>Prazo / vagas previstas</dt><dd>{date(value.due_on)} · {value.planned_slots ?? 'Vagas não informadas'}</dd></div></dl>{value.notes && <p className="notes">{value.notes}</p>}{value.handover_snapshot && <p>Entrega preservada: {date(value.handover_snapshot.delivered_on)} · {value.handover_snapshot.slots} vagas.</p>}<PreparationSummary value={value}/></section>;
}
function EvidencePhotos({photos, onOpen}: {photos: Evidence[]; onOpen: (url: string) => void}) {
  return <div className="mobilization-photos">{[...photos].sort((a, b) => a.position - b.position).map((item, index) => <button type="button" key={item.id} onClick={() => onOpen(photoUrl(item.id))}><img src={photoUrl(item.id)} alt={item.equipment_item_snapshot?.label ? 'Evidência de ' + item.equipment_item_snapshot.label : 'Evidência geral ' + (index + 1) + ' da mobilização'} loading="lazy" decoding="async" width={260} height={180}/><span>Ampliar foto {index + 1}{item.equipment_item_id ? <><strong className="mobilization-photo-item">{item.equipment_item_snapshot?.label || 'Item sem nome registrado na foto'}</strong><small className="mobilization-photo-caption">Condição no registro: {item.equipment_item_snapshot?.condition?.trim() || 'Não informada'}</small>{item.equipment_item_snapshot?.environment_label && <small className="mobilization-photo-caption">{item.equipment_item_snapshot.environment_label}</small>}</> : <small className="mobilization-photo-caption">Evidência geral da mobilização</small>}</span></button>)}</div>;
}
function PhotoDialog({url, onClose}: {url: string; onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return createPortal(<dialog ref={dialog} className="mobilization-photo-dialog" aria-label="Evidência da mobilização ampliada" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><button type="button" className="button secondary" aria-label="Fechar foto ampliada" onClick={onClose}><X size={20}/>Fechar</button><img src={url} alt="Evidência da mobilização ampliada"/><a className="button secondary" href={url} target="_blank" rel="noopener noreferrer">Abrir foto em outra aba<ExternalLink size={16}/></a></dialog>, document.body);
}

function MobilizationForm({source, properties, onRefresh, onClose, onSaved}: {source?: Mobilization; properties: Property[]; onRefresh: () => Promise<Catalog | null>; onClose: () => void; onSaved: (id: string) => Promise<void>}) {
  const [draft, setDraft] = useState(() => makeMobilizationDraft(source));
  const [dirty, setDirty] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('loading');
  const [files, setFiles] = useState<File[]>([]), [previews, setPreviews] = useState<string[]>([]);
  const [photoEquipmentIds, setPhotoEquipmentIds] = useState<(string | null)[]>([]);
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(''), [conflict, setConflict] = useState(false), [refreshNotice, setRefreshNotice] = useState('');
  const requestId = useRef(crypto.randomUUID()), inFlight = useRef(false), preparation = useRef(false), alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useLeaveWarning(dirty);
  useEffect(() => { alive.current = true; focusHeading(heading); return () => { alive.current = false; }; }, []);
  useEffect(() => { const urls = files.map(file => URL.createObjectURL(file)); setPreviews(urls); return () => urls.forEach(url => URL.revokeObjectURL(url)); }, [files]);
  function markChanged() { requestId.current = crypto.randomUUID(); setDirty(true); setConfirmed(false); }
  function change<K extends keyof MobilizationDraft>(key: K, value: MobilizationDraft[K]) { setDraft(current => ({...current, [key]: value})); markChanged(); }
  function changeEquipment(id: string, update: Partial<EquipmentDraft>) { setDraft(current => ({...current, equipment: current.equipment.map(item => item.id === id ? {...item, ...update} : item)})); markChanged(); }
  function changeCheck(id: string, update: Partial<MobilizationChecklist>) { setDraft(current => ({...current, checklist: current.checklist.map(item => item.id === id ? {...item, ...update} : item)})); markChanged(); }
  function changeEnvironment(id: string, update: Partial<MobilizationEnvironment>) { setDraft(current => ({...current, environments: current.environments.map(item => item.id === id ? {...item, ...update} : item)})); markChanged(); }
  function removeEnvironment(environment: MobilizationEnvironment) {
    const linked = draft.equipment.some(item => item.environment_id === environment.id) || draft.checklist.some(item => item.environment_id === environment.id);
    if (linked && !window.confirm('Remover este ambiente do rascunho? Os móveis, equipamentos e itens de checklist serão mantidos em Geral do imóvel.')) return;
    setDraft(current => ({...current, environments: current.environments.filter(item => item.id !== environment.id), equipment: current.equipment.map(item => item.environment_id === environment.id ? {...item, environment_id: null} : item), checklist: current.checklist.map(item => item.environment_id === environment.id ? {...item, environment_id: null} : item)}));
    markChanged();
  }
  function applyTemplate(environment: MobilizationEnvironment) {
    if (!environment.label.trim()) { setError('Dê um nome ao ambiente antes de aplicar o padrão.'); return; }
    const template = equipmentTemplate(environment, draft.building_type);
    if (!template) { setError('Escolha o nível e a configuração deste quarto. Para operacional com camas de solteiro, escolha explicitamente 2 ou 3 camas.'); return; }
    const existing = draft.equipment.filter(item => item.environment_id === environment.id);
    if (draft.equipment.length - existing.length + template.length > 100) { setError('O padrão ultrapassaria o limite de 100 móveis e equipamentos.'); return; }
    if (existing.length && !window.confirm('Substituir os móveis e equipamentos de ' + environment.label + ' pelo padrão? As quantidades e observações desses itens no rascunho serão substituídas.')) return;
    change('equipment', [...draft.equipment.filter(item => item.environment_id !== environment.id), ...template]); setError('');
  }
  function close() { if (!dirty || window.confirm('Fechar e descartar as alterações ainda não salvas?')) onClose(); }
  async function addPhotos(input: HTMLInputElement) {
    const added = Array.from(input.files ?? []); input.value = '';
    if (preparation.current || inFlight.current || !added.length) return;
    if (files.length + added.length > MAX_MOBILIZATION_PHOTOS) { setError('Selecione até 3 fotos por atualização.'); return; }
    preparation.current = true; setPreparing(true); setError('');
    try {
      const prepared: File[] = [];
      // Prepare one at a time to keep peak memory bounded on phones.
      for (const file of added) prepared.push(await prepareMobilizationPhoto(file));
      if (alive.current) { setFiles(current => [...current, ...prepared]); setPhotoEquipmentIds(current => [...current, ...prepared.map(() => null)]); markChanged(); }
    } catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { preparation.current = false; if (alive.current) setPreparing(false); }
  }
  async function refreshProperties() {
    setRefreshing(true); setRefreshNotice('');
    const refreshed = await onRefresh();
    if (alive.current) { setRefreshing(false); setRefreshNotice(refreshed ? 'Opções de imóveis atualizadas. Escolha o imóvel cadastrado; os campos foram mantidos.' : 'Não foi possível atualizar os imóveis. Os campos foram mantidos.'); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || preparation.current) return;
    const issue = mobilizationDraftIssue(draft, !!source);
    if (issue || catalogStatus !== 'ready' || !confirmed) { setError(issue || (catalogStatus !== 'ready' ? 'Atualize e confira empresa e centro de custo antes de salvar.' : 'Confirme os dados antes de salvar.')); return; }
    if (photoEquipmentIds.some(id => id !== null && !draft.equipment.some(item => item.id === id))) { setError('Um item associado a uma foto foi removido do rascunho. Escolha outro item ou Evidência geral para essa foto.'); return; }
    const form = new FormData(); appendMobilizationDraft(form, draft);
    form.set('action', source ? 'update' : 'create'); form.set('request_id', requestId.current); form.set('confirmed', 'yes');
    if (source) { form.set('id', source.id); form.set('expected_version', String(source.version)); }
    for (const file of files) form.append('photos', file);
    if (photoEquipmentIds.some(id => id !== null)) form.set('photo_equipment_ids', JSON.stringify(photoEquipmentIds));
    inFlight.current = true; setBusy(true); setError(''); setConflict(false);
    try {
      const saved = await post(form);
      if (alive.current) { setDirty(false); await onSaved(saved.id); }
    } catch (cause) {
      if (alive.current) { setError(errorMessage(cause)); setConflict(!!(cause as Error & {conflict?: boolean}).conflict); }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  const missing = equipmentShortfall(draft.equipment), unknown = equipmentUnknown(draft.equipment);
  const readyBlocked = draft.stage === 'ready' && (!draft.checklist.length || draft.checklist.some(item => !['done', 'na'].includes(item.status)) || missing.length > 0 || unknown.length > 0);
  const selected = properties.find(item => item.id === draft.property_id);
  return <section className="panel mobilization-form-panel"><div className="section-heading"><h2 ref={heading} tabIndex={-1}>{source ? 'Atualizar mobilização' : 'Nova mobilização'}</h2><button type="button" className="button secondary" aria-label="Fechar formulário de mobilização" disabled={busy || preparing} onClick={close}><X size={18}/>Fechar</button></div>
    <form onSubmit={save}>
      <fieldset className="mobilization-fields" disabled={busy || preparing}>
        <label className="field"><span>Imóvel cadastrado</span><select value={draft.property_id} required onChange={event => change('property_id', event.target.value)}><option value="">Selecione o imóvel</option>{source && !properties.some(item => item.id === source.property_id) && <option value={source.property_id}>{source.property_name} · Imóvel deste registro</option>}{properties.map(item => <option key={item.id} value={item.id}>{propertyLabel(item)}{item.state_code ? ' · ' + item.state_code : ''} · {item.address}</option>)}</select></label>
        <div className="form-actions mobilization-property-actions"><a className="text-button" href="/imoveis" target="_blank" rel="noopener noreferrer">Cadastrar outro imóvel em nova aba<ExternalLink size={15}/></a><button type="button" className="button secondary" disabled={refreshing} onClick={() => void refreshProperties()}><RefreshCw size={16}/>{refreshing ? 'Atualizando imóveis…' : 'Atualizar opções de imóveis'}</button></div>
        <p className="muted mobilization-help">Depois de cadastrar o imóvel na outra aba, atualize as opções e selecione o imóvel salvo. Seu rascunho permanece aqui.</p>{!properties.length && !source && <p className="today-alert">Cadastre primeiro um imóvel para iniciar a mobilização.</p>}{refreshNotice && <p className="mobilization-help" role="status">{refreshNotice}</p>}
        <ClientCatalogSelector required clientId={draft.client_id} centerId={draft.cost_center_id} onClientChange={value => change('client_id', value)} onCenterChange={value => change('cost_center_id', value)} disabled={busy || preparing} onStatusChange={setCatalogStatus} historicalClient={source ? {id: source.client_id, name: source.client_name} : null} historicalCenter={source ? {id: source.cost_center_id, client_id: source.client_id, name: source.cost_center_name} : null}/>
        <div className="two-col"><label className="field"><span>Tipo de moradia</span><select value={draft.housing_type} onChange={event => change('housing_type', event.target.value as MobilizationDraft['housing_type'])}>{Object.entries(MOBILIZATION_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Responsável informado</span><input value={draft.responsible} onChange={event => change('responsible', event.target.value)} maxLength={120} required autoComplete="off"/><small>Nome declarado pela equipe.</small></label></div>
        <div className="two-col"><label className="field"><span>Prazo da preparação (opcional)</span><input type="date" value={draft.due_on} onChange={event => change('due_on', event.target.value)}/></label><label className="field"><span>Vagas previstas (opcional)</span><input type="number" inputMode="numeric" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={draft.planned_slots} onChange={event => change('planned_slots', event.target.value)}/><small>Previsão de vagas para a entrega.</small></label></div>
        <label className="field"><span>Etapa da preparação</span><select value={draft.stage} onChange={event => change('stage', event.target.value as MobilizationStage)}>{Object.entries(MOBILIZATION_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <fieldset className="clean-inset mobilization-section"><legend>Casa, prédio e ambientes</legend>
          <label className="field"><span>Tipo de imóvel</span><select value={draft.building_type} required onChange={event => change('building_type', event.target.value as MobilizationDraft['building_type'])}><option value="">Selecione Casa ou Prédio</option>{Object.entries(MOBILIZATION_BUILDING_TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <p className="muted">Cadastre cada quarto separadamente e inclua sala, cozinha, lavanderia ou área de vivência. Um mesmo imóvel pode ter quartos de níveis diferentes.</p>
          {draft.environments.map((environment, index) => <div className="mobilization-edit-item" key={environment.id}>
            <div className="section-heading"><h3>Ambiente {index + 1}</h3><button type="button" className="button secondary" aria-label={'Remover ambiente ' + (index + 1) + ' do rascunho'} onClick={() => removeEnvironment(environment)}><Trash2 size={16}/>Remover</button></div>
            <div className="two-col"><label className="field"><span>Nome do ambiente</span><input value={environment.label} required maxLength={200} placeholder="Ex.: Quarto 01, cozinha térreo" onChange={event => changeEnvironment(environment.id, {label: event.target.value})}/></label><label className="field"><span>Tipo de ambiente</span><select value={environment.kind} onChange={event => changeEnvironment(environment.id, {kind: event.target.value as MobilizationEnvironment['kind'], level: null, layout: null, single_beds: null})}>{Object.entries(ENVIRONMENT_KINDS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
            {environment.kind === 'bedroom' && <><label className="field"><span>Nível deste quarto (opcional)</span><select value={environment.level ?? ''} onChange={event => { const level = (event.target.value || null) as MobilizationEnvironment['level']; changeEnvironment(environment.id, {level, layout: level === 'staff' ? 'double' : level === 'tecnico' || level === 'encarregado' ? 'single' : null, single_beds: level === 'tecnico' || level === 'encarregado' ? 2 : null}); }}><option value="">Sem padrão definido</option>{Object.entries(ROOM_LEVELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              {environment.level === 'operacional' && <div className="two-col"><label className="field"><span>Configuração operacional</span><select value={environment.layout ?? ''} onChange={event => changeEnvironment(environment.id, {layout: (event.target.value || null) as MobilizationEnvironment['layout'], single_beds: null})}><option value="">Selecione para aplicar o padrão</option><option value="single">Camas de solteiro</option><option value="bunk">Beliches</option></select></label>{environment.layout === 'single' && <label className="field"><span>Camas de solteiro por quarto</span><select value={environment.single_beds ?? ''} onChange={event => changeEnvironment(environment.id, {single_beds: event.target.value ? Number(event.target.value) as 2 | 3 : null})}><option value="">Escolha 2 ou 3</option><option value="2">2 camas de solteiro</option><option value="3">3 camas de solteiro</option></select></label>}</div>}
              <p className="muted mobilization-help">{environment.level === 'staff' ? 'Padrão deste quarto: 1 cama de casal.' : environment.level === 'tecnico' || environment.level === 'encarregado' ? 'Padrão deste quarto: 2 camas de solteiro.' : environment.level === 'operacional' && environment.layout === 'bunk' ? 'Padrão deste quarto: 2 beliches e 4 colchões de solteiro.' : environment.level === 'operacional' && environment.layout === 'single' && environment.single_beds ? 'Padrão deste quarto: ' + environment.single_beds + ' camas de solteiro.' : 'Escolha um padrão ou adicione os móveis manualmente.'}</p>
              <button type="button" className="button secondary" disabled={!equipmentTemplateAvailable(environment, draft.building_type)} onClick={() => applyTemplate(environment)}>Aplicar padrão ao ambiente</button>
            </>}
            {environment.kind === 'common' && draft.building_type === 'building' && <><p className="muted mobilization-help">Sugestão para a área de vivência: TV, bebedouro e cadeiras. As quantidades ficam em branco para você informar.</p><button type="button" className="button secondary" onClick={() => applyTemplate(environment)}>Sugerir itens da área de vivência</button></>}
            {environment.kind !== 'bedroom' && !(environment.kind === 'common' && draft.building_type === 'building') && <p className="muted mobilization-help">Adicione abaixo os móveis e equipamentos deste ambiente, com as quantidades que você informar.</p>}
          </div>)}
          <button type="button" className="button secondary" disabled={draft.environments.length >= 100} onClick={() => change('environments', [...draft.environments, {id: crypto.randomUUID(), label: '', kind: 'bedroom', level: null, layout: null, single_beds: null}])}><Plus size={16}/>Adicionar ambiente</button>
          <p className="muted mobilization-help">O padrão preenche apenas o necessário daquele ambiente. Você pode ajustar os itens; disponível e vagas continuam sem preenchimento automático. Alterar o nível não substitui os itens até aplicar o padrão novamente.</p>
        </fieldset>
        <fieldset className="clean-inset mobilization-section"><legend>Móveis e equipamentos por ambiente</legend><p className="muted">Informe o necessário e o disponível de cada item. Em branco significa ainda não informado; zero precisa ser informado pela equipe.</p>
          {draft.equipment.map((item, index) => <div className="mobilization-edit-item" key={item.id}><div className="section-heading"><h3>Item {index + 1}</h3><button type="button" className="button secondary" aria-label={'Remover móvel ou equipamento ' + (index + 1) + ' do rascunho'} onClick={() => change('equipment', draft.equipment.filter(row => row.id !== item.id))}><Trash2 size={16}/><span>Remover</span></button></div><EnvironmentSelect environments={draft.environments} value={item.environment_id} onChange={environment_id => changeEquipment(item.id, {environment_id})}/><label className="field"><span>Móvel ou equipamento</span><input value={item.label} maxLength={200} required onChange={event => changeEquipment(item.id, {label: event.target.value})}/></label><div className="two-col"><label className="field"><span>Necessário</span><input type="number" inputMode="numeric" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={item.planned} placeholder="Não informado" onChange={event => changeEquipment(item.id, {planned: event.target.value})}/></label><label className="field"><span>Disponível informado</span><input type="number" inputMode="numeric" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={item.checked} placeholder="Não informado" onChange={event => changeEquipment(item.id, {checked: event.target.value})}/></label></div><label className="field"><span>Condição informada (opcional)</span><input value={item.condition ?? ''} maxLength={200} list="mobilization-condition-suggestions" placeholder="Ex.: bom estado, precisa de reparo" onChange={event => changeEquipment(item.id, {condition: event.target.value})}/><small>Condição declarada pela equipe, sem preenchimento automático.</small></label><label className="field"><span>Observação{draft.stage === 'inspection' && needsEquipmentNote(item) ? ' da pendência (obrigatória)' : ' (opcional)'}</span><textarea value={item.note} maxLength={2000} rows={2} required={draft.stage === 'inspection' && needsEquipmentNote(item)} onChange={event => changeEquipment(item.id, {note: event.target.value})}/></label></div>)}
          <datalist id="mobilization-condition-suggestions"><option value="Bom"/><option value="Regular"/><option value="Danificado"/></datalist>
          {!draft.equipment.length && <p className="muted mobilization-help">Nenhum móvel ou equipamento informado.</p>}<button type="button" className="button secondary" disabled={draft.equipment.length >= 100} onClick={() => change('equipment', [...draft.equipment, {id: crypto.randomUUID(), label: '', environment_id: null, planned: '', checked: '', note: ''}])}><Plus size={16}/>Adicionar móvel ou equipamento</button>
          {(missing.length > 0 || unknown.length > 0) && <p className="mobilization-help">{missing.length} item(ns) com falta informada · {unknown.length} item(ns) com quantidade não informada. Na vistoria, explique as pendências. Para ficar pronta, informe as quantidades sem faltas.</p>}
        </fieldset>
        <fieldset className="clean-inset mobilization-section"><legend>Checklist da mobilização</legend><p className="muted">Ajuste os itens e registre o que foi conferido. Os itens novos começam como A conferir.</p>
          {draft.checklist.map((item, index) => <div className="mobilization-edit-item" key={item.id}><div className="section-heading"><h3>Conferência {index + 1}</h3><button type="button" className="button secondary" aria-label={'Remover item ' + (index + 1) + ' do checklist no rascunho'} onClick={() => change('checklist', draft.checklist.filter(row => row.id !== item.id))}><Trash2 size={16}/><span>Remover</span></button></div><EnvironmentSelect environments={draft.environments} value={item.environment_id} onChange={environment_id => changeCheck(item.id, {environment_id})}/><label className="field"><span>Item a conferir</span><input value={item.label} maxLength={200} required onChange={event => changeCheck(item.id, {label: event.target.value})}/></label><div className="two-col"><label className="field"><span>Categoria</span><select value={item.category} onChange={event => changeCheck(item.id, {category: event.target.value as MobilizationChecklist['category']})}>{Object.entries(MOBILIZATION_CATEGORIES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="field"><span>Situação da conferência</span><select value={item.status} onChange={event => changeCheck(item.id, {status: event.target.value as MobilizationChecklist['status']})}>{Object.entries(CHECK_STATUSES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div><label className="field"><span>{item.status === 'pending' ? 'Descreva a pendência (obrigatório)' : 'Observação (opcional)'}</span><textarea value={item.note} rows={2} maxLength={2000} required={item.status === 'pending'} onChange={event => changeCheck(item.id, {note: event.target.value})}/></label></div>)}
          <button type="button" className="button secondary" disabled={draft.checklist.length >= 100} onClick={() => change('checklist', [...draft.checklist, {id: crypto.randomUUID(), label: '', environment_id: null, category: 'structure', status: 'todo', note: ''}])}><Plus size={16}/>Adicionar item ao checklist</button>
        </fieldset>
        {readyBlocked && <p className="today-alert" role="status">Antes de salvar como Pronta para entrega, conclua o checklist e informe as quantidades necessárias e disponíveis, sem faltas.</p>}
        <label className="field"><span>Observações da mobilização (opcional)</span><textarea value={draft.notes} maxLength={4000} rows={3} onChange={event => change('notes', event.target.value)}/></label>
        {source && <><label className="field"><span>Motivo desta atualização</span><textarea value={draft.note} required maxLength={2000} rows={2} onChange={event => change('note', event.target.value)} placeholder="O que mudou ou foi conferido nesta atualização"/></label><label className="confirm"><input type="checkbox" checked={draft.refresh_snapshot} onChange={event => change('refresh_snapshot', event.target.checked)}/><span>Atualizar nesta versão os nomes e o endereço a partir dos cadastros atuais. As versões anteriores ficam preservadas.</span></label></>}
        <fieldset className="clean-inset mobilization-section"><legend>Fotos desta atualização (opcional)</legend><p className="muted">Até 3 fotos, preparadas no dispositivo para no máximo 4 MB cada. O envio acontece ao salvar.</p><PhotoFileControls multiple disabled={files.length>=3||busy||preparing} fileLabel="Escolher fotos" onSelect={addPhotos}/>
          <div className="mobilization-photos mobilization-new-photos">{previews.map((url, index) => <div key={url}><img src={url} alt={'Foto ' + (index + 1) + ' ainda não enviada'} width={260} height={180}/><label className="field mobilization-photo-association"><span>Foto {index + 1}: associar ao item (opcional)</span><select value={photoEquipmentIds[index] ?? ''} onChange={event => { const id = event.target.value || null; setPhotoEquipmentIds(current => current.map((value, at) => at === index ? id : value)); markChanged(); }}><option value="">Evidência geral da mobilização</option>{photoEquipmentIds[index] && !draft.equipment.some(item => item.id === photoEquipmentIds[index]) && <option value={photoEquipmentIds[index]!}>Item removido do rascunho: escolha novamente</option>}{draft.equipment.map(item => <option key={item.id} value={item.id}>{item.label || 'Item sem nome'} · {draft.environments.find(environment => environment.id === item.environment_id)?.label || 'Geral do imóvel'}</option>)}</select></label><button type="button" className="button secondary" onClick={() => { setFiles(current => current.filter((_, at) => at !== index)); setPhotoEquipmentIds(current => current.filter((_, at) => at !== index)); markChanged(); }}>Descartar foto {index + 1}</button></div>)}</div>
          {source && <p className="muted mobilization-help">As evidências já registradas permanecem no histórico.</p>}
        </fieldset>
        <label className="confirm"><input type="checkbox" checked={confirmed} required onChange={event => setConfirmed(event.target.checked)}/><span>Conferi imóvel, empresa, centro de custo e as informações desta mobilização.</span></label>
      </fieldset>
      {preparing && <p role="status">Preparando fotos no dispositivo…</p>}
      {error && <p className="error" role="alert">{error} Os campos e as fotos selecionadas foram mantidos.</p>}
      {conflict && source && <p className="today-alert">Consulte a versão atual antes de tentar novamente. Feche este rascunho apenas após conferir o que precisa reaplicar. <a className="text-button" href={'/mobilizacoes?id=' + encodeURIComponent(source.id)} target="_blank" rel="noopener noreferrer">Ver versão atual em outra aba</a></p>}
      <div className="form-actions"><button type="button" className="button secondary" disabled={busy || preparing} onClick={close}>Cancelar</button><button className="button" disabled={busy || preparing || catalogStatus !== 'ready' || refreshing}>{busy ? 'Salvando…' : source ? 'Salvar atualização' : 'Salvar mobilização'}</button></div>
    </form>
    {draft.property_id && <details className="mobilization-property mobilization-form-property"><summary>Ver ficha do imóvel selecionado{selected ? ': ' + propertyLabel(selected) : ''}</summary><PropertyLocation key={draft.property_id} propertyId={draft.property_id} onChanged={async () => { await onRefresh(); }}/></details>}
  </section>;
}

function LinkHandoverForm({detail, onClose, onSaved}: {detail: Detail; onClose: () => void; onSaved: (id: string) => Promise<void>}) {
  const [handoverId, setHandoverId] = useState(''), [note, setNote] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID()), inFlight = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const dirty = !!handoverId || !!note || confirmed;
  useLeaveWarning(dirty);
  useEffect(() => { focusHeading(heading); }, []);
  function close() { if (!dirty || window.confirm('Fechar sem salvar o vínculo desta entrega?')) onClose(); }
  function change() { requestId.current = crypto.randomUUID(); setConfirmed(false); }
  const selected = detail.eligibleHandovers.find(row => row.id === handoverId);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    if (!selected || !note.trim() || !confirmed) { setError('Escolha o ciclo, informe o motivo e confirme os vínculos.'); return; }
    const form = new FormData();
    form.set('action', 'link_handover'); form.set('id', detail.mobilization.id); form.set('expected_version', String(detail.mobilization.version));
    form.set('request_id', requestId.current); form.set('handover_id', handoverId); form.set('note', note); form.set('confirmed', 'yes'); form.set('link_confirmed', 'yes');
    inFlight.current = true; setBusy(true); setError('');
    try { const saved = await post(form); await onSaved(saved.id); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const row = detail.mobilization;
  return <section className="panel mobilization-form-panel"><div className="section-heading"><h2 ref={heading} tabIndex={-1}>Vincular entrega registrada</h2><button type="button" className="button secondary" disabled={busy} aria-label="Fechar vínculo de entrega" onClick={close}><X size={18}/>Fechar</button></div><p><strong>{row.property_name}</strong> · {row.client_name} · {row.cost_center_name}</p><p className="muted mobilization-help">Escolha o ciclo real correspondente a esta mobilização. A lista mostra as entregas compatíveis com o imóvel, a empresa e o centro de custo.</p>
    {!detail.eligibleHandovers.length ? <><p className="today-alert">Nenhuma entrega compatível disponível para vincular. Registre ou confira o ciclo em Entregas e depois atualize esta ficha.</p><div className="form-actions"><a className="button secondary" href="/entregas">Registrar entrega</a><button type="button" className="button secondary" onClick={close}>Voltar à ficha</button></div></> : <form onSubmit={save}><fieldset className="mobilization-fields" disabled={busy}><label className="field"><span>Ciclo de entrega</span><select value={handoverId} required onChange={event => { setHandoverId(event.target.value); change(); }}><option value="">Selecione a entrega registrada</option>{detail.eligibleHandovers.map(item => <option key={item.id} value={item.id}>{date(item.delivered_on)} · {item.slots} vagas · {item.returned_on ? 'Devolvida em ' + date(item.returned_on) : 'Em uso'} · Ciclo {item.id.slice(0, 8).toUpperCase()}</option>)}</select></label>
      {selected && <dl className="handover-details"><div><dt>Data da entrega</dt><dd>{date(selected.delivered_on)}</dd></div><div><dt>Vagas entregues</dt><dd>{selected.slots}</dd></div><div><dt>Devolução</dt><dd>{selected.returned_on ? date(selected.returned_on) : 'Ainda em uso'}</dd></div></dl>}
      <label className="field"><span>Motivo / identificação deste vínculo</span><textarea value={note} required maxLength={2000} rows={3} onChange={event => { setNote(event.target.value); change(); }}/></label><label className="confirm"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Conferi que este ciclo, seu imóvel, empresa, centro de custo, datas e vagas correspondem à mobilização.</span></label></fieldset>
      {error && <p className="error" role="alert">{error} Sua seleção foi mantida. Se a ficha mudou, confira a versão atual antes de refazer o vínculo.</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancelar</button><button className="button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar vínculo de entrega'}</button></div>
    </form>}
  </section>;
}
