'use client';

import {useRef, useState, type FormEvent} from 'react';

type SessionReply = {ok?: boolean; return_to?: string; error?: string};

export default function TeamSignInForm({returnTo}: {returnTo: string}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const code = new FormData(event.currentTarget).get('code');
    if (typeof code !== 'string' || !code.trim()) {
      setError('Informe o código de acesso.');
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError('');
    let navigating = false;
    try {
      const response = await fetch('/api/team-session', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code, return_to: returnTo}),
      });
      const result = await response.json().catch(() => null) as SessionReply | null;
      if (!response.ok) {
        setError(typeof result?.error === 'string' ? result.error : 'Não foi possível entrar. Confira o código e tente novamente.');
        return;
      }
      if (result?.ok !== true || typeof result.return_to !== 'string' || !result.return_to.startsWith('/')) {
        setError('Não foi possível confirmar o acesso. Tente novamente.');
        return;
      }
      const target = new URL(result.return_to, window.location.origin);
      if (target.origin !== window.location.origin) {
        setError('Não foi possível confirmar o destino do painel. Tente novamente.');
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

  return <form method="post" onSubmit={signIn} aria-busy={busy}>
    <label className="field">
      <span>Código de acesso</span>
      <input type="password" name="code" autoComplete="off" required disabled={busy}/>
    </label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="form-actions">
      <button className="button" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar no painel'}</button>
    </div>
  </form>;
}
