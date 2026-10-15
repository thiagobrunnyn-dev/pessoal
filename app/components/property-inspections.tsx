'use client';

import {useCallback, useEffect, useRef, useState, type ComponentType} from 'react';
import {createPortal} from 'react-dom';
import {Download, Pencil, Plus, RefreshCw, X} from 'lucide-react';
import type {InspectionDetail, InspectionPropertySnapshot, InspectionSummary} from '../../lib/property-inspections';
import {INSPECTION_LABELS, inspectionPhotoUrl, inspectionSignatureUrl, numberedEnvironments} from '../property-inspection-form';
import type {InspectionEditorProps} from './property-inspection-editor';
import type {InspectionSignatureProps} from './property-inspection-signature';
import './property-inspections.css';

type ListResponse = {property: InspectionPropertySnapshot & {archived_at?: string | null}; inspections: InspectionSummary[]; truncated?: boolean};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';
const date = (value: string) => value ? new Date(value.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'America/Belem'}) : 'Não informada';
const when = (value: string) => new Date(value).toLocaleString('pt-BR', {timeZone: 'America/Belem'});
async function get<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {cache: 'no-store', credentials: 'same-origin', signal});
  const body = await response.json() as {error?: string};
  if (!response.ok) throw new Error(body.error || 'Não foi possível consultar as vistorias.');
  return body as T;
}
export default function PropertyInspections({propertyId}: {propertyId: string}) {
  return <InspectionsForProperty key={propertyId} propertyId={propertyId}/>;
}
function InspectionsForProperty({propertyId}: {propertyId: string}) {
  const [data, setData] = useState<ListResponse | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<{id: string; version?: number} | null>(null), [editing, setEditing] = useState<InspectionDetail | 'new' | null>(null);
  const [Editor, setEditor] = useState<ComponentType<InspectionEditorProps> | null>(null), [opening, setOpening] = useState(false);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), editorGeneration = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current; controller.current?.abort(); const pending = new AbortController(); controller.current = pending;
    setLoading(true); setError('');
    try {const next = await get<ListResponse>('/api/property-inspections?' + new URLSearchParams({property_id: propertyId}), pending.signal);
      if (pending.signal.aborted || current !== generation.current) return;
      if (next.property.id !== propertyId || next.inspections.some(value => value.property_id !== propertyId)) throw new Error('A resposta não corresponde a este imóvel. Atualize a ficha.');
      setData(next);
    } catch (cause) {if (!pending.signal.aborted && current === generation.current) setError(errorMessage(cause));}
    finally {if (current === generation.current) setLoading(false);}
  }, [propertyId]);
  useEffect(() => {let mounted = true; const invalidate = () => {generation.current++; editorGeneration.current++;}; queueMicrotask(() => {if (mounted) void load();}); return () => {mounted = false; invalidate(); controller.current?.abort();};}, [load]);
  async function edit(detail: InspectionDetail | 'new') {
    const current = ++editorGeneration.current; setOpening(true); setError('');
    try {const loaded = await import('./property-inspection-editor'); if (current !== editorGeneration.current) return;
      setEditor(() => loaded.default); setEditing(detail); setSelected(null);
    } catch {if (current === editorGeneration.current) setError('Não foi possível abrir o formulário. Tente novamente.');}
    finally {if (current === editorGeneration.current) setOpening(false);}
  }
  return <section id="vistorias" className="panel property-inspections" aria-labelledby={'inspection-title-' + propertyId}>
    <div className="piv-heading"><div><h2 id={'inspection-title-' + propertyId}>Vistorias do imóvel</h2><p className="muted">Entrada, devolução e acompanhamento, com ambientes, mobília, fotos e versões preservadas.</p></div><div className="piv-actions"><button type="button" className="button secondary piv-compact" disabled={loading || opening || !!editing || !!selected} onClick={() => void load()} aria-label="Atualizar vistorias"><RefreshCw size={17}/></button><button type="button" className="button piv-compact" disabled={!data || !!data.property.archived_at || opening || !!editing || !!selected} onClick={() => void edit('new')}><Plus size={17}/>Nova vistoria</button></div></div>
    {data?.property.archived_at && <p className="piv-warning">Imóvel arquivado. O histórico e os PDFs continuam disponíveis. Restaure o imóvel para criar, editar ou assinar vistorias.</p>}
    {data?.truncated && <p className="piv-warning">Mostrando as 500 vistorias mais recentes deste imóvel.</p>}
    {notice && <p className="piv-notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}{data ? ' A lista exibida é da última leitura concluída.' : ''}</p>}
    {loading && <p className="piv-help" role="status">Consultando vistorias…</p>}
    {opening && <p className="piv-help" role="status">Abrindo formulário…</p>}
    {!loading && data && !data.inspections.length && <div className="piv-empty"><h3>Nenhuma vistoria registrada</h3><p>Crie uma vistoria para registrar o que foi observado neste imóvel.</p></div>}
    <div className="piv-list">{data?.inspections.map(row => <article className="piv-row" key={row.id}><div className="piv-row-heading"><div><h3>{INSPECTION_LABELS[row.inspection_type]} · {date(row.inspected_on)}</h3><p className="muted">Vistoriador declarado: {row.inspector}</p><small>Versão {row.version} · atualizada em {when(row.updated_at)} (Belém)</small></div><span className="pill neutral">{row.version > 1 ? row.version + ' versões' : '1 versão'}</span></div><div className="piv-actions"><button type="button" className="button secondary piv-compact" onClick={() => setSelected({id: row.id})}>Abrir vistoria</button></div></article>)}</div>
    {selected && <InspectionViewer key={selected.id + ':' + (selected.version ?? 'current')} propertyId={propertyId} selected={selected} onClose={() => setSelected(null)} onSelect={setSelected} onEdit={detail => void edit(detail)} onChanged={load}/>}
    {editing && Editor && data && <Editor propertyId={propertyId} property={data.property} initial={editing === 'new' ? null : editing} onClose={() => {const previous = editing; setEditing(null); if (previous !== 'new') setSelected({id: previous.inspection.id, version: previous.inspection.version});}} onSaved={async saved => {setEditing(null); setNotice('Vistoria salva. As versões anteriores e suas evidências foram preservadas.'); setSelected({id: saved.id, version: saved.version}); await load();}}/>}
  </section>;
}

