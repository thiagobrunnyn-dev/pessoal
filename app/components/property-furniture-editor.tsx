'use client';
import {standardEnvironmentMatch,standardItemDefinition,matchesStandardItem} from '../../lib/furniture-standard';
import FurnitureStandardPicker from './furniture-standard-picker';
import {furnitureDetails} from '../../lib/furniture-details';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {Plus, Trash2, X} from 'lucide-react';
import type {MobilizationEnvironment} from '../../lib/mobilizations';
import {assertFurnitureSaved, furnitureEndpoint, furnitureMessage, readFurniture, type Furniture, type FurnitureItem, type FurnitureResponse} from './property-furniture-types';

type DraftItem = Omit<FurnitureItem, 'planned' | 'checked' | 'photo_count'> & {planned: string; checked: string};
const draftItems = (items: FurnitureItem[]): DraftItem[] => items.map(item => ({id: item.id, label: item.label, environment_id: item.environment_id, planned: item.planned == null ? '' : String(item.planned), checked: item.checked == null ? '' : String(item.checked), note: item.note, ...furnitureDetails(item), condition: item.condition ?? ''}));
const validQuantity = (value: string) => value === '' || /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
const emptyEnvironment = (): MobilizationEnvironment => ({id: crypto.randomUUID(), label: '', kind: 'other', level: null, layout: null, single_beds: null});
const emptyItem = (environmentId: string | null): DraftItem => ({id: crypto.randomUUID(), label: '', environment_id: environmentId, planned: '', checked: '', condition: '', note: ''});

/** Reapply only the fields changed in this draft; keep concurrent additions and IDs. */
function mergeDraft<T extends {id: string}>(original: T[], draft: T[], current: T[]): T[] {
  const merged = current.map(row => {
    const before = original.find(value => value.id === row.id), edit = draft.find(value => value.id === row.id);
    if (!before || !edit) return row;
    const next = {...row};
    for (const key of Object.keys(edit) as (keyof T)[]) if (JSON.stringify(edit[key]) !== JSON.stringify(before[key])) next[key] = edit[key];
    return next;
  });
  return [...merged, ...draft.filter(row => !original.some(value => value.id === row.id) && !current.some(value => value.id === row.id))];
}

