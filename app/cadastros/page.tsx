import {ArrowLeft, Building2, FolderOpen, UsersRound, House, Car} from 'lucide-react';
import {requireOperator} from '../../lib/app-access';
import {isRegionalRequest} from '../../lib/regional-access';
import './cadastros.css';

export const dynamic = 'force-dynamic';
export const metadata = {title: 'Cadastros'};

export default async function Page() {
  const op = await requireOperator('/cadastros');
  const regional = isRegionalRequest();
  const cards = [
    {title: 'Colaboradores', description: 'Nome, função, foto e dados privados do cadastro.', href: '/pessoas', icon: UsersRound, allowed: true},
    {title: 'Hóspedes', description: 'Cadastro separado, empresa, centro de custo, retratos e fotos privadas de documentos.', href: '/hospedes', icon: UsersRound, allowed: true},
    {title: 'Empresas', description: 'Clientes e unidades internas já usados nas áreas do painel.', href: '/entregas?tab=clients#empresas', icon: Building2, allowed: !regional},
    {title: 'Centros de custo', description: 'Obras e centros vinculados a cada empresa.', href: '/entregas?tab=clients#centros-de-custo', icon: FolderOpen, allowed: !regional},
    {title: 'Endereços', description: 'Imóveis, fachada, mobília e ficha já cadastrados.', href: '/imoveis', icon: House, allowed: true},
    {title: 'Prestadores de serviço', description: 'Empresas, contatos e responsáveis pelos laudos.', href: '/prestadores', icon: Building2, allowed: true},
    {title: 'Veículos', description: 'Placa, marca, modelo e ano dos veículos.', href: '/veiculos', icon: Car, allowed: true},
  ];
  return <>
    <header className="topbar"><a className="brand" href="/"><img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza Facilities"/><span>MOBILIZA GESTÃO<br/><strong>Cadastros</strong></span></a><span className="clean-header-label">{op.actor.fullName || op.actor.displayName}</span></header>
    <main className="shell cadastro-shell">
      <a className="nav-back" href="/"><ArrowLeft size={19}/>Voltar ao painel</a>
      <section className="page-title"><div><div className="eyebrow">MOBILIZA GESTÃO</div><h1>Cadastros</h1></div></section>
      <section className="module-grid cadastro-grid" aria-label="Opções de cadastro">
        {cards.map(card => <article className="module-card" key={card.title}><div className="module-icon"><card.icon size={27}/></div><h2>{card.title}</h2><p>{card.description}</p>{card.allowed ? <a className="button" href={card.href}>Abrir {card.title.toLocaleLowerCase('pt-BR')}</a> : <p className="cadastro-restricted">Cadastro administrado pela gestão com acesso geral.</p>}</article>)}
      </section>
    </main>
  </>;
}
