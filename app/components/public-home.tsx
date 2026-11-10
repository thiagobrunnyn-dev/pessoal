import {LogIn, ShoppingCart, Wrench} from 'lucide-react';

export default function PublicHome({teamHref}: {teamHref: string}) {
  return <>
    <header className="topbar">
      <div className="brand">
        <img src="/icons/symbol-192-v54.png" width={48} height={48} alt=""/>
        <span>MOBILIZA<br/><strong>Facilities</strong></span>
      </div>
    </header>
    <main className="tech-shell">
      <div className="page-title"><div>
        <h1>Mobiliza Facilities</h1>
        <p className="muted">Envie uma solicitação ou acesse a área da equipe.</p>
      </div></div>
      <section className="panel" aria-labelledby="solicitacoes-title">
        <h2 id="solicitacoes-title">Enviar uma solicitação</h2>
        <p className="muted">Os formulários podem ser preenchidos sem login.</p>
        <div className="form-actions">
          <a className="button" href="/formularios/manutencao"><Wrench size={18} aria-hidden="true"/>Solicitar manutenção</a>
          <a className="button" href="/formularios/compra"><ShoppingCart size={18} aria-hidden="true"/>Pedir uma compra</a>
        </div>
      </section>
      <section className="panel" aria-labelledby="equipe-title">
        <h2 id="equipe-title">Área da equipe</h2>
        <p className="muted">Acesse o painel de gestão com seu código pessoal.</p>
        <div className="form-actions">
          <a className="button secondary" href={teamHref}><LogIn size={18} aria-hidden="true"/>Entrar no painel</a>
        </div>
      </section>
    </main>
  </>;
}
