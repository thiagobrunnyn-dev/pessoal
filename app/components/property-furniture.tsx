'use client';
import PhotoFileControls from './photo-file-controls';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {Camera, ImageIcon, Pencil, RefreshCw, X} from 'lucide-react';
import {MOBILIZATION_STAGES, type MobilizationStage} from '../../lib/mobilizations';
import FurnitureStructureDialog from './property-furniture-editor';
import {assertFurnitureSaved, furnitureEndpoint, furnitureMessage as message, readFurniture as get, type Furniture, type FurnitureItem, type FurnitureResponse, type FurnitureSource} from './property-furniture-types';
import {prepareMobilizationPhoto} from '../mobilization-form';
import './property-furniture.css';

type ItemPhoto = {id: string; event_id: string; position: number; uploaded_at: string; equipment_item_id: string | null; equipment_item_snapshot: {id: string; label: string; environment_id: string | null; environment_label: string | null; planned: number | null; checked: number | null; condition?: string; specification?:string;applicability?:string;version: number} | null};
type PhotoResponse = {property_id: string; mobilization_id?: string; furniture_id?: string; item_id: string; photos: ItemPhoto[]};
const stageLabel = (stage?: MobilizationStage) => stage ? MOBILIZATION_STAGES[stage] || stage : '';
const date = (value: string) => new Date(value).toLocaleDateString('pt-BR', {timeZone: 'America/Belem'});
const when = (value: string) => new Date(value).toLocaleString('pt-BR', {timeZone: 'America/Belem'});
const photoUrl = (id: string, furniture: Furniture) => (furniture.source_kind === 'property' ? '/api/property-furniture-photos/' : '/api/mobilization-photos/') + encodeURIComponent(id);
const sourceUrl = (id: string) => '/mobilizacoes?id=' + encodeURIComponent(id);
const sourceLabel = (source: FurnitureSource) => `${source.client_name} · ${source.cost_center_name} · ${date(source.created_at)} · ${stageLabel(source.stage)} · MOB ${source.id.slice(0, 8).toUpperCase()}`;
export function furnitureShortfall(item: Pick<FurnitureItem, 'planned' | 'checked' | 'applicability'>): number | null {
  return item.applicability==='not_applicable'||item.planned == null || item.checked == null ? null : Math.max(0, item.planned - item.checked);
}
/** A new property mounts a new scope, so old responses and drafts cannot cross properties. */
export default function PropertyFurniture({propertyId}: {propertyId: string}) {
  return <FurnitureForProperty key={propertyId} propertyId={propertyId}/>;
}
function FurnitureForProperty({propertyId}: {propertyId: string}) {
  const [data, setData] = useState<FurnitureResponse | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [editingList, setEditingList] = useState(false),[standardList,setStandardList]=useState(false);
  const [editing, setEditing] = useState<FurnitureItem | null>(null), [gallery, setGallery] = useState<FurnitureItem | null>(null);
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  const load = useCallback(async (id = '', keep = false) => {
    const current = ++generation.current;
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError('');
    if (!keep) setData(previous => previous ? {...previous, selected_mobilization_id: null, furniture: null} : null);
    try {
      const query = new URLSearchParams({property_id: propertyId}); if (id) query.set('mobilization_id', id);
      const next = await get<FurnitureResponse>('/api/property-furniture?' + query, controller.signal);
      if (current !== generation.current || controller.signal.aborted) return;
      if (next.property_id !== propertyId || next.furniture && next.furniture.property_id !== propertyId) throw new Error('Os dados recebidos não correspondem a este imóvel. Atualize a ficha.');
      if (next.furniture) next.furniture.source_kind = next.furniture.source_kind ?? next.source_kind ?? 'mobilization';
      setData(next); setSelectedId(next.selected_mobilization_id ?? '');
    } catch (cause) {
      if (!controller.signal.aborted && current === generation.current) setError(message(cause));
    } finally { if (current === generation.current) setLoading(false); }
  }, [propertyId]);
  useEffect(() => {
    void load();
    return () => { generation.current++; pending.current?.abort(); };
  }, [load]);
  const furniture = data?.furniture;
  const source = data?.sources.find(row => row.id === furniture?.id);
  const groups = furniture ? [
    ...furniture.environments.map(environment => ({id: environment.id, label: environment.label, items: furniture.equipment.filter(item => item.environment_id === environment.id)})),
    {id: 'general', label: 'Geral do imóvel', items: furniture.equipment.filter(item => !item.environment_id)},
    {id: 'unassigned', label: 'Ambiente não localizado nesta versão', items: furniture.equipment.filter(item => item.environment_id && !furniture.environments.some(environment => environment.id === item.environment_id))},
  ].filter(group => group.items.length || furniture.environments.some(environment => environment.id === group.id)) : [];
  return <section className="panel property-furniture" aria-labelledby={'furniture-title-' + propertyId}>
    <div className="pf-heading"><div><h2 id={'furniture-title-' + propertyId}>Mobília do imóvel</h2><p className="muted">Ambientes, móveis e equipamentos cadastrados para este imóvel.</p></div><button type="button" className="button secondary pf-compact" disabled={loading || editingList || !!editing || !!gallery} onClick={() => void load(selectedId, true)} aria-label="Atualizar lista de mobília"><RefreshCw size={17}/><span>Atualizar</span></button></div>
    {notice && <p className="visit-success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}{furniture ? ' A lista exibida é da última leitura concluída.' : ''}</p>}
    {furniture?.source_kind !== 'property' && !!data?.sources.length && <label className="field pf-source"><span>Mobilização de origem</span><select value={selectedId} disabled={loading || editingList || !!editing || !!gallery} onChange={event => { const id = event.target.value; setSelectedId(id); setNotice(''); if (id) void load(id); else { generation.current++; pending.current?.abort(); setData(previous => previous ? {...previous, furniture: null, selected_mobilization_id: null} : null); } }}><option value="">Selecione a mobilização</option>{data.sources.map(row => <option key={row.id} value={row.id}>{sourceLabel(row)}</option>)}</select>{data.sources.length > 1 && <small>Escolha a empresa e o centro de custo para ver a lista correspondente.</small>}</label>}
    {loading && <p className="pf-help" role="status">Carregando a mobília…</p>}
    {!loading && !error && !furniture && data?.sources.length === 0 && <div className="pf-empty"><h3>Nenhuma lista de mobília cadastrada</h3><p>Adicione os ambientes, móveis e equipamentos aqui na ficha.</p><div className="pf-standard-actions"><button type="button" className="button secondary" onClick={() => {setStandardList(false);setEditingList(true);}}>Cadastrar mobília</button><button type="button" className="button" onClick={()=>{setStandardList(true);setEditingList(true);}}>Aplicar lista padrão</button></div></div>}
    {!loading && !!data?.sources.length && !furniture && !error && <p className="pf-empty">Selecione uma mobilização acima para abrir a lista de mobília.</p>}
    {furniture && <>
      <div className="pf-source-context"><p className="muted">{furniture.source_kind === 'property' ? 'Lista vinculada ao imóvel' : `${furniture.client_name} · ${furniture.cost_center_name}${source ? ' · ' + date(source.created_at) : ''} · ${stageLabel(furniture.stage)}`}<span>Versão {furniture.version}</span></p><button type="button" className="text-button pf-compact" disabled={loading || furniture.can_edit === false} onClick={() => {setStandardList(false);setEditingList(true);}} aria-label="Editar lista de mobília deste imóvel"><Pencil size={16}/>Editar lista</button></div>
      {furniture.can_edit === false && <p className="today-alert">A origem desta lista precisa de revisão pela gestão antes de novas alterações.</p>}
      <button type="button" className="button secondary pf-compact" disabled={loading||furniture.can_edit===false} onClick={()=>{setStandardList(true);setEditingList(true);}}>Aplicar lista padrão</button>
      <p className="pf-help muted">As quantidades e a condição são declaradas pela equipe. Em branco significa não informado.</p>
      {!furniture.equipment.length && <div className="pf-empty"><p>Esta lista ainda não tem móveis ou equipamentos informados.</p><button type="button" className="text-button pf-compact" disabled={loading || furniture.can_edit === false} onClick={() => setEditingList(true)}>Adicionar ambientes e itens</button></div>}
      {groups.map(group => <section className="pf-environment" key={group.id}><h3>{group.label}</h3>{!group.items.length && <p className="pf-help muted">Nenhum item informado neste ambiente.</p>}<div className="pf-items">{group.items.map(item => {
        const missing = furnitureShortfall(item);
        return <article className="pf-item" key={item.id}><div className="pf-item-top"><h4>{item.label}</h4><div className="pf-item-actions"><button type="button" className="text-button pf-compact" disabled={loading || furniture.can_edit === false} onClick={() => setEditing(item)} aria-label={'Editar quantidades, condição e fotos de ' + item.label}><Pencil size={17}/><span>Editar item</span></button></div></div>
          <dl className="pf-quantities"><div><dt>Necessário</dt><dd>{item.planned ?? 'Não informado'}</dd></div><div><dt>Disponível informado</dt><dd>{item.checked ?? 'Não informado'}</dd></div><div><dt>Falta</dt><dd className={missing !== null && missing > 0 ? 'pf-missing' : ''}>{item.applicability==='not_applicable'?'Não se aplica':missing === null ? 'Ainda não calculada' : missing}</dd></div></dl>
          <p className="pf-condition"><strong>Aplicação:</strong> {item.applicability==='not_applicable'?'Não se aplica':item.applicability==='applicable'?'Aplicável':'Não informada'}</p>{item.specification&&<p className="pf-condition"><strong>Especificação:</strong> {item.specification}</p>}<p className="pf-condition"><strong>Condição informada:</strong> {item.condition?.trim() || 'Não informada'}</p>{item.note && <p className="pf-note">{item.note}</p>}
          <button type="button" className="text-button pf-compact pf-photo-link" disabled={loading} onClick={() => setGallery(item)} aria-label={'Ver fotos de ' + item.label}><ImageIcon size={16}/>{item.photo_count ? `${item.photo_count} foto${item.photo_count === 1 ? '' : 's'} do item` : 'Nenhuma foto do item'}</button>
        </article>;
      })}</div></section>)}
    </>}
    {editingList && <FurnitureStructureDialog initialStandard={standardList} propertyId={propertyId} furniture={furniture ?? null} onClose={() => setEditingList(false)} onSaved={async () => { setEditingList(false); setNotice('Mobília salva. Use Editar item para incluir fotos.'); await load(selectedId, true); }}/>}
    {furniture && editing && <ItemUpdateDialog key={furniture.id + ':' + editing.id} propertyId={propertyId} furniture={furniture} item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice('Item atualizado. As informações e evidências foram registradas no histórico da lista.'); await load(furniture.source_kind === 'property' ? '' : furniture.id, true); }}/>}
    {furniture && gallery && <ItemPhotosDialog key={furniture.id + ':' + gallery.id} propertyId={propertyId} furniture={furniture} item={gallery} onClose={() => setGallery(null)}/>}
  </section>;
}

function useDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return dialog;
}
function useDraftWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
function ItemUpdateDialog({propertyId, furniture, item, onClose, onSaved}: {propertyId: string; furniture: Furniture; item: FurnitureItem; onClose: () => void; onSaved: () => Promise<void>}) {
  const dialog = useDialog();
  const [baseline, setBaseline] = useState(furniture), [baseItem, setBaseItem] = useState(item);
  const [latest, setLatest] = useState<Furniture | null>(null), [checking, setChecking] = useState(false);
  const [condition, setCondition] = useState(item.condition ?? ''), [note, setNote] = useState('');
  const [specification,setSpecification]=useState(item.specification??''),[applicability,setApplicability]=useState(item.applicability??'');
  const [planned, setPlanned] = useState(item.planned == null ? '' : String(item.planned)), [checked, setChecked] = useState(item.checked == null ? '' : String(item.checked));
  const [itemNote, setItemNote] = useState(item.note);
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState('');
  const [confirmed, setConfirmed] = useState(false), [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const requestId = useRef(crypto.randomUUID()), inFlight = useRef(false), preparation = useRef(false), alive = useRef(true), pending = useRef<AbortController | null>(null);
  useDraftWarning(dirty);
  useEffect(() => { alive.current = true; return () => { alive.current = false; pending.current?.abort(); }; }, []);
  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : ''; setPreview(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [file]);
  function changed() { requestId.current = crypto.randomUUID(); setDirty(true); setConfirmed(false); }
  function close() { if (inFlight.current || preparation.current || checking) return; if (!dirty || window.confirm('Descartar a foto e as alterações deste item ainda não salvas?')) onClose(); }
  async function checkLatest() {
    if (inFlight.current || preparation.current || checking) return;
    const controller = new AbortController(); pending.current = controller; setChecking(true); setError('');
    try {
      const query = new URLSearchParams({property_id: propertyId}); if (baseline.source_kind !== 'property') query.set('mobilization_id', baseline.id);
      const body = await get<FurnitureResponse>('/api/property-furniture?' + query, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      const current = body.furniture;
      if (body.property_id !== propertyId || !current || current.property_id !== propertyId || current.id !== baseline.id || current.source_kind !== baseline.source_kind || !current.equipment.some(row => row.id === item.id)) throw new Error('A origem deste item mudou. Seu rascunho e a foto foram mantidos; confira a ficha antes de continuar.');
      if (current.can_edit === false) throw new Error('A lista precisa de revisão pela gestão antes de novas alterações.');
      setLatest(current);
    } catch (cause) { if (alive.current && !controller.signal.aborted) setError(message(cause)); }
    finally { if (alive.current && !controller.signal.aborted) setChecking(false); }
  }
  function useLatest() {
    const current = latest?.equipment.find(row => row.id === item.id); if (!latest || !current) return;
    if (condition.trim() === (baseItem.condition ?? '').trim()) setCondition(current.condition ?? '');
    if (planned === (baseItem.planned == null ? '' : String(baseItem.planned))) setPlanned(current.planned == null ? '' : String(current.planned));
    if (checked === (baseItem.checked == null ? '' : String(baseItem.checked))) setChecked(current.checked == null ? '' : String(current.checked));
    if (itemNote.trim() === baseItem.note.trim()) setItemNote(current.note);
    if(specification.trim()===(baseItem.specification??'').trim())setSpecification(current.specification??'');if(applicability===(baseItem.applicability??''))setApplicability(current.applicability??'');
    setBaseline(latest); setBaseItem(current); setLatest(null); setConflict(false); setError(''); changed();
  }
  async function choose(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []); input.value = '';
    if (inFlight.current || preparation.current || !files.length) return;
    if (files.length !== 1 || file) { setError('Use uma foto por atualização. Descarte a foto selecionada para escolher outra.'); return; }
    preparation.current = true; setPreparing(true); setError('');
    try { const photo = await prepareMobilizationPhoto(files[0]); if (alive.current) { setFile(photo); changed(); } }
    catch (cause) { if (alive.current) setError(message(cause)); }
    finally { preparation.current = false; if (alive.current) setPreparing(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || preparation.current || checking || conflict) return;
    const specificationChanged=specification.trim()!==(baseItem.specification??'').trim(),applicabilityChanged=applicability!==(baseItem.applicability??'');
    const conditionChanged = condition.trim() !== (baseItem.condition ?? '').trim();
    const plannedChanged = planned !== (baseItem.planned == null ? '' : String(baseItem.planned)), checkedChanged = checked !== (baseItem.checked == null ? '' : String(baseItem.checked)), itemNoteChanged = itemNote.trim() !== baseItem.note.trim();
    if ([planned, checked].some(value => value !== '' && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))))) { setError('Use quantidades inteiras iguais ou maiores que zero, ou deixe em branco quando não informado.'); return; }
    if (!file && !specificationChanged && !applicabilityChanged && !conditionChanged && !plannedChanged && !checkedChanged && !itemNoteChanged) { setError('Atualize uma informação do item ou selecione uma foto.'); return; }
    if (!confirmed) { setError('Confira e confirme o item antes de salvar.'); return; }
    const form = new FormData();
    form.set('action', 'item_update'); form.set('id', furniture.id); form.set('property_id', propertyId); form.set('item_id', item.id);
    form.set('expected_version', String(baseline.version)); form.set('request_id', requestId.current); form.set('confirmed', 'yes');
    if (plannedChanged) form.set('planned', planned); if (checkedChanged) form.set('checked', checked); if (itemNoteChanged) form.set('item_note', itemNote.trim());
    if(specificationChanged)form.set('specification',specification.trim());if(applicabilityChanged)form.set('applicability',applicability);
    if (conditionChanged) form.set('condition', condition.trim()); if (note.trim()) form.set('note', note.trim()); if (file) form.append('photos', file);
    const controller = new AbortController(); pending.current = controller;
    inFlight.current = true; setBusy(true); setError(''); setConflict(false);
    try {
      const response = await fetch(furnitureEndpoint(furniture), {method: 'POST', credentials: 'same-origin', body: form, signal: controller.signal});
      let body: {error?: string}; try { body = await response.json(); } catch { throw new Error(response.status === 401 || response.status === 403 ? 'Seu acesso precisa ser validado. Entre novamente e tente salvar o rascunho.' : 'Não foi possível confirmar o salvamento. Tente novamente com este mesmo rascunho.'); }
      if (!response.ok) { if (alive.current) setConflict(response.status === 409); throw new Error(body.error || 'Não foi possível salvar o item.'); }
      assertFurnitureSaved(body, baseline, propertyId);
      if (alive.current && !controller.signal.aborted) { setDirty(false); await onSaved(); }
    } catch (cause) { if (alive.current && !controller.signal.aborted) setError(message(cause)); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  return createPortal(<dialog ref={dialog} className="pf-dialog" aria-labelledby="pf-update-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}><div className="pf-heading"><div><h2 id="pf-update-title">Atualizar item</h2><p>{baseItem.label}</p></div><button type="button" className="button secondary pf-compact" disabled={busy || preparing || checking} onClick={close} aria-label="Fechar atualização do item"><X size={18}/>Fechar</button></div>
    <p className="muted pf-help">{furniture.property_name}{furniture.source_kind !== 'property' ? ` · ${furniture.client_name} · ${furniture.cost_center_name}` : ''}</p>
    <form onSubmit={save}><fieldset disabled={busy || preparing || checking} className="pf-fields">
      <label className="field"><span>Aplicação do item</span><select value={applicability} onChange={e=>{setApplicability(e.target.value as FurnitureItem['applicability']||'');changed();}}><option value="">Não informado</option><option value="applicable">Aplicável</option><option value="not_applicable">Não se aplica</option></select></label><label className="field"><span>Especificação (opcional)</span><input value={specification} maxLength={200} placeholder="Tamanho, modelo ou BTU, se informado" onChange={e=>{setSpecification(e.target.value);changed();}}/></label>
      <div className="pf-quantity-inputs"><label className="field"><span>Necessário</span><input type="number" inputMode="numeric" min={0} max={Number.MAX_SAFE_INTEGER} step={1} disabled={applicability==='not_applicable'} value={planned} placeholder="Não informado" onChange={event => { setPlanned(event.target.value); changed(); }}/></label><label className="field"><span>Disponível informado</span><input type="number" inputMode="numeric" min={0} max={Number.MAX_SAFE_INTEGER} step={1} disabled={applicability==='not_applicable'} value={checked} placeholder="Não informado" onChange={event => { setChecked(event.target.value); changed(); }}/></label></div>
      <p className="muted pf-help">Falta: {applicability==='not_applicable'?'não se aplica':planned === '' || checked === '' ? 'ainda não calculada' : Math.max(0, Number(planned) - Number(checked))}. Em branco significa não informado; zero deve ser informado explicitamente.</p>
      <label className="field"><span>Condição informada (opcional)</span><input value={condition} maxLength={200} list="pf-condition-suggestions" placeholder="Ex.: bom estado, precisa de reparo" onChange={event => { setCondition(event.target.value); changed(); }}/><small>Descreva o que foi conferido. A condição não é deduzida da foto.</small></label><datalist id="pf-condition-suggestions"><option value="Bom"/><option value="Regular"/><option value="Danificado"/></datalist>
      <label className="field"><span>Observação do item (opcional)</span><textarea rows={2} value={itemNote} maxLength={2000} onChange={event => { setItemNote(event.target.value); changed(); }}/><small>Na vistoria, explique faltas ou quantidades ainda não informadas.</small></label>
      <PhotoFileControls disabled={!!file||busy||preparing} fileLabel="Escolher foto" onSelect={choose}/>
      <p className="muted pf-help">Uma foto por atualização, preparada no dispositivo em até 1600 px e 4 MB. O arquivo só é enviado ao salvar.</p>
      {preview && <div className="pf-preview"><img src={preview} alt={'Foto de ' + item.label + ' ainda não enviada'} width={400} height={280}/><button type="button" className="button secondary pf-compact" onClick={() => { setFile(null); changed(); }}>Descartar foto selecionada</button></div>}
      <label className="field"><span>Observação desta atualização (opcional)</span><textarea rows={2} value={note} maxLength={2000} onChange={event => { setNote(event.target.value); changed(); }}/></label>
      <label className="confirm"><input type="checkbox" checked={confirmed} required onChange={event => setConfirmed(event.target.checked)}/><span>Conferi as quantidades, a condição e as evidências deste item e deste imóvel.</span></label>
    </fieldset>
      {preparing && <p role="status">Preparando a foto no dispositivo…</p>}
      {error && <p className="error" role="alert">{error} Seu rascunho e a foto selecionada foram mantidos.</p>}
      {conflict && <div className="today-alert pf-conflict"><p>A lista mudou. Este rascunho mantém a versão {baseline.version}. Confira a versão atual aqui antes de salvar novamente.</p><button type="button" className="button secondary" disabled={checking} onClick={() => void checkLatest()}>{checking ? 'Conferindo…' : 'Ver versão salva'}</button>{latest && <div><p><strong>Versão {latest.version}</strong></p>{latest.equipment.filter(row => row.id === item.id).map(row => <p key={row.id}>{row.label}: {row.planned ?? 'não informado'} necessários / {row.checked ?? 'não informado'} disponíveis. Condição: {row.condition || 'não informada'}. {row.note}</p>)}<p>Se o mesmo campo foi alterado, valerá seu rascunho. A foto selecionada será mantida. Confira antes de salvar.</p><button type="button" className="button secondary" onClick={useLatest}>Reaplicar meu rascunho e conferir</button></div>}</div>}
      <div className="form-actions"><button type="button" className="button secondary" disabled={busy || preparing || checking} onClick={close}>Cancelar</button><button type="submit" className="button" disabled={busy || preparing || checking || conflict}>{busy ? 'Salvando…' : 'Salvar atualização do item'}</button></div>
    </form>
  </dialog>, document.body);
}

function ItemPhotosDialog({propertyId, furniture, item, onClose}: {propertyId: string; furniture: Furniture; item: FurnitureItem; onClose: () => void}) {
  const dialog = useDialog();
  const [photos, setPhotos] = useState<ItemPhoto[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const own = furniture.source_kind === 'property';
    const query = new URLSearchParams({property_id: propertyId, [own ? 'furniture_id' : 'mobilization_id']: furniture.id, item_id: item.id});
    void get<PhotoResponse>((own ? '/api/property-furniture-item-photos?' : '/api/mobilization-item-photos?') + query, controller.signal).then(body => {
      if (controller.signal.aborted) return;
      if (body.property_id !== propertyId || (own ? body.furniture_id : body.mobilization_id) !== furniture.id || body.item_id !== item.id) throw new Error('As fotos recebidas não correspondem a este item. Tente novamente.');
      setPhotos(body.photos);
    }).catch(cause => { if (!controller.signal.aborted) setError(message(cause)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [propertyId, furniture.id, furniture.source_kind, item.id, attempt]);
  return createPortal(<dialog ref={dialog} className="pf-dialog pf-gallery-dialog" aria-labelledby="pf-photos-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="pf-heading"><div><h2 id="pf-photos-title">Fotos do item</h2><p>{item.label}</p></div><button type="button" className="button secondary pf-compact" onClick={onClose} aria-label="Fechar fotos do item"><X size={18}/>Fechar</button></div>
    <p className="muted pf-help">Cada foto preserva o nome e a condição informada no momento do registro.</p>
    {loading && <p role="status">Carregando fotos…</p>}{error && <div><p className="error" role="alert">{error}</p><button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></div>}
    {!loading && !error && !photos.length && <p className="pf-empty">Nenhuma foto foi associada a este item. Use Editar item para adicionar uma foto. Evidências anteriores permanecem no histórico.</p>}
    <div className="pf-photo-grid">{photos.map(photo => <figure key={photo.id}><a href={photoUrl(photo.id, furniture)} target="_blank" rel="noopener noreferrer" aria-label={'Ampliar foto de ' + (photo.equipment_item_snapshot?.label || item.label)}><img src={photoUrl(photo.id, furniture)} alt={'Evidência de ' + (photo.equipment_item_snapshot?.label || item.label)} loading="lazy" decoding="async" width={320} height={220}/></a><figcaption><strong>{photo.equipment_item_snapshot?.label || 'Nome não registrado na foto'}</strong>{photo.equipment_item_snapshot?.applicability==='not_applicable'&&<span>Não se aplica neste registro</span>}{photo.equipment_item_snapshot?.specification&&<span>{photo.equipment_item_snapshot.specification}</span>}<span>Condição no registro: {photo.equipment_item_snapshot?.condition?.trim() || 'Não informada'}</span>{photo.equipment_item_snapshot?.environment_label && <span>{photo.equipment_item_snapshot.environment_label}</span>}<small>{when(photo.uploaded_at)} (Belém){photo.equipment_item_snapshot?.version ? ' · Versão ' + photo.equipment_item_snapshot.version : ''}</small></figcaption></figure>)}</div>
    {furniture.source_kind !== 'property' && <a className="text-button pf-compact" href={sourceUrl(furniture.id)}>Abrir histórico da mobilização</a>}
  </dialog>, document.body);
}
