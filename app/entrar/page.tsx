import type {Metadata} from 'next';
import {env} from 'cloudflare:workers';
import {redirect} from 'next/navigation';
import {chatGPTSignInPath, safeRelativeReturnPath} from '../chatgpt-auth';
import PasswordSignInForm from './password-sign-in-form';

export const metadata: Metadata = {title: 'Entrar no painel'};
export const dynamic = 'force-dynamic';

export default async function Page({searchParams}: {searchParams: Promise<{return_to?: string | string[]}>}) {
  const {return_to: returnTo} = await searchParams;
  const destination = safeRelativeReturnPath(typeof returnTo === 'string' ? returnTo : '/');
  if (env.MOBILIZA_SUPABASE_AUTH !== '1') redirect(chatGPTSignInPath(destination));

  return <>
    <header className="topbar">
      <a className="brand" href="/" aria-label="Mobiliza Facilities, página inicial">
        <img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza Facilities" width={120} height={66}/>
      </a>
    </header>
    <main className="tech-shell">
      <a className="nav-back" href="/">Voltar à página inicial</a>
      <section className="panel" aria-labelledby="access-title">
        <div className="page-title"><div>
          <h1 id="access-title">Entrar no painel</h1>
          <p>Use o e-mail e a senha da sua conta Mobiliza.</p>
        </div></div>
        <PasswordSignInForm returnTo={destination}/>
      </section>
    </main>
  </>;
}
