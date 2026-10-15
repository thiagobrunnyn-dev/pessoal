'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import type {InspectionDetail} from '../../lib/property-inspections';
import SignaturePad from './signature-pad';

export type InspectionSignatureProps = {propertyId: string; detail: InspectionDetail; onClose: () => void; onSaved: () => Promise<void>};
export default function InspectionSignature({propertyId, detail, onClose, onSaved}: InspectionSignatureProps) {
  const [file, setFile] = useState<File | null>(null), [confirmed, setConfirmed] = useState(false), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), alive = useRef(true), touched = useRef(false), inFlight = useRef(false), requestId = useRef(crypto.randomUUID()), controller = useRef<AbortController | null>(null);
  useEffect(() => {alive.current = true; const node = dialog.current; node?.showModal(); return () => {alive.current = false; controller.current?.abort(); node?.close();};}, []);
  useEffect(() => {if (!dirty && !busy) return; const warn = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';}; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);}, [dirty, busy]);
  function close() {if (inFlight.current) return; if (!dirty || window.confirm('Descartar esta assinatura ainda não salva?')) onClose();}
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || !file || !confirmed || !detail.signing.can_sign || detail.property_archived) return;
    inFlight.current = true; setBusy(true); setError(''); const pending = new AbortController(); controller.current = pending;
    const form = new FormData();
    for (const [key, value] of Object.entries({action: 'sign', property_id: propertyId, id: detail.inspection.id, expected_version: String(detail.inspection.version), request_id: requestId.current, confirmed: 'yes', declaration: 'yes'})) form.set(key, value);
    form.set('signature', file);
    try {const response = await fetch('/api/property-inspections', {method: 'POST', credentials: 'same-origin', body: form, signal: pending.signal}); const result = await response.json() as {id?: string; signature_id?: string; version?: number; error?: string};
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a assinatura.');
      if (result.id !== detail.inspection.id || result.version !== detail.inspection.version || !result.signature_id) throw new Error('O servidor não confirmou a assinatura. Tente novamente com este mesmo desenho.');
      if (alive.current && !pending.signal.aborted) {setDirty(false); await onSaved();}
    } catch (cause) {if (alive.current && !pending.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a assinatura.');}
    finally {inFlight.current = false; if (alive.current) setBusy(false);}
  }
  return createPortal(<dialog ref={dialog} className="piv-dialog" style={{width: 690}} aria-labelledby="piv-sign-title" onCancel={event => {event.preventDefault(); close();}} onClick={event => {if (event.target === event.currentTarget) close();}}><div className="piv-heading"><div><h2 id="piv-sign-title">Assinar esta versão</h2><p className="muted">Versão {detail.inspection.version} · {detail.inspection.property.name}</p></div><button type="button" className="button secondary piv-compact" disabled={busy} aria-label="Fechar assinatura de vistoria" onClick={close}><X size={18}/>Fechar</button></div>
    <p><strong>{detail.signing.actor.name}</strong>{detail.signing.actor.title ? ' · ' + detail.signing.actor.title : ''}</p>
    <p className="piv-help">A assinatura será vinculada a este acesso autenticado, ao horário do registro e à versão {detail.inspection.version}. Uma nova versão precisa de nova assinatura.</p>
    {detail.signing.can_sign && !detail.property_archived ? <form onSubmit={save}><p className="piv-snapshot">{detail.signing.statement_text}</p><div onPointerDownCapture={() => {touched.current = true; setDirty(true); setConfirmed(false);}}><SignaturePad resetKey={detail.inspection.id + ':' + detail.inspection.version} disabled={busy} onChange={value => {setFile(value); setConfirmed(false); if (touched.current || value) setDirty(true);}}/></div><label className="confirm"><input type="checkbox" required disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Li a declaração e esta é minha própria assinatura, feita pessoalmente para esta versão.</span></label>{error && <p className="error" role="alert">{error} Seu desenho foi mantido para tentar novamente.</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancelar</button><button className="button" disabled={busy || !file || !confirmed}>{busy ? 'Salvando assinatura…' : 'Salvar minha assinatura'}</button></div></form> : <p className="piv-warning">{detail.property_archived ? 'Restaure o imóvel para registrar uma assinatura.' : 'Este acesso não pode assinar esta versão, ou já registrou sua assinatura. Consulte a versão atual.'}</p>}
  </dialog>, document.body);
}