function InspectionViewer({propertyId, selected, onClose, onSelect, onEdit, onChanged}: {propertyId: string; selected: {id: string; version?: number}; onClose: () => void; onSelect: (next: {id: string; version?: number}) => void; onEdit: (detail: InspectionDetail) => void; onChanged: () => Promise<void>}) {
  const [detail, setDetail] = useState<InspectionDetail | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [progress, setProgress] = useState('');
  const [Signature, setSignature] = useState<ComponentType<InspectionSignatureProps> | null>(null), [signing, setSigning] = useState(false), [signLoading, setSignLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), alive = useRef(true), pdf = useRef<AbortController | null>(null), exportInFlight = useRef(false), signatureGeneration = useRef(0);
  const [reload, setReload] = useState(0);
  useEffect(() => {alive.current = true; const node = dialog.current; node?.showModal(); return () => {alive.current = false; signatureGeneration.current++; pdf.current?.abort(); node?.close();};}, []);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({property_id: propertyId, id: selected.id}); if (selected.version) query.set('version', String(selected.version));
    void get<InspectionDetail>('/api/property-inspections?' + query, controller.signal).then(next => {
      if (controller.signal.aborted || !alive.current) return;
      if (next.inspection.property_id !== propertyId || next.inspection.id !== selected.id || selected.version && next.inspection.version !== selected.version) throw new Error('A versão recebida não corresponde à vistoria selecionada.');
      setDetail(next);
    }).catch(cause => {if (!controller.signal.aborted && alive.current) setError(errorMessage(cause));});
    return () => controller.abort();
  }, [propertyId, selected.id, selected.version, reload]);
  function close() {pdf.current?.abort(); onClose();}
  async function download() {
    if (!detail || exportInFlight.current) return; exportInFlight.current = true; setBusy(true); setError(''); setProgress('Preparando a versão salva…');
    const controller = new AbortController(); pdf.current = controller;
    try {const loaded = await import('../property-inspection-pdf'); if (controller.signal.aborted) return;
      await loaded.downloadPropertyInspectionPdf({propertyId, inspectionId: detail.inspection.id, version: detail.inspection.version, signal: controller.signal, onProgress: value => {if (alive.current && !controller.signal.aborted) setProgress(value.stage === 'images' ? `Preparando fotos ${value.completed}/${value.total}…` : value.stage === 'rendering' ? 'Montando laudo…' : 'Preparando a versão salva…');}});
    } catch (cause) {if (alive.current && !controller.signal.aborted) setError(errorMessage(cause));}
    finally {exportInFlight.current = false; if (alive.current) {setBusy(false); setProgress('');}}
  }
  async function openSignature() {
    if (signLoading || signing) return; const current = ++signatureGeneration.current; setSignLoading(true); setError('');
    try {const loaded = await import('./property-inspection-signature'); if (!alive.current || current !== signatureGeneration.current) return; setSignature(() => loaded.default); setSigning(true);}
    catch {if (alive.current) setError('Não foi possível abrir a assinatura. Tente novamente.');}
    finally {if (alive.current) setSignLoading(false);}
  }
  const report = detail?.inspection, current = report?.version === detail?.current_version;
  return createPortal(<dialog ref={dialog} className="piv-dialog" aria-labelledby="piv-view-title" onCancel={event => {event.preventDefault(); if (!signing) close();}} onClick={event => {if (event.target === event.currentTarget && !signing) close();}}>
    <div className="piv-heading"><div><h2 id="piv-view-title">{report ? INSPECTION_LABELS[report.inspection_type] + ' · ' + date(report.inspected_on) : 'Vistoria do imóvel'}</h2>{report && <p className="muted">Versão {report.version}{!current ? ' · histórica' : ' · atual'} · {report.property.name}</p>}</div><button type="button" className="button secondary piv-compact" disabled={signing} aria-label="Fechar vistoria" onClick={close}><X size={18}/>Fechar</button></div>
    {!report && !error && <p role="status">Carregando vistoria…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!report && error && <button type="button" className="button secondary piv-compact" onClick={() => {setError(''); setReload(value => value + 1);}}>Tentar novamente</button>}
    {detail && report && <>
      {detail.scope_changed && <p className="piv-warning">A UF ou obra do imóvel mudou. Esta vistoria permanece no histórico; crie uma nova vistoria para registrar no escopo atual.</p>}
      <div className="piv-actions piv-section"><button type="button" className="button secondary piv-compact" disabled={busy || signing || signLoading} onClick={() => void download()}><Download size={17}/>{busy ? 'Preparando PDF…' : 'Baixar laudo PDF'}</button>{detail.can_edit && <button type="button" className="text-button piv-compact" disabled={busy || signing || signLoading} onClick={() => onEdit(detail)}><Pencil size={16}/>Editar vistoria</button>}</div>
      {detail.property_archived && <p className="piv-warning">Imóvel arquivado. Restaure o imóvel para editar ou assinar. O histórico e o PDF permanecem disponíveis.</p>}
      {progress && <p className="piv-help" role="status">{progress}</p>}
      <label className="field piv-section"><span>Versão do registro</span><select value={report.version} disabled={busy || signing || signLoading} onChange={event => onSelect({id: report.id, version: Number(event.target.value)})}>{detail.events.map(event => <option key={event.id} value={event.version}>Versão {event.version} · {when(event.created_at)} · {event.actor_name}</option>)}</select><small>Editar cria uma versão. Assinaturas pertencem somente à versão assinada.</small></label>
      <dl className="piv-summary"><div><dt>Imóvel / endereço preservados</dt><dd>{report.property.name}<br/>{report.property.address}</dd></div><div><dt>Vistoriador declarado</dt><dd>{report.inspector}</dd></div><div><dt>Locador</dt><dd>{report.lessor || 'Não informado'}</dd></div><div><dt>Locatário</dt><dd>{report.lessee || 'Não informado'}</dd></div></dl>
      {report.source_mobilization ? <div className="piv-snapshot"><p><strong>Mobília de origem declarada · versão {report.source_mobilization.version}</strong></p><p>{report.source_mobilization.client_name} · {report.source_mobilization.cost_center_name}</p><p>Retrato histórico da origem selecionada. Quantidades observadas nesta vistoria são registradas separadamente.</p><a className="piv-source-link text-button" href={'/mobilizacoes?id=' + encodeURIComponent(report.source_mobilization.id)} target="_blank" rel="noopener noreferrer">Abrir mobilização atual em outra aba</a></div> : <p className="piv-help">Sem mobilização de origem vinculada.</p>}
      {report.source_handover && <p className="piv-help">Ciclo vinculado: {report.source_handover.client_name} · {report.source_handover.cost_center_name} · entrega em {date(report.source_handover.delivered_on)} · revisão {report.source_handover.revision}.</p>}
      {report.entry_inspection_id && <div className="piv-warning">Entrada vinculada para consulta: versão {report.entry_inspection_version}. A comparação é feita pela equipe.<br/><button type="button" className="text-button piv-compact" disabled={busy || signing} onClick={() => onSelect({id: report.entry_inspection_id!, version: report.entry_inspection_version!})}>Abrir laudo de entrada vinculado</button></div>}
      {numberedEnvironments(report.environments).map(environment => <section className="piv-environment" key={environment.id}><h3>{environment.number}. {environment.name}</h3>{report.items.filter(item => item.environment_id === environment.id).map((item, index) => {
        const photos = detail.photos.filter(photo => photo.item_id === item.id), source = report.source_mobilization?.items.find(source => source.id === item.source_item_id);
        return <article className="piv-item" key={item.id}><h4>{environment.number}.{index + 1}. {item.name}</h4><dl className="piv-item-details">{[['Quantidade observada', item.quantity ?? 'Não informada'], ['Condição', item.condition || 'Não informada'], ['Marca / modelo', [item.brand, item.model].filter(Boolean).join(' · ') || 'Não informado'], ['Material / cor', [item.material, item.color].filter(Boolean).join(' · ') || 'Não informado']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{source && <p className="piv-help">Origem declarada: necessário {source.planned ?? 'não informado'} · disponível informado {source.checked ?? 'não informado'}{source.condition ? ' · ' + source.condition : ''}.</p>}{item.description && <p className="piv-paragraph">{item.description}</p>}{item.note && <p className="piv-paragraph"><strong>Observação:</strong> {item.note}</p>}{item.pending && <p className="piv-warning">Pendência declarada{item.responsible ? ' · responsável: ' + item.responsible : ''}{item.due_on ? ' · prazo: ' + date(item.due_on) : ''}.</p>}{!!photos.length && <div className="piv-photo-grid">{photos.map(photo => <figure key={photo.id}><a href={inspectionPhotoUrl(photo.id)} target="_blank" rel="noopener noreferrer"><img src={inspectionPhotoUrl(photo.id)} alt={photo.caption || item.name} loading="lazy" decoding="async" width={360} height={230}/></a><figcaption>{photo.caption || item.name}<br/><small>Registrada na versão {photo.version}</small></figcaption></figure>)}</div>}</article>;} )}{!report.items.some(item => item.environment_id === environment.id) && <p className="piv-help">Nenhum item informado neste ambiente.</p>}</section>)}
      {!report.environments.length && <p className="piv-help">Nenhum ambiente informado.</p>}
      {detail.photos.some(photo => !report.items.some(item => item.id === photo.item_id)) && <section className="piv-section"><h3>Fotos de itens preservados no histórico</h3><p className="piv-help">Estes itens não fazem parte da lista desta versão. Suas evidências anteriores continuam preservadas.</p><div className="piv-photo-grid">{detail.photos.filter(photo => !report.items.some(item => item.id === photo.item_id)).map(photo => <figure key={photo.id}><a href={inspectionPhotoUrl(photo.id)} target="_blank" rel="noopener noreferrer"><img src={inspectionPhotoUrl(photo.id)} alt={photo.caption || photo.item_name} loading="lazy" width={360} height={230}/></a><figcaption>{photo.environment_name} · {photo.item_name} · versão {photo.version}<br/>{photo.caption}</figcaption></figure>)}</div></section>}
      <section className="piv-section"><h3>Chaves e medidores</h3><dl className="piv-summary"><div><dt>Chaves</dt><dd>{report.keys || 'Não informado'}</dd></div><div><dt>Água</dt><dd>{report.water || 'Não informado'}</dd></div><div><dt>Energia</dt><dd>{report.energy || 'Não informado'}</dd></div></dl></section>
      <section className="piv-section"><h3>Ressalvas e contestação</h3><p className="piv-paragraph">{report.contestation || 'Texto de contestação não informado.'}</p>{report.notes && <p className="piv-paragraph">{report.notes}</p>}</section>
      <section className="piv-section"><h3>Assinaturas desta versão</h3>{detail.signatures.length ? detail.signatures.map(signature => <div key={signature.id}><p><strong>{signature.actor.name}</strong>{signature.actor.title ? ' · ' + signature.actor.title : ''}<br/><small>{when(signature.signed_at)} (Belém) · versão {signature.version}</small></p><img className="piv-signature" src={inspectionSignatureUrl(signature.id)} alt={'Assinatura registrada por ' + signature.actor.name} loading="lazy" width={360} height={120}/><p className="piv-help">{signature.statement_text}</p></div>) : <p className="piv-help">Esta versão ainda não tem assinatura registrada.</p>}{current && !detail.property_archived && detail.signing.can_sign && <button type="button" className="button secondary piv-compact" disabled={busy || signing || signLoading} onClick={() => void openSignature()}>{signLoading ? 'Abrindo assinatura…' : 'Assinar esta versão pessoalmente'}</button>}</section>
      <details className="piv-section"><summary>Histórico de versões ({detail.events.length})</summary><ol className="piv-history">{detail.events.map(event => <li key={event.id}><button type="button" className="text-button piv-compact" disabled={busy || signing || signLoading} onClick={() => onSelect({id: report.id, version: event.version})}>Versão {event.version} · {event.actor_name}</button><p className="piv-help">{when(event.created_at)} (Belém){event.note ? ' · ' + event.note : ''}</p></li>)}</ol></details>
    </>}
    {signing && Signature && detail && <Signature propertyId={propertyId} detail={detail} onClose={() => setSigning(false)} onSaved={async () => {setSigning(false); setReload(value => value + 1); await onChanged();}}/>}
  </dialog>, document.body);
}
