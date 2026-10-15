'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {CheckCircle2, House, Package, ShieldCheck, Star, Wrench, X} from 'lucide-react';
import {GUEST_MAINTENANCE_CATEGORIES, type GuestMaintenanceCategory} from '../../lib/guest-request-categories';
import PhotoFileControls from './photo-file-controls';
import {prepareMobilizationPhoto} from '../mobilization-form';
import {
  emptyGuestScores, GUEST_KIND_LABELS, GUEST_SCORE_LABELS, guestDate, guestJson, GuestApiError,
  isGuestChannel, isGuestReceipt, type GuestChannel, type GuestReceipt, type GuestRequestKind,
  type GuestScores, type GuestValues,
} from './guest-channel-types';
import './guest-channel.css';

type Draft = {
  kind: GuestRequestKind; category: GuestMaintenanceCategory | ''; requester_type: string; name: string; job_title: string; location: string; description: string;
  contact: string; company: string; cost_center: string;
  items: {name: string; quantity: string; unit: string}[];
  scores: GuestScores; unable_to_photo: boolean; privacy_accepted: boolean;
};
type Pending = {id: string; values: GuestValues; revision: number; files: File[]};
const kinds = [
  {value: 'maintenance', icon: Wrench}, {value: 'material', icon: Package}, {value: 'rating', icon: Star},
] as const;
const freshDraft = (): Draft => ({kind: 'maintenance', category: '', requester_type: '', name: '', job_title: '', location: '',
  description: '', contact: '', company: '', cost_center: '', items: [{name: '', quantity: '', unit: ''}],
  scores: emptyGuestScores(), unable_to_photo: false, privacy_accepted: false});
const errorText = (error: unknown) => error instanceof Error && error.name !== 'AbortError'
  ? error.message : 'A conexão demorou mais do que o esperado.';

function Brand() {
  return <header className="guest-brand"><img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="" width={112} height={64}/>
    <div><strong>MOBILIZA FACILITIES</strong><span>Canal de solicitações</span></div></header>;
}
function PhotoPreview({file, position, disabled, onRemove}: {file: File; position: number; disabled: boolean; onRemove: () => void}) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return <div className="guest-photo">{url && <img src={url} alt={'Foto selecionada ' + position}/>}
    <button type="button" className="button secondary" disabled={disabled} onClick={onRemove}
      aria-label={'Remover foto ' + position}><X size={16} aria-hidden="true"/>Remover</button></div>;
}

