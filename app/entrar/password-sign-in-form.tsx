'use client';

import {useRef, useState, type FormEvent} from 'react';

const endpoint = '/api/password-session';
const minimumPasswordLength = 12;
type SessionReply = {ok?: boolean; return_to?: string; password_change_required?: boolean; error?: string};

export default function PasswordSignInForm({returnTo}: {returnTo: string}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const submitting = useRef(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const fields = new FormData(event.currentTarget);
    const email = fields.get('email');
    const password = fields.get('password');
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      setError('Informe o e-mail e a senha.');
      return;
    }
    let newPassword: string | undefined;
    if (passwordChangeRequired) {
      const candidate = fields.get('new_password');
      if (typeof candidate !== 'string' || candidate.length < minimumPasswordLength) {
        setError('Use pelo menos 12 caracteres na nova senha.');
        return;
      }
      if (candidate === password) {
        setError('Escolha uma nova senha diferente da senha inicial.');
        return;
      }
      if (candidate !== fields.get('confirm_password')) {
        setError('A confirmação deve ser igual à nova senha.');
        return;
      }
      newPassword = candidate;
    }

    submitting.current = true;
    setBusy(true);
    setError('');
    let navigating = false;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: email.trim(), password, return_to: returnTo, new_password: newPassword}),
      });
      const result = await response.json().catch(() => null) as SessionReply | null;
      if (!response.ok) {
        if (response.status === 409 && result?.password_change_required === true) {
          setPasswordChangeRequired(true);
          setError(typeof result.error === 'string' && result.error ? result.error : 'Crie uma nova senha para concluir o primeiro acesso.');
        } else if (response.status === 401 && passwordChangeRequired) {
          setPasswordChangeRequired(false);
          setError('Entre novamente com sua senha atual.');
        } else if (response.status === 401 || response.status === 403) {
          setError('E-mail ou senha inválidos.');
        } else if (response.status === 429) {
          setError('Muitas tentativas. Aguarde um pouco e tente novamente.');
        } else {
          setError('Não foi possível entrar. Tente novamente.');
        }
        return;
      }

      const target = result?.ok === true && typeof result.return_to === 'string' && result.return_to.startsWith('/')
        ? new URL(result.return_to, window.location.origin)
        : null;
      if (!target || target.origin !== window.location.origin) {
        setError('Não foi possível confirmar o acesso. Tente novamente.');
        return;
      }
      window.location.assign(target.href);
      navigating = true;
    } catch {
      setError('Não foi possível conectar. Tente novamente.');
    } finally {
      if (!navigating) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }

  return <form method="post" action={endpoint} onSubmit={signIn} aria-busy={busy}>
    <label className="field">
      <span>E-mail</span>
      <input type="email" name="email" autoComplete="username" autoCapitalize="none" required readOnly={passwordChangeRequired} disabled={busy}/>
    </label>
    <label className="field">
      <span>{passwordChangeRequired ? 'Senha inicial' : 'Senha'}</span>
      <input type="password" name="password" autoComplete="current-password" required readOnly={passwordChangeRequired} disabled={busy}/>
    </label>
    {passwordChangeRequired && <>
      <label className="field">
        <span>Nova senha</span>
        <input type="password" name="new_password" autoComplete="new-password" minLength={minimumPasswordLength} required disabled={busy} aria-describedby="new-password-hint"/>
      </label>
      <p id="new-password-hint" className="muted">Use pelo menos 12 caracteres e escolha uma senha diferente da inicial.</p>
      <label className="field">
        <span>Confirme a nova senha</span>
        <input type="password" name="confirm_password" autoComplete="new-password" minLength={minimumPasswordLength} required disabled={busy}/>
      </label>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="form-actions">
      {passwordChangeRequired && <button className="button secondary" type="button" disabled={busy} onClick={() => {setPasswordChangeRequired(false);setError('');}}>Voltar ao login</button>}
      <button className="button" type="submit" disabled={busy}>{passwordChangeRequired ? busy ? 'Alterando senha…' : 'Alterar senha e entrar' : busy ? 'Entrando…' : 'Entrar no painel'}</button>
    </div>
    <noscript><p className="muted">Ative o JavaScript para entrar no painel.</p></noscript>
  </form>;
}
