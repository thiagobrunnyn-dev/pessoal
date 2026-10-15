'use client';
import PhotoFileControls from './photo-file-controls';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {Camera, Plus, X} from 'lucide-react';
import type {InspectionDetail, InspectionHandover, InspectionPropertySnapshot, InspectionSource, InspectionSummary} from '../../lib/property-inspections';
import {blankInspectionItem, importInspectionSource, inspectionDraftIssue, inspectionPayload, makeInspectionDraft, MAX_NEW_INSPECTION_PHOTOS, newInspectionId, numberedEnvironments, type InspectionDraft, type InspectionItemDraft, type PendingInspectionPhoto} from '../property-inspection-form';
import {prepareMobilizationPhoto} from '../mobilization-form';

export type InspectionEditorProps = {propertyId: string; property: InspectionPropertySnapshot; initial: InspectionDetail | null; onClose: () => void; onSaved: (saved: {id: string; version: number}) => Promise<void>};
type SourceResponse = {property: InspectionPropertySnapshot; mobilizations: Array<Pick<InspectionSource, 'id' | 'version' | 'client_name' | 'cost_center_name'> & {created_at: string}>; handovers: InspectionHandover[]; entry_inspections: InspectionSummary[]; source: InspectionSource | null};
const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.';
const displayDate = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('pt-BR', {timeZone: 'America/Belem'});
export default function InspectionEditor({propertyId, property, initial, onClose, onSaved}: InspectionEditorProps) {
  const [draft, setDraft] = useState(() => makeInspectionDraft(initial?.inspection)), [note, setNote] = useState('');
  const [sources, setSources] = useState<SourceResponse | null>(null), [source, setSource] = useState<InspectionSource | null>(initial?.inspection.source_mobilization ?? null), [sourceChoice, setSourceChoice] = useState(initial ? initial.inspection.source_mobilization_id || 'none' : '');
  const [sourceLoading, setSourceLoading] = useState(!initial), [sourceError, setSourceError] = useState(''), [reload, setReload] = useState(0);
  const [photos, setPhotos] = useState<PendingInspectionPhoto[]>([]), [preparing, setPreparing] = useState(false), [dirty, setDirty] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), alive = useRef(true), sourceGeneration = useRef(0), sourceController = useRef<AbortController | null>(null), saveController = useRef<AbortController | null>(null), inFlight = useRef(false), preparingRef = useRef(false), requestId = useRef(newInspectionId());
  useEffect(() => {alive.current = true; const node = dialog.current; node?.showModal(); return () => {alive.current = false; sourceGeneration.current++; sourceController.current?.abort(); saveController.current?.abort(); node?.close();};}, []);
  useEffect(() => {
    if (initial) return;
    const current = ++sourceGeneration.current; sourceController.current?.abort(); const controller = new AbortController(); sourceController.current = controller;
    void fetch('/api/property-inspections?' + new URLSearchParams({property_id: propertyId, sources: 'yes'}), {cache: 'no-store', credentials: 'same-origin', signal: controller.signal}).then(async response => {
      const result = await response.json() as SourceResponse & {error?: string}; if (!response.ok) throw new Error(result.error || 'Não foi possível consultar as origens.');
      if (!alive.current || controller.signal.aborted || current !== sourceGeneration.current) return;
      if (result.property.id !== propertyId) throw new Error('As origens recebidas não pertencem a este imóvel.');
      setSources(result);
    }).catch(cause => {if (alive.current && !controller.signal.aborted && current === sourceGeneration.current) setSourceError(message(cause));}).finally(() => {if (alive.current && current === sourceGeneration.current) setSourceLoading(false);});
    return () => controller.abort();
  }, [initial, propertyId, reload]);
  useEffect(() => {
    if (!dirty && !preparing && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, preparing, busy]);
  function changed() {setDirty(true); setConfirmed(false); setError(''); setConflict(false);}
  function patch(values: Partial<InspectionDraft>) {setDraft(previous => ({...previous, ...values})); changed();}
  function itemPatch(id: string, values: Partial<InspectionItemDraft>) {setDraft(previous => ({...previous, items: previous.items.map(item => item.id === id ? {...item, ...values} : item)})); changed();}
  function close() {if (inFlight.current || preparingRef.current) return; if (!dirty || window.confirm('Descartar o rascunho e as fotos ainda não enviadas desta vistoria?')) onClose();}
  async function chooseSource(id: string) {
    if (inFlight.current || preparingRef.current || initial) return;
    if ((draft.environments.length || draft.items.length || photos.length) && !window.confirm('Trocar a origem substituirá os ambientes, itens e fotos não enviados deste rascunho. Continuar?')) return;
    const current = ++sourceGeneration.current; sourceController.current?.abort(); const controller = new AbortController(); sourceController.current = controller;
    setSourceChoice(id); setSource(null); setSourceError(''); setSourceLoading(id !== '' && id !== 'none');
    setPhotos([]); setDraft(previous => ({...previous, source_mobilization_id: null, source_mobilization_version: null, environments: [], items: []})); changed();
    if (!id || id === 'none') return;
    try {
      const response = await fetch('/api/property-inspections?' + new URLSearchParams({property_id: propertyId, sources: 'yes', mobilization_id: id}), {cache: 'no-store', credentials: 'same-origin', signal: controller.signal});
      const result = await response.json() as SourceResponse & {error?: string}; if (!response.ok) throw new Error(result.error || 'Não foi possível consultar a mobilização.');
      if (!alive.current || controller.signal.aborted || current !== sourceGeneration.current) return;
      if (result.property.id !== propertyId || result.source?.property_id !== propertyId || result.source?.id !== id) throw new Error('A origem recebida não corresponde à seleção.');
      setSources(result); setSource(result.source); setDraft(previous => importInspectionSource(previous, result.source!));
    } catch (cause) {if (alive.current && !controller.signal.aborted && current === sourceGeneration.current) setSourceError(message(cause));}
    finally {if (alive.current && current === sourceGeneration.current) setSourceLoading(false);}
  }
  function addEnvironment(parent: string | null = null) {if (draft.environments.length >= 100) return; patch({environments: [...draft.environments, {id: newInspectionId(), name: '', parent_id: parent}]});}
  function removeEnvironment(id: string) {
    const children = draft.environments.filter(value => value.parent_id === id);
    if (children.length || draft.items.some(item => item.environment_id === id)) {setError('Mova ou remova os itens e subambientes antes de remover este ambiente.'); return;}
    patch({environments: draft.environments.filter(value => value.id !== id)});
  }
  function removeItem(id: string) {
    if (!window.confirm('Remover este item do rascunho? As versões já salvas permanecem no histórico.')) return;
    patch({items: draft.items.filter(item => item.id !== id)}); setPhotos(previous => previous.filter(photo => photo.item_id !== id));
  }
  async function choosePhoto(input: HTMLInputElement, itemId: string) {
    const chosen = Array.from(input.files ?? []); input.value = '';
    if (!chosen.length || inFlight.current || preparingRef.current) return;
    if (chosen.length !== 1 || photos.length >= MAX_NEW_INSPECTION_PHOTOS) {setError('Anexe até três fotos por salvamento. Depois, edite a vistoria para acrescentar outras.'); return;}
    preparingRef.current = true; setPreparing(true); setError('');
    try {const file = await prepareMobilizationPhoto(chosen[0]); if (!alive.current) return;
      setPhotos(previous => [...previous, {id: newInspectionId(), item_id: itemId, caption: '', file}]); changed();
    } catch (cause) {if (alive.current) setError(message(cause));}
    finally {preparingRef.current = false; if (alive.current) setPreparing(false);}
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || preparingRef.current || sourceLoading) return;
    const issue = inspectionDraftIssue(draft);
    if (issue) {setError(issue); return;}
    if (!sourceChoice || sourceChoice !== 'none' && !draft.source_mobilization_id) {setError('Selecione uma mobilização de origem ou escolha preencher sem mobilização.'); return;}
    if (initial && !note.trim()) {setError('Descreva o que mudou nesta versão.'); return;}
    if (photos.some(photo => !photo.caption.trim())) {setError('Escreva uma legenda para cada foto selecionada.'); return;}
    if (!confirmed) {setError('Confira e confirme as informações antes de salvar.'); return;}
    const form = new FormData();
    form.set('action', initial ? 'update' : 'create'); form.set('property_id', propertyId); form.set('request_id', requestId.current); form.set('confirmed', 'yes'); form.set('payload', JSON.stringify(inspectionPayload(draft))); form.set('note', note.trim());
    if (initial) {form.set('id', initial.inspection.id); form.set('expected_version', String(initial.inspection.version));}
    photos.forEach(photo => form.append('photos', photo.file)); if (photos.length) form.set('photo_meta', JSON.stringify(photos.map(photo => ({item_id: photo.item_id, caption: photo.caption.trim()}))));
    const controller = new AbortController(); saveController.current = controller; inFlight.current = true; setBusy(true); setError(''); setConflict(false);
    try {
      const response = await fetch('/api/property-inspections', {method: 'POST', credentials: 'same-origin', body: form, signal: controller.signal});
      const result = await response.json() as {id: string; version: number; error?: string};
      if (!response.ok) {if (alive.current) setConflict(response.status === 409); throw new Error(result.error || 'Não foi possível salvar a vistoria.');}
      if (!result.id || !Number.isSafeInteger(result.version) || result.version < 1 || initial && (result.id !== initial.inspection.id || result.version !== initial.inspection.version + 1)) throw new Error('O servidor não confirmou o salvamento. Tente salvar novamente com este mesmo rascunho.');
      if (alive.current && !controller.signal.aborted) {setDirty(false); await onSaved(result);}
    } catch (cause) {if (alive.current && !controller.signal.aborted) setError(message(cause));}
    finally {inFlight.current = false; if (alive.current) setBusy(false);}
  }
  const disabled = busy || preparing || sourceLoading;
  const textField = (label: string, key: 'inspector' | 'lessor' | 'lessee', required = false) => <label className="field"><span>{label}</span><input required={required} maxLength={key === 'inspector' ? 160 : 200} value={draft[key]} onChange={event => patch({[key]: event.target.value})}/></label>;
  return createPortal(<dialog ref={dialog} className="piv-dialog" aria-labelledby="piv-editor-title" onCancel={event => {event.preventDefault(); close();}} onClick={event => {if (event.target === event.currentTarget) close();}}>
    <div className="piv-heading"><div><h2 id="piv-editor-title">{initial ? 'Editar vistoria' : 'Nova vistoria'}</h2><p className="muted">{property.name}</p></div><button type="button" className="button secondary piv-compact" disabled={busy || preparing} aria-label="Fechar formulário de vistoria" onClick={close}><X size={18}/>Fechar</button></div>
    <p className="piv-help">{property.address}{initial ? ` · Editando a versão ${initial.inspection.version}; salvar cria a próxima versão.` : ' · Imóvel fixo nesta ficha.'}</p>
    <form onSubmit={save}><fieldset className="piv-fields" disabled={disabled}>
      <div className="piv-grid"><label className="field"><span>Tipo de vistoria</span><select value={draft.inspection_type} disabled={!!initial} onChange={event => patch({inspection_type: event.target.value as InspectionDraft['inspection_type'], entry_inspection_id: null, entry_inspection_version: null})}><option value="entry">Entrada</option><option value="return">Devolução</option><option value="periodic">Periódica</option></select></label><label className="field"><span>Data da vistoria</span><input type="date" required value={draft.inspected_on} onChange={event => patch({inspected_on: event.target.value})}/></label>{textField('Vistoriador declarado', 'inspector', true)}{textField('Locador (opcional)', 'lessor')}{textField('Locatário (opcional)', 'lessee')}</div>
      <section className="piv-section"><h3>Origem da mobília</h3>{!initial ? <><label className="field"><span>Mobilização de origem</span><select value={sourceChoice} onChange={event => void chooseSource(event.target.value)}><option value="">Selecione uma opção</option><option value="none">Sem mobilização (preencher manualmente)</option>{sources?.mobilizations.map(value => <option key={value.id} value={value.id}>{value.client_name} · {value.cost_center_name} · {displayDate(value.created_at)} · versão {value.version}</option>)}</select><small>A origem escolhida será preservada junto desta vistoria.</small></label><div className="piv-grid"><label className="field"><span>Ciclo de entrega (opcional)</span><select value={draft.source_handover_id || ''} onChange={event => {const next = sources?.handovers.find(value => value.id === event.target.value); patch({source_handover_id: next?.id ?? null, source_handover_revision: next?.revision ?? null});}}><option value="">Sem vínculo</option>{sources?.handovers.map(value => <option key={value.id} value={value.id}>{value.client_name} · {value.cost_center_name} · {displayDate(value.delivered_on)}{value.returned_on ? ' · devolvido' : ' · em uso'}</option>)}</select></label>{draft.inspection_type === 'return' && <label className="field"><span>Entrada para consulta (opcional)</span><select value={draft.entry_inspection_id || ''} onChange={event => {const next = sources?.entry_inspections.find(value => value.id === event.target.value); patch({entry_inspection_id: next?.id ?? null, entry_inspection_version: next?.version ?? null});}}><option value="">Sem comparação vinculada</option>{sources?.entry_inspections.map(value => <option key={value.id} value={value.id}>{displayDate(value.inspected_on)} · {value.inspector} · versão {value.version}</option>)}</select><small>Vincula o laudo salvo deste imóvel para consulta pela equipe.</small></label>}</div></> : <p className="piv-help">A origem, o ciclo e a entrada vinculada permanecem os mesmos nas novas versões.</p>}
        {source && <div className="piv-snapshot"><p><strong>{source.client_name} · {source.cost_center_name} · origem versão {source.version}</strong></p><p>Os itens foram reaproveitados como referência declarada. Preencha a quantidade e a condição observadas agora; campos em branco continuam não informados.</p></div>}
      </section>
      <section className="piv-section"><div className="piv-row-heading"><h3>Ambientes e itens</h3><button type="button" className="button secondary piv-compact" disabled={draft.environments.length >= 100} onClick={() => addEnvironment()}><Plus size={16}/>Adicionar ambiente</button></div><p className="piv-help">Use subambientes para banheiros e outras áreas vinculadas. A quantidade zero deve ser informada explicitamente.</p>
        {numberedEnvironments(draft.environments).map(environment => <section className="piv-environment" key={environment.id}><div className="piv-row-heading"><h3>Ambiente {environment.number}</h3><button type="button" className="text-button piv-compact" onClick={() => removeEnvironment(environment.id)} aria-label={'Remover ambiente ' + environment.number}>Remover</button></div><div className="piv-grid"><label className="field"><span>Nome do ambiente {environment.number}</span><input required maxLength={200} value={environment.name} onChange={event => patch({environments: draft.environments.map(value => value.id === environment.id ? {...value, name: event.target.value} : value)})}/></label><label className="field"><span>Subambiente de (opcional)</span><select value={environment.parent_id || ''} onChange={event => patch({environments: draft.environments.map(value => value.id === environment.id ? {...value, parent_id: event.target.value || null} : value)})}><option value="">Ambiente principal</option>{draft.environments.filter(value => value.id !== environment.id && !value.parent_id && !draft.environments.some(child => child.parent_id === environment.id)).map(value => <option key={value.id} value={value.id}>{value.name || 'Ambiente sem nome'}</option>)}</select></label></div>
          {draft.items.filter(item => item.environment_id === environment.id).map((item, index) => <InspectionItemFields key={item.id} item={item} number={environment.number + '.' + (index + 1)} source={source?.items.find(value => value.id === item.source_item_id)} photos={photos.filter(photo => photo.item_id === item.id)} existingPhotoCount={initial?.photos.filter(photo => photo.item_id === item.id).length ?? 0} canAddPhoto={photos.length < MAX_NEW_INSPECTION_PHOTOS} onChange={values => itemPatch(item.id, values)} onRemove={() => removeItem(item.id)} onChoosePhoto={input => void choosePhoto(input, item.id)} onCaption={(id, caption) => {setPhotos(previous => previous.map(photo => photo.id === id ? {...photo, caption} : photo)); changed();}} onRemovePhoto={id => {setPhotos(previous => previous.filter(photo => photo.id !== id)); changed();}}/>)}
          <div className="piv-actions"><button type="button" className="button secondary piv-compact" disabled={draft.items.length >= 200} onClick={() => patch({items: [...draft.items, blankInspectionItem(environment.id)]})}><Plus size={16}/>Adicionar item</button>{!environment.parent_id && <button type="button" className="text-button piv-compact" disabled={draft.environments.length >= 100} onClick={() => addEnvironment(environment.id)}>Adicionar subambiente</button>}</div>
        </section>)}
      </section>
      <section className="piv-section"><h3>Chaves e medidores</h3><div className="piv-grid">{([['Chaves (opcional)', 'keys'], ['Leitura de água (opcional)', 'water'], ['Leitura de energia (opcional)', 'energy']] as const).map(([label, key]) => <label className="field" key={key}><span>{label}</span><textarea rows={2} maxLength={2000} value={draft[key]} placeholder="Não informado" onChange={event => patch({[key]: event.target.value})}/></label>)}</div><p className="piv-help">Registre identificação do medidor e unidade junto da leitura, quando disponíveis. Branco não significa zero.</p></section>
      <section className="piv-section"><h3>Ressalvas e contestação</h3><label className="field"><span>Texto de contestação (opcional)</span><textarea rows={4} maxLength={6000} value={draft.contestation} onChange={event => patch({contestation: event.target.value})}/><small>Informe somente as condições e os prazos aplicáveis a este caso.</small></label><label className="field"><span>Observações gerais (opcional)</span><textarea rows={3} maxLength={6000} value={draft.notes} onChange={event => patch({notes: event.target.value})}/></label>{initial && <label className="field"><span>O que mudou nesta versão</span><textarea rows={2} required maxLength={2000} value={note} onChange={event => {setNote(event.target.value); changed();}}/></label>}</section>
      <p className="piv-help">As fotos selecionadas ficam neste dispositivo até salvar. Até três fotos por versão, preparadas em JPEG com até 1600 px e sem os metadados do arquivo original. Depois de salvar, a assinatura pessoal da versão fica disponível.</p>
      <label className="confirm"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Conferi as informações declaradas, os itens e as fotos desta vistoria.</span></label>
    </fieldset>
      {sourceLoading && <p role="status">Consultando a origem neste imóvel…</p>}
      {sourceError && <div className="error" role="alert"><p>{sourceError}</p><button type="button" className="button secondary piv-compact" disabled={busy || preparing} onClick={() => sourceChoice && sourceChoice !== 'none' ? void chooseSource(sourceChoice) : (() => {setSourceLoading(true); setSourceError(''); setReload(value => value + 1);})()}>Consultar origem novamente</button></div>}
      {preparing && <p role="status">Preparando a foto no dispositivo…</p>}
      {error && <p className="error" role="alert">{error} O rascunho e as fotos selecionadas foram mantidos.</p>}
      {conflict && <p className="piv-warning">Confira a versão atual antes de reaplicar as alterações. Não feche este rascunho sem revisar o que ficou pendente. <a className="piv-source-link text-button" href={'/imoveis/' + encodeURIComponent(propertyId) + '#vistorias'} target="_blank" rel="noopener noreferrer">Abrir a ficha atual em outra aba</a></p>}
      <div className="form-actions"><button type="button" className="button secondary" disabled={busy || preparing} onClick={close}>Cancelar</button><button className="button" disabled={disabled || !confirmed || !sourceChoice}>{busy ? 'Salvando vistoria…' : initial ? 'Salvar nova versão' : 'Salvar vistoria'}</button></div>
    </form>
  </dialog>, document.body);
}