export default function FurnitureStructureDialog({propertyId, furniture, onClose, onSaved,initialStandard=false}: {initialStandard?:boolean;propertyId: string; furniture: Furniture | null; onClose: () => void; onSaved: () => Promise<void>}) {
  const dialog = useRef<HTMLDialogElement>(null),standardEnvironmentIds=useRef(new Set<string>());
  const [standardOpen,setStandardOpen]=useState(initialStandard);
  const [baseline, setBaseline] = useState(furniture);
  const [environments, setEnvironments] = useState<MobilizationEnvironment[]>(() => furniture?.environments.map(row => ({...row})) ?? []);
  const [items, setItems] = useState<DraftItem[]>(() => draftItems(furniture?.equipment ?? []));
  const [note, setNote] = useState(''), [resume, setResume] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Furniture | null>(null), [checking, setChecking] = useState(false);
  const alive = useRef(true), inFlight = useRef(false), requestId = useRef(crypto.randomUUID()), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true; const node = dialog.current; node?.showModal();
    return () => { alive.current = false; pending.current?.abort(); node?.close(); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const savedEnvironmentIds = new Set(baseline?.environments.map(row => row.id));
  const savedItemIds = new Set(baseline?.equipment.map(row => row.id));
  function changed() { requestId.current = crypto.randomUUID(); setDirty(true); setConfirmed(false); }
  function close() { if (inFlight.current || checking) return; if (!dirty || window.confirm('Descartar as alterações da lista ainda não salvas?')) onClose(); }
  function updateItem(id: string, patch: Partial<DraftItem>) { setItems(rows => rows.map(row => row.id === id ? {...row, ...patch} : row)); changed(); }
  function addItem(environmentId: string | null) { if (items.length >= 100) return; setItems(rows => [...rows, emptyItem(environmentId)]); changed(); }
  function removeEnvironment(id: string) {
    if (savedEnvironmentIds.has(id)) return;
    if (items.some(row => row.environment_id === id) && !window.confirm('Remover este novo ambiente? Seus itens ficam em Geral do imóvel no rascunho.')) return;
    setEnvironments(rows => rows.filter(row => row.id !== id)); setItems(rows => rows.map(row => row.environment_id === id ? {...row, environment_id: null} : row)); changed();
  }
  async function checkLatest() {
    if (inFlight.current || checking) return;
    const controller = new AbortController(); pending.current = controller; setChecking(true); setError('');
    try {
      const query = new URLSearchParams({property_id: propertyId}); if (baseline?.source_kind !== 'property' && baseline?.id) query.set('mobilization_id', baseline.id);
      const body = await readFurniture<FurnitureResponse>('/api/property-furniture?' + query, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      if (body.property_id !== propertyId || body.furniture?.property_id !== propertyId || baseline && (body.furniture.id !== baseline.id || body.furniture.source_kind !== baseline.source_kind)) throw new Error('A origem da lista mudou. Seu rascunho foi mantido; feche este editor e confira a ficha antes de continuar.');
      if (!body.furniture || body.furniture.can_edit === false) throw new Error('A lista precisa de revisão pela gestão antes de novas alterações.');
      setLatest(body.furniture);
    } catch (cause) { if (alive.current && !controller.signal.aborted) setError(furnitureMessage(cause)); }
    finally { if (alive.current && !controller.signal.aborted) setChecking(false); }
  }
  function useLatest() {
    if (!latest) return;
    const originalEnvironments=baseline?.environments??[],originalItems=draftItems(baseline?.equipment??[]),currentItems=draftItems(latest.equipment),map=new Map<string,string>();
    for(const environment of environments){if(originalEnvironments.some(row=>row.id===environment.id)||!standardEnvironmentIds.current.has(environment.id))continue;const saved=latest.environments.find(row=>standardEnvironmentMatch(row.label,environment.label)&&row.kind===environment.kind);if(saved)map.set(environment.id,saved.id);}
    const nextEnvironments=mergeDraft(originalEnvironments,environments.filter(row=>!map.has(row.id)),latest.environments);
    const extraOriginal:DraftItem[]=[];
    const nextDraft=items.map(row=>({...row,environment_id:row.environment_id?map.get(row.environment_id)??row.environment_id:null})).map(row=>{
      if(originalItems.some(item=>item.id===row.id)||!row.standard_key)return row;
      const saved=currentItems.find(item=>item.environment_id===row.environment_id&&matchesStandardItem(item,row.standard_key!));if(!saved)return row;
      const definition=standardItemDefinition(row.standard_key)!;
      extraOriginal.push({...row,id:saved.id,label:definition.label,planned:'',checked:'',condition:'',specification:'',applicability:'',note:''});
      return {...row,id:saved.id};
    });
    setEnvironments(nextEnvironments);setItems(mergeDraft([...originalItems,...extraOriginal],nextDraft,currentItems));
    setBaseline(latest); setLatest(null); setConflict(false); setResume(false); setError(''); changed();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || checking || conflict) return;
    if (!environments.length && !items.length) { setError('Adicione ao menos um ambiente ou item para salvar a mobília.'); return; }
    if (environments.some(row => !row.label.trim()) || items.some(row => !row.label.trim())) { setError('Informe o nome de cada ambiente e item.'); return; }
    if (items.some(row => !validQuantity(row.planned) || !validQuantity(row.checked))) { setError('Use quantidades inteiras iguais ou maiores que zero, ou deixe em branco.'); return; }
    if (!confirmed) { setError('Confira e confirme a lista antes de salvar.'); return; }
    const form = new FormData();
    form.set('action', 'structure_update'); form.set('property_id', propertyId); if (baseline?.id) form.set('id', baseline.id);
    form.set('expected_version', String(baseline?.version ?? 0)); form.set('request_id', requestId.current); form.set('confirmed', 'yes');
    form.set('environments', JSON.stringify(environments.map(row => ({...row, label: row.label.trim()}))));
    form.set('equipment', JSON.stringify(items.map(row => ({...row, label: row.label.trim(), planned: row.planned === '' ? null : Number(row.planned), checked: row.checked === '' ? null : Number(row.checked), condition: row.condition?.trim() ?? '', note: row.note.trim()}))));
    if (note.trim()) form.set('note', note.trim()); if (resume && baseline?.can_resume_preparation) form.set('resume_preparation', 'yes');
    const controller = new AbortController(); pending.current = controller; inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(furnitureEndpoint(baseline), {method: 'POST', credentials: 'same-origin', body: form, signal: controller.signal});
      let body: {error?: string}; try { body = await response.json(); } catch { throw new Error(response.status === 401 || response.status === 403 ? 'Seu acesso precisa ser validado. Entre novamente e tente salvar o rascunho.' : 'Não foi possível confirmar o salvamento. Tente novamente com este mesmo rascunho.'); }
      if (!response.ok) { if (alive.current) setConflict(response.status === 409); throw new Error(body.error || 'Não foi possível salvar a lista.'); }
      assertFurnitureSaved(body, baseline, propertyId);
      if (alive.current && !controller.signal.aborted) { setDirty(false); await onSaved(); }
    } catch (cause) { if (alive.current && !controller.signal.aborted) setError(furnitureMessage(cause)); }
    finally { inFlight.current = false; if (alive.current && !controller.signal.aborted) setBusy(false); }
  }
  const groups = [...environments, {id: '', label: 'Geral do imóvel'}];
  return createPortal(<dialog ref={dialog} className="pf-dialog pf-structure-dialog" aria-labelledby="pf-structure-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="pf-heading"><div><h2 id="pf-structure-title">{baseline ? 'Editar mobília' : 'Cadastrar mobília'}</h2><p className="muted">Ambientes e itens deste imóvel</p></div><button type="button" className="button secondary pf-compact" disabled={busy || checking} onClick={close} aria-label="Fechar edição da mobília"><X size={18}/>Fechar</button></div>
    <p className="pf-help">{baseline?.source_kind === 'mobilization' || baseline && baseline.source_kind !== 'property' ? 'As alterações ficam na mobilização de origem e no histórico, mantendo as fotos dos itens.' : 'A lista fica vinculada a este imóvel. Depois de salvar, use Editar item para adicionar fotos.'}</p>
    {!standardOpen&&<button type="button" className="button secondary pf-compact" disabled={busy||checking} onClick={()=>setStandardOpen(true)}>Aplicar lista padrão</button>}
    {standardOpen&&<FurnitureStandardPicker environments={environments} items={items} disabled={busy||checking} onClose={()=>setStandardOpen(false)} onApply={plan=>{plan.environments.forEach(row=>standardEnvironmentIds.current.add(row.id));setEnvironments(rows=>[...rows,...plan.environments]);setItems(rows=>[...rows,...draftItems(plan.items.map(item=>({...item,photo_count:0})))]);setStandardOpen(false);changed();}}/>}
    <form onSubmit={save}><fieldset className="pf-fields" disabled={busy || checking}>
      {groups.map(environment => <section key={environment.id || 'general'} className="pf-draft-environment" aria-label={environment.id ? 'Ambiente da mobília' : 'Itens gerais do imóvel'}>
        <div className="pf-draft-heading">{environment.id ? <label className="field"><span>Nome do ambiente</span><input required maxLength={200} value={environment.label} placeholder="Ex.: Quarto 1, cozinha" onChange={event => { setEnvironments(rows => rows.map(row => row.id === environment.id ? {...row, label: event.target.value} : row)); changed(); }}/></label> : <h3>Geral do imóvel</h3>}
          {environment.id && !savedEnvironmentIds.has(environment.id) && <button type="button" className="text-button pf-compact" onClick={() => removeEnvironment(environment.id)} aria-label={'Remover novo ambiente ' + (environment.label || 'sem nome')}><Trash2 size={16}/></button>}
        </div>
        <div className="pf-draft-items">{items.filter(row => (row.environment_id ?? '') === environment.id).map(item => <article className="pf-draft-item" key={item.id}>
          <div className="pf-draft-heading"><label className="field"><span>Nome do item</span><input required maxLength={200} value={item.label} placeholder="Ex.: Cama, geladeira" onChange={event => updateItem(item.id, {label: event.target.value})}/></label>{!savedItemIds.has(item.id) && <button type="button" className="text-button pf-compact" onClick={() => { setItems(rows => rows.filter(row => row.id !== item.id)); changed(); }} aria-label={'Remover novo item ' + (item.label || 'sem nome')}><Trash2 size={16}/></button>}</div>
          <label className="field"><span>Aplicação do item</span><select value={item.applicability??''} onChange={event=>updateItem(item.id,{applicability:event.target.value as FurnitureItem['applicability']})}><option value="">Não informado</option><option value="applicable">Aplicável</option><option value="not_applicable">Não se aplica</option></select></label>
          <div className="pf-quantity-inputs"><label className="field"><span>Necessário</span><input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} inputMode="numeric" disabled={item.applicability==='not_applicable'} placeholder="Não informado" value={item.planned} onChange={event => updateItem(item.id, {planned: event.target.value})}/></label><label className="field"><span>Disponível informado</span><input type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} inputMode="numeric" disabled={item.applicability==='not_applicable'} placeholder="Não informado" value={item.checked} onChange={event => updateItem(item.id, {checked: event.target.value})}/></label></div>
          <details className="pf-item-details"><summary>Ambiente, especificação e condição</summary><label className="field"><span>Especificação (opcional)</span><input maxLength={200} value={item.specification??''} placeholder="Tamanho, modelo ou BTU, se informado" onChange={event=>updateItem(item.id,{specification:event.target.value})}/></label><label className="field"><span>Ambiente do item</span><select value={item.environment_id ?? ''} onChange={event => updateItem(item.id, {environment_id: event.target.value || null})}><option value="">Geral do imóvel</option>{environments.map(row => <option key={row.id} value={row.id}>{row.label || 'Novo ambiente'}</option>)}</select></label><label className="field"><span>Condição informada (opcional)</span><input maxLength={200} value={item.condition ?? ''} placeholder="Ex.: bom estado" onChange={event => updateItem(item.id, {condition: event.target.value})}/></label><label className="field"><span>Observação do item (opcional)</span><textarea rows={2} maxLength={2000} value={item.note} onChange={event => updateItem(item.id, {note: event.target.value})}/></label></details>
          {savedItemIds.has(item.id) && <small className="muted">Item salvo: fotos e histórico serão preservados.</small>}
        </article>)}</div>
        <button type="button" className="text-button pf-compact" disabled={items.length >= 100} onClick={() => addItem(environment.id || null)}><Plus size={17}/>Adicionar item{environment.id ? ' neste ambiente' : ' geral'}</button>
      </section>)}
      <button type="button" className="button secondary" disabled={environments.length >= 100} onClick={() => { setEnvironments(rows => [...rows, emptyEnvironment()]); changed(); }}><Plus size={17}/>Adicionar ambiente</button>
      <p className="pf-help muted">Em branco significa quantidade não informada; zero deve ser digitado. Não se aplica deve ser selecionado explicitamente. Ambientes e itens já salvos permanecem na lista para preservar suas evidências.</p>
      {baseline?.can_resume_preparation && <label className="confirm pf-resume"><input type="checkbox" checked={resume} onChange={event => { setResume(event.target.checked); changed(); }}/><span>Retomar a preparação ao salvar. A mobilização sairá de {baseline.stage === 'ready' ? 'Pronta para entrega' : 'Vistoria'} para Preparação.</span></label>}
      {baseline?.stage === 'ready' && !baseline.can_resume_preparation && <p className="today-alert">Esta lista está pronta e vinculada à entrega. As quantidades precisam continuar completas.</p>}
      {baseline?.stage === 'inspection' && <p className="pf-help muted">Na vistoria, explique na observação de cada item as faltas ou quantidades não informadas.</p>}
      {baseline && <label className="field"><span>Observação desta alteração (opcional)</span><textarea rows={2} maxLength={2000} value={note} onChange={event => { setNote(event.target.value); changed(); }}/></label>}
      <label className="confirm"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Conferi os ambientes, itens e quantidades desta lista.</span></label>
    </fieldset>
      {error && <p className="error" role="alert">{error} Seu rascunho foi mantido.</p>}
      {conflict && <div className="today-alert pf-conflict"><p>A lista foi alterada desde a versão {baseline?.version ?? 0}. Confira a versão salva aqui antes de continuar.</p><button type="button" className="button secondary" disabled={checking || busy} onClick={() => void checkLatest()}>{checking ? 'Conferindo…' : 'Ver versão salva'}</button>{latest && <div><p><strong>Versão {latest.version}</strong> · {latest.environments.length} ambientes · {latest.equipment.length} itens</p><ul>{latest.equipment.map(row => <li key={row.id}>{row.label}: {row.planned ?? 'não informado'} necessários / {row.checked ?? 'não informado'} disponíveis{row.condition ? ' · ' + row.condition : ''}</li>)}</ul><p>Ao continuar, suas alterações serão reaplicadas sobre esta versão. Se o mesmo campo foi alterado, valerá o seu rascunho. Confira a lista antes de salvar.</p><button type="button" className="button secondary" onClick={useLatest}>Reaplicar meu rascunho e conferir</button></div>}</div>}
      <div className="form-actions"><button type="button" className="button secondary" disabled={busy || checking} onClick={close}>Cancelar</button><button type="submit" className="button" disabled={busy || checking || conflict || baseline?.can_edit === false}>{busy ? 'Salvando…' : 'Salvar mobília'}</button></div>
    </form>
  </dialog>, document.body);
}
