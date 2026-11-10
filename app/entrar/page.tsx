import type {Metadata} from 'next';
import {env} from 'cloudflare:workers';
import {LogIn, ShoppingCart, Wrench} from 'lucide-react';
import {chatGPTSignInPath, safeRelativeReturnPath} from '../chatgpt-auth';
import TeamSignInForm from './team-sign-in-form';

export const metadata: Metadata = {title: 'Acesso e solicitações'};
export const dynamic = 'force-dynamic';

export default async function Page({searchParams}: {searchParams: Promise<{return_to?: string | string[]}>}) {
  const {return_to: returnTo} = await searchParams;
  const destination = safeRelativeReturnPath(typeof returnTo === 'string' ? returnTo : '/');
  const standalone = env.MOBILIZA_AUTH_MODE === 'cloudflare-access';
  const configuredUrl = env.MOBILIZA_ADMIN_URL;
  const adminUrl = standalone && configuredUrl && URL.canParse(configuredUrl) ? new URL(configuredUrl) : null;
  const signIn = standalone
    ? adminUrl?.protocol === 'https:' && !adminUrl.username && !adminUrl.password ? adminUrl.origin + '/' : null
    : chatGPTSignInPath(destination);

  return <>
    <header className="topbar">
      <div className="brand">
        <img src="/icons/symbol-192-v54.png" width={48} height={48} alt=""/>
        <span>MOBILIZA<br/><strong>Facilities</strong></span>
      </div>
    </header>
    <main className="tech-shell">
      <div className="page-title">
        <div>
          <h1>Acesso e solicitações</h1>
        </div>
      </div>
      <section className="panel" aria-labelledby="equipe-title">
        <h2 id="equipe-title">Acesso da equipe</h2>
        <p className="muted">Entre com o código pessoal fornecido pela administração da Mobiliza.</p>
        <TeamSignInForm returnTo={destination}/>
        {signIn && <a className="text-button" href={signIn} target="_top"><LogIn size={16} aria-hidden="true"/>{standalone ? 'Acesso administrativo' : 'Acesso administrativo com ChatGPT'}</a>}
      </section>
      <section className="panel" aria-labelledby="solicitacoes-title">
        <h2 id="solicitacoes-title">Enviar uma solicitação</h2>
        <p className="muted">Os formulários podem ser preenchidos sem login.</p>
        <div className="form-actions">
          <a className="button" href="/formularios/manutencao"><Wrench size={18} aria-hidden="true"/>Solicitar manutenção</a>
          <a className="button" href="/formularios/compra"><ShoppingCart size={18} aria-hidden="true"/>Pedir uma compra</a>
        </div>
      </section>
    </main>
  </>;
}