function InspectionItemFields({item, number, source, photos, existingPhotoCount, canAddPhoto, onChange, onRemove, onChoosePhoto, onCaption, onRemovePhoto}: {item: InspectionItemDraft; number: string; source?: InspectionSource['items'][number]; photos: PendingInspectionPhoto[]; existingPhotoCount: number; canAddPhoto: boolean; onChange: (values: Partial<InspectionItemDraft>) => void; onRemove: () => void; onChoosePhoto: (input: HTMLInputElement) => void; onCaption: (id: string, caption: string) => void; onRemovePhoto: (id: string) => void}) {
  return <article className="piv-item"><div className="piv-row-heading"><h4>Item {number}</h4><button type="button" className="text-button piv-compact" aria-label={'Remover item ' + number} onClick={onRemove}>Remover</button></div>
    <label className="field"><span>Nome do item {number}</span><input required maxLength={200} value={item.name} onChange={event => onChange({name: event.target.value})}/></label>
    {source && <p className="piv-help">Origem declarada: necessário {source.planned ?? 'não informado'} · disponível informado {source.checked ?? 'não informado'}{source.condition ? ' · condição: ' + source.condition : ''}{source.note ? ' · observação: ' + source.note : ''}.</p>}
    <div className="piv-grid"><label className="field"><span>Quantidade observada</span><input type="number" inputMode="numeric" min={0} step={1} max={Number.MAX_SAFE_INTEGER} value={item.quantity} placeholder="Não informada" onChange={event => onChange({quantity: event.target.value})}/></label><label className="field"><span>Condição observada</span><input maxLength={200} value={item.condition} placeholder="Descreva o que foi observado" onChange={event => onChange({condition: event.target.value})}/></label></div>
    <details><summary>Marca, modelo, material, cor e descrição</summary><div className="piv-grid">{([['Marca', 'brand', 160], ['Modelo', 'model', 160], ['Material', 'material', 200], ['Cor', 'color', 120]] as const).map(([label, key, max]) => <label className="field" key={key}><span>{label}</span><input maxLength={max} value={item[key]} onChange={event => onChange({[key]: event.target.value})}/></label>)}</div><label className="field"><span>Descrição</span><textarea rows={2} maxLength={4000} value={item.description} onChange={event => onChange({description: event.target.value})}/></label></details>
    <label className="field"><span>Observação / ressalva do item</span><textarea rows={2} maxLength={4000} value={item.note} onChange={event => onChange({note: event.target.value})}/></label>
    <label className="confirm"><input type="checkbox" checked={item.pending} onChange={event => onChange({pending: event.target.checked})}/><span>Há uma pendência neste item</span></label>
    {item.pending && <div className="piv-grid"><label className="field"><span>Responsável pela pendência (opcional)</span><input maxLength={160} value={item.responsible} onChange={event => onChange({responsible: event.target.value})}/></label><label className="field"><span>Prazo da pendência (opcional)</span><input type="date" value={item.due_on || ''} onChange={event => onChange({due_on: event.target.value || null})}/></label></div>}
    <details><summary>Fotos do item{existingPhotoCount || photos.length ? ` (${existingPhotoCount} salvas · ${photos.length} selecionadas)` : ''}</summary>
      {existingPhotoCount > 0 && <p className="piv-help">As {existingPhotoCount} fotos já salvas ficam preservadas e disponíveis ao consultar a vistoria.</p>}
      <PhotoFileControls disabled={!canAddPhoto} cameraLabel="Tirar foto do item" fileLabel="Escolher foto do item" onSelect={onChoosePhoto}/>
      {!!photos.length && <div className="piv-photo-grid">{photos.map(photo => <PendingPhoto key={photo.id} photo={photo} itemName={item.name} onCaption={value => onCaption(photo.id, value)} onRemove={() => onRemovePhoto(photo.id)}/>)}</div>}
    </details>
  </article>;
}
function PendingPhoto({photo, itemName, onCaption, onRemove}: {photo: PendingInspectionPhoto; itemName: string; onCaption: (value: string) => void; onRemove: () => void}) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {const next = URL.createObjectURL(photo.file); if (image.current) image.current.src = next; return () => URL.revokeObjectURL(next);}, [photo.file]);
  return <figure><img ref={image} alt={'Foto ainda não enviada de ' + (itemName || 'item')} width={360} height={230}/><figcaption>Foto selecionada, ainda não enviada</figcaption><label className="field"><span>Legenda da foto</span><input required maxLength={500} value={photo.caption} onChange={event => onCaption(event.target.value)}/></label><button type="button" className="button secondary piv-compact" onClick={onRemove}>Descartar foto selecionada</button></figure>;
}
