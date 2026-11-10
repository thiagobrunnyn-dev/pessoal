import {ArrowDown, ArrowRight, ArrowUp, Building2, ClipboardList, LayoutDashboard, LogIn, ShoppingCart, Wrench} from 'lucide-react';
import styles from './public-home.module.css';

const workflow = [
  {title: 'Registrar', detail: 'Envie um pedido de manutenção ou de compra.', icon: ClipboardList},
  {title: 'Organizar', detail: 'A equipe reúne as demandas no painel.', icon: Building2},
  {title: 'Acompanhar', detail: 'Consulte os serviços e o histórico da operação.', icon: LayoutDashboard},
];

const requests = [
  {
    id: 'manutencao',
    title: 'Solicitar manutenção',
    detail: 'Informe o local e descreva o que precisa de atendimento.',
    href: '/formularios/manutencao',
    icon: Wrench,
  },
  {
    id: 'compra',
    title: 'Pedir uma compra',
    detail: 'Indique os itens, as quantidades e a obra que precisa da compra.',
    href: '/formularios/compra',
    icon: ShoppingCart,
  },
];

const areas = [
  {title: 'Imóveis e ocupação', detail: 'Consulte os imóveis, seus espaços e a situação de ocupação.', icon: Building2},
  {title: 'Manutenção e serviços', detail: 'Acompanhe equipamentos, ordens de serviço, limpeza e o histórico dos atendimentos.', icon: Wrench},
  {title: 'Solicitações e equipe', detail: 'Organize os pedidos recebidos e distribua as responsabilidades conforme o perfil de cada pessoa.', icon: ClipboardList},
];

export default function PublicHome({signInHref}: {signInHref: string}) {
  return (
    <div className={styles.home} id="inicio">
      <a className={styles.skipLink} href="#conteudo">Ir para o conteúdo</a>
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.headerInner}`}>
          <a className={styles.brand} href="#inicio">
            <img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza Facilities" width={132} height={58}/>
          </a>
          <nav className={styles.headerNav} aria-label="Navegação principal">
            <a className={styles.sectionLink} href="#sobre">O sistema</a>
            <a className={styles.sectionLink} href="#solicitacoes">Solicitações</a>
            <a className={styles.headerLogin} href={signInHref} target="_top">
              <LogIn size={17} aria-hidden="true"/> Entrar no painel
            </a>
          </nav>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={`${styles.wrap} ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <p className={styles.heroKicker}>Portal de operações</p>
              <h1 id="home-title">Gestão de facilities <span>em um só lugar.</span></h1>
              <p className={styles.lead}>
                O Mobiliza Facilities reúne imóveis, ocupação, manutenção, limpeza e compras.
                Envie uma solicitação ou entre no painel para acompanhar a operação da equipe.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.primary} href={signInHref} target="_top">
                  Entrar no painel <ArrowRight size={19} aria-hidden="true"/>
                </a>
                <a className={styles.secondary} href="#solicitacoes">
                  Abrir uma solicitação <ArrowDown size={17} aria-hidden="true"/>
                </a>
              </div>
            </div>

            <aside className={styles.workflow} aria-labelledby="workflow-title">
              <div className={styles.workflowHeader}>
                <span className={styles.workflowBadge}>Mobiliza Gestão</span>
                <h2 id="workflow-title">Como funciona</h2>
              </div>
              <ol className={styles.steps}>
                {workflow.map(({title, detail, icon: Icon}, index) => (
                  <li key={title} className={styles.step}>
                    <span className={styles.stepIcon}><Icon size={21} aria-hidden="true"/></span>
                    <div><h3>{title}</h3><p>{detail}</p></div>
                    <span className={styles.stepNumber} aria-hidden="true">0{index + 1}</span>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>

        <section id="solicitacoes" className={styles.requests} aria-labelledby="request-title">
          <div className={styles.wrap}>
            <div className={styles.requestIntro}>
              <div>
                <p className={styles.kicker}>Solicitações</p>
                <h2 id="request-title">Como podemos ajudar?</h2>
                <p>Escolha o assunto para abrir o formulário certo.</p>
              </div>
              <span className={styles.publicTag}>Formulários sem login</span>
            </div>
            <div className={styles.requestGrid}>
              {requests.map(({id, title, detail, href, icon: Icon}) => (
                <a key={id} href={href} className={styles.requestCard} aria-labelledby={`request-${id}`} aria-describedby={`details-${id}`}>
                  <span className={styles.requestIcon}><Icon size={24} aria-hidden="true"/></span>
                  <div className={styles.requestCopy}>
                    <h3 id={`request-${id}`}>{title}</h3>
                    <p id={`details-${id}`}>{detail}</p>
                    <span>Abrir formulário <ArrowRight size={17} aria-hidden="true"/></span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="sobre" className={styles.about} aria-labelledby="about-title">
          <div className={styles.wrap}>
            <p className={styles.kicker}>Sobre o sistema</p>
            <h2 id="about-title">O que a equipe acompanha</h2>
            <p>O painel reúne as informações que a equipe usa para planejar e acompanhar o trabalho.</p>
            <ul className={styles.areaGrid}>
              {areas.map(({title, detail, icon: Icon}) => (
                <li key={title}>
                  <Icon size={24} aria-hidden="true"/>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerInner}`}>
          <p><strong>Mobiliza Facilities</strong><span>Portal de operações</span></p>
          <a href="#inicio">Voltar ao início <ArrowUp size={16} aria-hidden="true"/></a>
        </div>
      </footer>
    </div>
  );
}
