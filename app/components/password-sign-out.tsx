'use client';
import {useState} from 'react';

/** "Sair" for people signed in with e-mail and password. */
export default function PasswordSignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/password-session/logout', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      });
      if (!response.ok) throw new Error();
      window.location.replace('/');
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return <div>
    <button className="text-button" type="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Saindo…' : 'Sair'}</button>
    {error && <small role="alert">Não foi possível sair. Tente novamente.</small>}
  </div>;
}
