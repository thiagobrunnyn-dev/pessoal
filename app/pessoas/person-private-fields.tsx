'use client';

import {useEffect, useRef, useState} from 'react';
import PersonMaskedInput from './person-masked-input';

export type PrivatePersonFields = {private_rg: string; private_cpf: string; private_contact: string};
type PrivateResponse = {id: string; revision: number; private_rg: string | null; private_cpf: string | null; private_contact: string | null};
const empty: PrivatePersonFields = {private_rg: '', private_cpf: '', private_contact: ''};

export default function PersonPrivateFields({profileId, revision, disabled, onChange, onLoading}: {
  profileId?: string; revision?: number; disabled: boolean;
  onChange: (changes: Partial<PrivatePersonFields>) => void; onLoading: (loading: boolean) => void;
}) {
  const [values, setValues] = useState<PrivatePersonFields>(empty), [loaded, setLoaded] = useState(!profileId);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [showDocuments, setShowDocuments] = useState(false);
  const changes = useRef<Partial<PrivatePersonFields>>({}), controller = useRef<AbortController | null>(null), alive = useRef(true);
  useEffect(() => {alive.current = true; return () => {alive.current = false; controller.current?.abort();};}, []);

  async function load() {
    if (!profileId || loaded || controller.current || disabled) return;
    const request = new AbortController(); controller.current = request; setLoading(true); setError(''); onLoading(true);
    try {
      const response = await fetch('/api/people/private?id=' + encodeURIComponent(profileId), {credentials: 'same-origin', cache: 'no-store', signal: request.signal});
      const result = await response.json() as PrivateResponse & {error?: string};
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os dados privados.');
      if (result.id !== profileId || result.revision !== revision || ['private_rg', 'private_cpf', 'private_contact'].some(key => result[key as keyof PrivateResponse] !== null && typeof result[key as keyof PrivateResponse] !== 'string')) {
        throw new Error('O cadastro mudou. Feche a edição e atualize a lista antes de continuar.');
      }
      if (!alive.current || request.signal.aborted) return;
      setValues({private_rg: result.private_rg ?? '', private_cpf: result.private_cpf ?? '', private_contact: result.private_contact ?? ''}); setLoaded(true);
    } catch (cause) {
      if (alive.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os dados privados.');
    } finally {
      controller.current = null;
      if (alive.current && !request.signal.aborted) {setLoading(false); onLoading(false);}
    }
  }
  function update(key: keyof PrivatePersonFields, value: string) {
    if (disabled || !loaded || loading) return;
    setValues(current => ({...current, [key]: value})); changes.current = {...changes.current, [key]: value}; onChange(changes.current);
  }
  return <details className="person-private" onToggle={event => {if (event.currentTarget.open) void load(); else setShowDocuments(false);}}>
    <summary>Documentos e contato (opcional)</summary>
    <p className="muted">RG, CPF e contato ficam restritos à gestão autorizada. Não aparecem no QR.</p>
    {loading && <p role="status">Carregando dados privados…</p>}
    {error && <div className="error" role="alert"><p>{error}</p><button type="button" className="text-button" disabled={disabled || loading} onClick={() => void load()}>Tentar novamente</button></div>}
    {loaded && <>
      <div className="two-col">
        <label className="field"><span>RG (opcional)</span><input type={showDocuments ? 'text' : 'password'} autoComplete="off" maxLength={30} value={values.private_rg} disabled={disabled} onChange={event => update('private_rg', event.target.value)}/></label>
        <label className="field"><span>CPF (opcional)</span><PersonMaskedInput mask="cpf" type={showDocuments ? 'text' : 'password'} autoComplete="off" inputMode="numeric" value={values.private_cpf} disabled={disabled} placeholder="000.000.000-00" onValueChange={value => update('private_cpf', value)}/></label>
      </div>
      <label className="confirm person-document-visibility"><input type="checkbox" checked={showDocuments} disabled={disabled} onChange={event => setShowDocuments(event.target.checked)}/><span>Mostrar documentos nesta edição</span></label>
      <label className="field"><span>Contato / telefone (opcional)</span><PersonMaskedInput mask="phoneBR" type="tel" inputMode="tel" autoComplete="off" value={values.private_contact} disabled={disabled} placeholder="(00)00000-0000" onValueChange={value => update('private_contact', value)}/></label>
    </>}
  </details>;
}
