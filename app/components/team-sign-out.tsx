'use client';

import {useState} from 'react';

export default function TeamSignOut({label = 'Sair'}: {label?: string}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/team-session/logout', {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
      });
      if (!response.ok) throw new Error();
      window.location.assign('/entrar');
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return <div>
    <button className="text-button" type="button" disabled={busy} onClick={() => void signOut()}>
      {busy ? 'Saindo…' : label}
    </button>
    {error && <small role="alert">Não foi possível sair. Tente novamente.</small>}
  </div>;
}
