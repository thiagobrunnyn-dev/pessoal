'use client';

import {useRef, useState, type FormEvent} from 'react';
import {Copy} from 'lucide-react';
import {MEMBER_ROLES as roles} from '../../lib/member-roles';

const endpoint = '/api/password-members';
type CreatedMember = {email: string; password: string};
type CreateReply = {ok?: boolean; email?: string; temporary_password?: string; error?: string};

export default function CreatePasswordMember({onCreated}: {onCreated: () => void}) {
  const [created, setCreated] = useState<CreatedMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const submitting = useRef(false);

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const fields = new FormData(event.currentTarget);
    const name = fields.get('name');
    const email = fields.get('email');
    const role = fields.get('role');
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim() ||
        typeof role !== 'string' || !Object.hasOwn(roles, role) || fields.get('confirmed') !== 'yes') {
      setError('Preencha os dados e confirme o perfil de acesso.');
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError('');
    setCopyStatus('');
    const fallback = 'Não foi possível confirmar o cadastro. Confira a lista antes de tentar novamente.';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: name.trim(), email: email.trim(), role}),
      });
      const result = await response.json().catch(() => null) as CreateReply | null;
      if (!response.ok) {
        setError(typeof result?.error === 'string' && result.error ? result.error : fallback);
        return;
      }
      if (result?.ok !== true || typeof result.email !== 'string' || !result.email ||
          typeof result.temporary_password !== 'string' || !result.temporary_password) {
        setError(fallback);
        return;
      }
      setCreated({email: result.email, password: result.temporary_password});
      setConfirmed(false);
      onCreated();
    } catch {
      setError(fallback);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password);
      setCopyStatus('Senha copiada.');
    } catch {
      setCopyStatus('Selecione a senha exibida para copiar manualmente.');
    }
  }

  return <section className="clean-inset" aria-labelledby="create-password-member-title">
    <h2 id="create-password-member-title">Cadastrar usuário</h2>
    {created ? <>
      <p className="visit-success" role="status">Conta criada para <strong>{created.email}</strong>.</p>
      {created.password ? <div className="visit-code no-print">
        <span>Senha inicial</span>
        <code style={{overflowWrap: 'anywhere'}}>{created.password}</code>
        <small>Repasse a senha diretamente à pessoa cadastrada. Ela é exibida apenas nesta confirmação e deverá ser trocada no primeiro acesso ao painel.</small>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={() => void copyPassword(created.password)}><Copy size={16} aria-hidden="true"/>Copiar senha</button>
          <button type="button" className="button secondary" onClick={() => setCreated({email: created.email, password: ''})}>Ocultar senha</button>
        </div>
        {copyStatus && <small role="status">{copyStatus}</small>}
      </div> : <div className="form-actions">
        <button type="button" className="button" onClick={() => setCreated(null)}>Cadastrar outra pessoa</button>
      </div>}
    </> : <form method="post" action={endpoint} onSubmit={createMember} aria-busy={busy}>
      <fieldset disabled={busy}>
        <label className="field">
          <span>Nome</span>
          <input name="name" maxLength={120} required onChange={() => setConfirmed(false)}/>
        </label>
        <label className="field">
          <span>E-mail</span>
          <input type="email" name="email" maxLength={254} autoCapitalize="none" required onChange={() => setConfirmed(false)}/>
        </label>
        <label className="field">
          <span>Função</span>
          <select name="role" defaultValue="" required onChange={() => setConfirmed(false)}>
            <option value="" disabled>Selecione a função</option>
            {Object.entries(roles).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
          </select>
        </label>
        <label className="confirm">
          <input type="checkbox" name="confirmed" value="yes" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required/>
          <span>Confirmei o perfil de acesso selecionado para esta pessoa.</span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="button" disabled={busy}>{busy ? 'Cadastrando…' : 'Criar usuário'}</button>
        </div>
      </fieldset>
    </form>}
  </section>;
}