export default function GuestChannelForm({token}: {token: string}) {
  const endpoint = '/api/guest-channel/' + encodeURIComponent(token);
  const [channel, setChannel] = useState<GuestChannel | null>(null);
  const [draft, setDraft] = useState<Draft>(freshDraft), [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false);
  const [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [photoError, setPhotoError] = useState('');
  const [loadError, setLoadError] = useState(''), [receipt, setReceipt] = useState<GuestReceipt | null>(null), [needsRefresh, setNeedsRefresh] = useState(false);
  const pending = useRef<Pending | null>(null), working = useRef(false), preparingRef = useRef(false), alive = useRef(true);
  const requestAbort = useRef<AbortController | null>(null), loadAbort = useRef<AbortController | null>(null);
  const lastChannel = useRef<GuestChannel | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), errorRef = useRef<HTMLDivElement>(null);
  const dirty = !receipt && (!!draft.category || !!draft.requester_type || !!draft.name || !!draft.job_title || !!draft.location || !!draft.description || !!draft.contact
    || !!draft.company || !!draft.cost_center || draft.items.some(item => !!item.name || !!item.quantity || !!item.unit)
    || Object.values(draft.scores).some(score => score !== null) || draft.privacy_accepted || files.length > 0 || uncertain);

  const load = useCallback(async () => {
    loadAbort.current?.abort(); const controller = new AbortController(); loadAbort.current = controller;
    setLoading(true); setLoadError('');
    try {
      const result = await guestJson(endpoint, {signal: controller.signal});
      if (!isGuestChannel(result)) throw new Error('Não foi possível confirmar o imóvel deste canal.');
      if (alive.current && !controller.signal.aborted) {
        if (lastChannel.current && lastChannel.current.privacy_version !== result.privacy_version) {
          setDraft(value => ({...value, privacy_accepted: false}));
        }
        lastChannel.current = result; setChannel(result); setNeedsRefresh(false);
      }
    } catch (cause) {
      if (alive.current && !controller.signal.aborted) setLoadError(cause instanceof GuestApiError && [403, 404, 410].includes(cause.status)
        ? 'Este canal está indisponível. Confira o acesso com a gestão do imóvel.' : errorText(cause));
    } finally { if (alive.current && !controller.signal.aborted) setLoading(false); }
  }, [endpoint]);

  useEffect(() => { alive.current = true; void load(); return () => {
    alive.current = false; requestAbort.current?.abort(); loadAbort.current?.abort();
  }; }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (receipt) heading.current?.focus(); }, [receipt]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (working.current || preparingRef.current || uncertain) return;
    pending.current = null; setDraft(previous => ({...previous, [key]: value})); setError('');
  }
  async function addPhotos(input: HTMLInputElement) {
    const selected = Array.from(input.files ?? []); input.value = '';
    if (!selected.length || working.current || preparingRef.current || uncertain || draft.unable_to_photo) return;
    setPhotoError('');
    if (files.length + selected.length > 3) { setPhotoError('Selecione no máximo 3 fotos ao todo.'); return; }
    preparingRef.current = true; setPreparing(true);
    try {
      const prepared: File[] = [];
      for (const file of selected) {
        const ready = await prepareMobilizationPhoto(file);
        prepared.push(new File([ready], 'foto-' + (files.length + prepared.length + 1) + '.jpg', {type: ready.type}));
      }
      if (alive.current) { pending.current = null; setFiles(previous => [...previous, ...prepared]); }
    } catch (cause) { if (alive.current) setPhotoError(errorText(cause)); }
    finally { preparingRef.current = false; if (alive.current) setPreparing(false); }
  }
  function snapshot(): Pending {
    if (!channel) throw new Error('Confira o imóvel antes de enviar.');
    if (draft.name.trim().length < 2) throw new Error('Informe seu nome.');
    if (draft.kind === 'maintenance' && !draft.category) throw new Error('Escolha o assunto da manutenção ou melhoria.');
    if (draft.kind !== 'rating' && !draft.requester_type) throw new Error('Informe se você é hóspede, cliente, equipe ou outro.');
    if (draft.kind !== 'rating' && !draft.description.trim()) throw new Error('Descreva o que você precisa.');
    if (draft.kind === 'rating' && !Object.values(draft.scores).some(score => score !== null)) {
      throw new Error('Escolha pelo menos uma nota para avaliar a hospedagem.');
    }
    const items = draft.kind === 'material' ? draft.items.map(item => ({name: item.name.trim(), quantity: Number(item.quantity), unit: item.unit.trim()})) : [];
    if (draft.kind === 'material' && (!items.length || items.some(item => !item.name || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 100000 || !/^\d+(?:\.\d{1,3})?$/.test(String(item.quantity))))) {
      throw new Error('Informe o material e uma quantidade positiva de até 100.000, com no máximo três casas decimais.');
    }
    if (!draft.privacy_accepted) throw new Error('Leia e confirme como seus dados serão usados.');
    return {id: crypto.randomUUID(), revision: channel.channel_revision, files: draft.kind === 'rating' ? [] : [...files], values: {
      kind: draft.kind, category: draft.kind === 'maintenance' ? draft.category : '', name: draft.name.trim(),
      job_title: [draft.requester_type, ['Equipe / prestador', 'Outro'].includes(draft.requester_type) ? draft.job_title.trim() : ''].filter(Boolean).join(' · '), location: draft.location.trim(),
      description: draft.description.trim(), contact: draft.contact.trim(), company: draft.company.trim(), cost_center: draft.cost_center.trim(),
      items, scores: draft.kind === 'rating' ? {...draft.scores} : emptyGuestScores(), unable_to_photo: draft.kind === 'rating' ? false : draft.unable_to_photo,
      privacy_accepted: true, privacy_version: channel.privacy_version,
    }};
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working.current || preparingRef.current || !channel) return;
    let attempt: Pending;
    try { attempt = pending.current ?? snapshot(); } catch (cause) { setError(errorText(cause)); return; }
    pending.current = attempt; working.current = true; setBusy(true); setError('');
    const controller = new AbortController(); requestAbort.current = controller;
    let posted = false;
    try {
      // Each explicit retry gets a new short-lived challenge but preserves the entire submission.
      const result = await guestJson(endpoint + '/session', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: '{}', signal: controller.signal}) as {challenge?: unknown; expires_at?: unknown};
      if (!result || typeof result.challenge !== 'string' || !/^[a-f0-9]{64}$/i.test(result.challenge)) {
        throw new Error('Não foi possível preparar o envio. Tente novamente.');
      }
      const body = new FormData();
      body.set('request_id', attempt.id); body.set('challenge', result.challenge);
      body.set('channel_revision', String(attempt.revision)); body.set('values', JSON.stringify(attempt.values));
      attempt.files.forEach(file => body.append('photos', file));
      posted = true;
      const saved = await guestJson(endpoint, {method: 'POST', body, signal: controller.signal}, 45000);
      if (!isGuestReceipt(saved)) throw new Error('O servidor não confirmou o protocolo.');
      if (alive.current) {
        setReceipt({protocol: saved.protocol, received_at: saved.received_at, alreadySaved: saved.alreadySaved});
        setUncertain(false); setDraft(freshDraft()); setFiles([]); pending.current = null;
      }
    } catch (cause) {
      if (alive.current) {
        // Validation/rate-limit denials are definitive. Network/5xx/unknown outcomes must remain frozen.
        const rejected = posted && cause instanceof GuestApiError && [400, 401, 403, 404, 409, 410, 413, 415, 422, 429].includes(cause.status);
        const unresolved = uncertain || (posted && !rejected);
        setUncertain(unresolved);
        if (!unresolved && cause instanceof GuestApiError && cause.status === 409) setNeedsRefresh(true);
        setError(unresolved
          ? cause instanceof GuestApiError && [403, 404, 410].includes(cause.status)
            ? 'Este canal está indisponível e não foi possível confirmar o recebimento anterior. O registro pode ter sido recebido. Procure a gestão do imóvel para conferir antes de enviar novamente por outro canal. Seus dados e fotos continuam nesta página.'
            : 'Ainda não foi possível confirmar o recebimento. Mantenha esta página aberta e use “Conferir este mesmo envio”. Seus dados e fotos foram mantidos para evitar duplicidade.'
          : errorText(cause) + ' Os campos e fotos selecionados foram mantidos.');
      }
    } finally {
      working.current = false; if (requestAbort.current === controller) requestAbort.current = null;
      if (alive.current) setBusy(false);
    }
  }
  const locked = busy || preparing || uncertain;
  return <div className="guest-channel"><Brand/><main className="guest-shell">
    {loading && !channel && <section className="panel guest-message" role="status"><h1>Conferindo o imóvel…</h1><p>Aguarde um instante.</p></section>}
    {loadError && <section className="panel guest-message"><h1>Não foi possível abrir o canal</h1><p role="alert">{loadError}</p>
      <button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>{loading ? 'Conferindo…' : 'Tentar novamente'}</button></section>}
    {channel && !loadError && <>
      <section className="guest-property" aria-label="Imóvel deste canal"><House size={24} aria-hidden="true"/>
        <div><p>Imóvel{channel.property.code ? ' · ' + channel.property.code : ''}</p><h2>{channel.property.name}</h2><address>{channel.property.address || 'Endereço não informado'}</address></div></section>
      {receipt ? <section className="panel guest-receipt"><CheckCircle2 size={38} aria-hidden="true"/>
        <h1 ref={heading} tabIndex={-1}>Recebido pela gestão</h1><p>Guarde o protocolo para falar com a equipe.</p>
        <dl><div><dt>Protocolo</dt><dd>{receipt.protocol}</dd></div><div><dt>Recebido em</dt><dd>{guestDate(receipt.received_at)}</dd></div></dl>
        <p className="guest-help">O protocolo confirma o recebimento. O atendimento e o prazo dependem da análise da gestão.</p>
        <button type="button" className="button secondary" onClick={() => {setReceipt(null); setError(''); setPhotoError(''); void load();}}>Fazer outro registro</button>
      </section> : <>
        <section className="guest-intro"><h1>{draft.kind === 'maintenance' ? 'Solicitar manutenção ou melhoria' : GUEST_KIND_LABELS[draft.kind]}</h1><p>{draft.kind === 'maintenance' ? 'Lâmpada, internet, elétrica, hidráulica, ar-condicionado, mobiliário ou outra necessidade do imóvel.' : 'A gestão recebe as informações de forma privada.'}</p></section>
        <form className="panel guest-form" onSubmit={submit} autoComplete="off">
          <fieldset disabled={locked} className="guest-fieldset">
            <legend className="sr-only">Dados do registro</legend>
            <details className="guest-alternatives"><summary>Outras opções: material ou avaliação</summary><fieldset className="guest-kind"><legend>Tipo de registro</legend><div>{kinds.map(({value, icon: Icon}) =>
              <label key={value} className={draft.kind === value ? 'selected' : ''}><input type="radio" name="kind" value={value}
                checked={draft.kind === value} onChange={() => edit('kind', value)}/><Icon size={21} aria-hidden="true"/><span>{GUEST_KIND_LABELS[value]}</span></label>)}</div></fieldset></details>
            <div className="guest-section guest-request-main"><h2>{draft.kind === 'maintenance' ? 'O que precisa de atenção?' : GUEST_KIND_LABELS[draft.kind]}</h2>
              {draft.kind === 'maintenance' && <label className="field"><span>Assunto <b aria-hidden="true">*</b></span><select required value={draft.category}
                onChange={event => edit('category', event.target.value as Draft['category'])}>
                <option value="">Selecione o assunto</option>{Object.entries(GUEST_MAINTENANCE_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>}
              <label className="field"><span>Quarto, ambiente ou área (opcional)</span><input maxLength={160} value={draft.location}
                onChange={event => edit('location', event.target.value)} placeholder="Ex.: quarto 3, cozinha ou área externa"/></label>
              {draft.kind === 'rating' && <div className="guest-scores"><p className="guest-help">Sua avaliação tem seu nome e fica privada para a gestão. Escolha ao menos uma nota: 1 = muito ruim, 5 = muito bom.</p>
                {(Object.keys(GUEST_SCORE_LABELS) as (keyof GuestScores)[]).map(key => <fieldset key={key}><legend>{GUEST_SCORE_LABELS[key]}</legend>
                  <div className="guest-score-options">{[1, 2, 3, 4, 5].map(score => <label key={score} className={draft.scores[key] === score ? 'selected' : ''}>
                    <input type="radio" name={'score-' + key} value={score} checked={draft.scores[key] === score}
                      onChange={() => edit('scores', {...draft.scores, [key]: score})}/><span>{score}</span></label>)}
                    <label className="guest-score-unset"><input type="radio" name={'score-' + key} value="" checked={draft.scores[key] === null}
                      onChange={() => edit('scores', {...draft.scores, [key]: null})}/><span>Não avaliar</span></label></div></fieldset>)}</div>}
              {draft.kind === 'material' && <div className="guest-items"><p className="guest-help">Informe o que é necessário. O pedido será analisado pela gestão e não gera compra automática.</p>
                {draft.items.map((item, index) => <fieldset key={index} className="guest-item"><legend>Item {index + 1}</legend>
                  <label className="field"><span>Material <b aria-hidden="true">*</b></span><input required maxLength={180} value={item.name} onChange={event => edit('items', draft.items.map((row, position) => position === index ? {...row, name: event.target.value} : row))}/></label>
                  <div className="guest-columns"><label className="field"><span>Quantidade <b aria-hidden="true">*</b></span><input required type="number" min="0.001" max="100000" step="0.001" inputMode="decimal" value={item.quantity}
                    onChange={event => edit('items', draft.items.map((row, position) => position === index ? {...row, quantity: event.target.value} : row))}/></label>
                    <label className="field"><span>Unidade (opcional)</span><input maxLength={40} value={item.unit} placeholder="Ex.: unidade, caixa, litro" onChange={event => edit('items', draft.items.map((row, position) => position === index ? {...row, unit: event.target.value} : row))}/></label></div>
                  {draft.items.length > 1 && <button type="button" className="button secondary" onClick={() => edit('items', draft.items.filter((_, position) => position !== index))}>Remover item {index + 1}</button>}
                </fieldset>)}<button type="button" className="button secondary" disabled={draft.items.length >= 20}
                  onClick={() => edit('items', [...draft.items, {name: '', quantity: '', unit: ''}])}>Adicionar material</button>
              </div>}
              <label className="field"><span>{draft.kind === 'rating' ? 'Comentário (opcional)' : <>Descreva o que você precisa <b aria-hidden="true">*</b></>}</span>
                <textarea required={draft.kind !== 'rating'} rows={4} maxLength={3000} value={draft.description}
                  onChange={event => edit('description', event.target.value)} placeholder={draft.kind === 'maintenance' ? draft.category === 'other' ? 'Explique qual manutenção ou melhoria é necessária.' : 'Conte o que está acontecendo ou o que pode melhorar.' : undefined}/></label>
            </div>
            <div className="guest-section"><h2>Quem está enviando</h2><p className="guest-help">A identificação é declarada por você. Este envio não confirma vínculo com a empresa nem hospedagem.</p>
              <div className="guest-columns"><label className="field"><span>Seu nome <b aria-hidden="true">*</b></span><input required minLength={2} maxLength={120}
                value={draft.name} onChange={event => edit('name', event.target.value)} autoComplete="off"/></label>
                <label className="field"><span>Você é / função{draft.kind === 'rating' ? ' (opcional)' : <b aria-hidden="true"> *</b>}</span><select required={draft.kind !== 'rating'}
                  value={draft.requester_type} onChange={event => edit('requester_type', event.target.value)}>
                  <option value="">Selecione</option>{['Hóspede', 'Cliente', 'Equipe / prestador', 'Outro'].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
              {['Equipe / prestador', 'Outro'].includes(draft.requester_type) && <label className="field"><span>Função ou vínculo (opcional)</span><input maxLength={90}
                value={draft.job_title} onChange={event => edit('job_title', event.target.value)} autoComplete="off" placeholder="Informe se for relevante para a solicitação"/></label>}
              <label className="field"><span>Contato para retorno (opcional)</span><input maxLength={160} value={draft.contact}
                onChange={event => edit('contact', event.target.value)} autoComplete="off" placeholder="Telefone ou e-mail"/></label>
              <details className="guest-optional"><summary>Dados da empresa (opcional)</summary><div className="guest-columns"><label className="field"><span>Empresa informada (opcional)</span><input maxLength={180} value={draft.company}
                onChange={event => edit('company', event.target.value)} autoComplete="off"/></label><label className="field"><span>Centro de custo informado (opcional)</span>
                <input maxLength={180} value={draft.cost_center} onChange={event => edit('cost_center', event.target.value)} autoComplete="off"/></label></div></details>
            </div>
            {draft.kind !== 'rating' ? <div className="guest-section"><h2>Fotos (opcional)</h2><p className="guest-help">Até 3 fotos. Evite pessoas, documentos e objetos pessoais identificáveis. Confira o que aparece antes de enviar.</p>
              <PhotoFileControls multiple disabled={locked || files.length >= 3 || draft.unable_to_photo} onSelect={addPhotos} fileLabel="Escolher fotos"/>
              <p className="guest-help guest-photo-hint">JPG, PNG ou WebP. Cada foto é preparada no dispositivo para até 4 MB; escolha arquivos de até 20 MB.</p>
              {preparing && <p role="status">Preparando as fotos…</p>}{photoError && <p className="error" role="alert">{photoError}</p>}
              {!!files.length && <div className="guest-photos">{files.map((file, index) => <PhotoPreview key={index} file={file} position={index + 1} disabled={locked}
                onRemove={() => {pending.current = null; setFiles(previous => previous.filter((_, position) => position !== index));}}/>)}</div>}
              <label className="guest-check"><input type="checkbox" disabled={files.length > 0} checked={draft.unable_to_photo} onChange={event => edit('unable_to_photo', event.target.checked)}/><span>Não consigo fotografar agora</span></label>
              {files.length > 0 && <p className="guest-help">Para marcar que não consegue fotografar, remova as fotos selecionadas.</p>}
            </div> : files.length > 0 && <p className="guest-help">As fotos ficam no pedido e não são enviadas na avaliação. Para vê-las, volte ao tipo de solicitação anterior.</p>}
            <p className="guest-urgency">Este canal não atende emergências e não garante resposta imediata. Em situação de risco, procure o responsável local ou o serviço de emergência adequado.</p>
            <div className="guest-privacy"><ShieldCheck size={22} aria-hidden="true"/><div><h2>Uso das informações</h2><p>Seu nome e os demais dados informados, incluindo fotos, serão recebidos pela gestão da MOBILIZA FACILITIES para analisar e tratar este registro. O conteúdo é privado para a gestão.</p>
              <p>Se informar um contato, ele poderá ser usado para retorno sobre este registro. Envie apenas os dados necessários e informações que você possa compartilhar.</p>
              <label className="guest-check"><input type="checkbox" required checked={draft.privacy_accepted} onChange={event => edit('privacy_accepted', event.target.checked)}/>
                <span>Li e concordo com o uso das informações para tratar este registro. <b aria-hidden="true">*</b></span></label></div></div>
          </fieldset>
          {error && <div ref={errorRef} tabIndex={-1} className="guest-error" role="alert">{error}</div>}
          {needsRefresh && !uncertain && <button type="button" className="button secondary guest-refresh" disabled={busy || loading}
            onClick={() => {pending.current = null; void load();}}>Atualizar canal e manter preenchimento</button>}
          <button type="submit" className="button full" disabled={busy || preparing || loading || needsRefresh}>{busy ? 'Enviando…' : uncertain ? 'Conferir este mesmo envio' : draft.kind === 'rating' ? 'Enviar avaliação identificada' : 'Enviar solicitação'}</button>
          <p className="guest-help guest-submit-help">Campos com * são obrigatórios. As informações ficam nesta página até o envio; fechar ou recarregar pode perder o preenchimento.</p>
        </form>
      </>}
    </>}
  </main><footer className="guest-footer">MOBILIZA FACILITIES · Canal de solicitações</footer></div>;
}
