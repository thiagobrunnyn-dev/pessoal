import type {CSSProperties} from 'react';
import {ArrowRight, ArrowUp, LayoutDashboard, LogIn, ShoppingCart, Wrench} from 'lucide-react';
import {AssistantDemo, AssistantOpenButton, BriefForm, HomeMotion, HomeNav, PanelVideo, SolutionsBoard} from './public-home-interactive';
import styles from './public-home.module.css';

/**
 * The three service scenes of the hero. Each one is a still image brought to life with CSS
 * (slow camera drift plus small looping details). To use a real clip instead, put the file in
 * public/home/ and set `video` to its path: the clip then covers the scene and the image stays
 * as its poster. Illustrations are AI-generated; the note under the hero says so.
 */
const HERO_PANELS: {key: 'stay' | 'laundry' | 'maintenance'; label: string; image: string; alt: string; video: string | null}[] = [
  {key: 'stay', label: 'Hospedagem', image: '/home/hospedagem-795698b82f23.webp', alt: 'Ilustração de um quarto de hospedagem com duas camas arrumadas', video: null},
  {key: 'laundry', label: 'Lavanderia', image: '/home/lavanderia-832ecedc6a7d.webp', alt: 'Ilustração de uma lavanderia industrial com uniformes dobrados e etiquetas QR', video: null},
  {key: 'maintenance', label: 'Manutenção', image: '/home/manutencao-d2c28323b890.webp', alt: 'Ilustração de um técnico com tablet ao lado de um condensador de ar', video: null},
];

const PROCESS_STEPS = [
  {title: 'Alinhamento do serviço', detail: 'Necessidade, local, período e atividades previstas.'},
  {title: 'Apoio com o assistente Jarvis', detail: 'Demonstração de orientações para organizar as necessidades da operação.'},
  {title: 'Acesso por QR', detail: 'Atalho para formulários e orientações nos fluxos que utilizam QR Code.'},
];

const ASSISTANT_EXAMPLES = [
  {mark: '01', title: 'Hospedagem corporativa', detail: 'Quais informações reunir sobre equipe, local e período?'},
  {mark: '02', title: 'Lavanderia industrial', detail: 'Como descrever os tipos de peças, volumes e frequência?'},
  {mark: '03', title: 'Manutenção', detail: 'Como identificar o serviço, o ambiente e a necessidade?'},
  {mark: '+', title: 'Mais de uma solução', detail: 'Organize diferentes necessidades em um único resumo local.'},
];

/** Looping details drawn over each still scene; they are decoration and carry no information. */
function SceneLife({scene}: {scene: 'stay' | 'laundry' | 'maintenance'}) {
  if (scene === 'stay') return <><span className={styles.windowShimmer}/><span className={styles.lampGlow}/><span className={styles.sunSweep}/></>;
  if (scene === 'laundry') return <><span className={`${styles.drum} ${styles.drumA}`}/><span className={`${styles.drum} ${styles.drumB}`}/><span className={`${styles.drum} ${styles.drumC}`}/><span className={styles.scanFrame}><i/></span></>;
  return <><span className={styles.fan}/><span className={styles.tabletPulse}/></>;
}

export default function PublicHome({signInHref}: {signInHref: string}) {
  return (
    <div className={styles.home} id="inicio" data-home-root>
      {/* This page keeps its own light palette whatever look the panel uses: the attribute is
          reset before anything paints. */}
      <script dangerouslySetInnerHTML={{__html: "document.documentElement.dataset.theme='light'"}}/>
      <a className={styles.skipLink} href="#conteudo">Ir para o conteúdo</a>
      <HomeMotion/>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label="Mobíliza, início">
          <img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobíliza Facilities" width={150} height={66}/>
        </a>
        <HomeNav signInHref={signInHref}/>
      </header>

      <main id="conteudo" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span className={styles.dot}/> Mobíliza Facilities · Apoio à operação</p>
            <h1 id="home-title">Soluções integradas<br/>para apoiar<br/><em>sua operação.</em></h1>
            <p className={styles.intro}>Hospedagem corporativa, lavanderia industrial e manutenção para apoiar equipes e empresas.</p>
            <div className={styles.heroActions}>
              <a className={styles.btn} href="#solucoes">Conheça nossas soluções <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/></a>
              <a className={`${styles.btn} ${styles.btnGhost} ${styles.onDark}`} href={signInHref} target="_top"><LogIn size={17} aria-hidden="true"/> Entrar no painel</a>
            </div>
            <div className={styles.heroBottom}><span>Hospedagem</span><i/><span>Facilities</span><i/><span>Manutenção</span></div>
          </div>
          <div className={styles.heroArt}>
            {HERO_PANELS.map((panel, index) => (
              <figure key={panel.key} className={styles.panel} style={{'--panel-index': index} as CSSProperties}>
                <div className={`${styles.scene} ${styles[panel.key]}`}>
                  <img src={panel.image} alt={panel.alt} width={512} height={1024} decoding="async" fetchPriority={index === 0 ? 'high' : 'auto'}/>
                  {panel.video ? <PanelVideo src={panel.video} poster={panel.image}/> : <SceneLife scene={panel.key}/>}
                </div>
                <figcaption className={styles.panelLabel}>{panel.label}</figcaption>
              </figure>
            ))}
            <small className={styles.artNote}>Imagens geradas por IA; não são instalações reais. QR e tablet ilustrativos, sem sistemas conectados.</small>
          </div>
        </section>

        <div className={styles.serviceStrip}>
          <p>O apoio certo, em cada frente.</p>
          <span><small>01 /</small><strong>Hospedar</strong></span>
          <span><small>02 /</small><strong>Cuidar</strong></span>
          <span><small>03 /</small><strong>Manter</strong></span>
        </div>

        <section className={`${styles.section} ${styles.about}`} id="mobiliza" aria-labelledby="about-title">
          <p className={styles.eyebrow}>A Mobíliza</p>
          <div className={styles.aboutGrid} data-reveal>
            <h2 id="about-title">Sua equipe e sua estrutura.<br/><em>Apoio no dia a dia.</em></h2>
            <div>
              <p>A Mobíliza atua em hospedagem corporativa, lavanderia industrial e manutenção de espaços e equipamentos.</p>
              <p>Conheça nossos serviços e conte o que sua empresa precisa.</p>
              <a className={styles.textLink} href="#solucoes">Conheça nossas frentes de atuação <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/></a>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.solutions}`} id="solucoes" aria-labelledby="solutions-title">
          <div className={styles.sectionHeading} data-reveal>
            <div>
              <p className={styles.eyebrow}>Nossas soluções</p>
              <h2 id="solutions-title">Serviços que apoiam<br/>sua operação.</h2>
            </div>
            <p>Encontre o serviço que sua empresa procura.</p>
          </div>
          <SolutionsBoard/>
        </section>

        <section className={`${styles.section} ${styles.process}`} id="como" aria-labelledby="process-title">
          <div data-reveal>
            <p className={styles.eyebrow}>Como trabalhamos</p>
            <h2 id="process-title">Entender a necessidade.<br/><em>Definir o serviço.</em></h2>
            <p>Conversamos sobre a necessidade da empresa para alinhar atividades, local e período de atendimento.</p>
            <a className={styles.textLink} href="#contato">Conte sua necessidade <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/></a>
          </div>
          <div data-reveal>
            <ol className={styles.steps}>
              {PROCESS_STEPS.map((step, index) => (
                <li key={step.title}>
                  <span>0{index + 1}</span>
                  <div><h3>{step.title}</h3><p>{step.detail}</p></div>
                </li>
              ))}
            </ol>
            <p className={styles.scopeNote}>Recursos e canais são definidos no escopo. Esta página não conecta sistemas nem demonstra acompanhamento em tempo real.</p>
          </div>
        </section>

        <section className={`${styles.section} ${styles.aiSolutions}`} id="assistente" aria-labelledby="assistant-title">
          <div data-reveal>
            <p className={styles.eyebrow}>Soluções integradas · Assistente virtual</p>
            <h2 id="assistant-title">Encontre o serviço.<br/><em>Organize sua necessidade.</em></h2>
            <p>Veja como o assistente Jarvis pode apoiar a consulta às soluções da Mobíliza, da hospedagem corporativa à lavanderia e à manutenção.</p>
            <AssistantOpenButton/>
            <p className={styles.aiDisclosure}>Proposta de assistente IA. Esta demonstração usa respostas pré-definidas: não possui IA conectada, integração com sistemas, automação ou atendimento real.</p>
          </div>
          <div className={styles.aiExamples} data-reveal>
            <p className={styles.eyebrow}>O que você pode explorar</p>
            {ASSISTANT_EXAMPLES.map(example => (
              <article key={example.title}>
                <span>{example.mark}</span>
                <div><h3>{example.title}</h3><p>{example.detail}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.history}`} id="historia" aria-labelledby="history-title">
          <div className={styles.historyMarker} data-reveal>
            <span>O início da nossa trajetória</span>
            <div className={styles.historyLine}/>
            <b>2016</b>
            <p className={styles.foundationDate}>1º de março<br/>Canaã dos Carajás · PA</p>
          </div>
          <div data-reveal>
            <p className={styles.eyebrow}>Nossa história</p>
            <h2 id="history-title">Uma história iniciada<br/><em>em Canaã dos Carajás.</em></h2>
            <p>A Mobíliza foi fundada em 1º de março de 2016, em Canaã dos Carajás, no Pará.</p>
            <p>Hoje, atua em hospedagem corporativa, lavanderia industrial e serviços de manutenção, apoiando equipes e empresas em suas necessidades operacionais.</p>
          </div>
        </section>

        <section className={`${styles.section} ${styles.portal}`} id="solicitacoes" aria-labelledby="portal-title">
          <div className={styles.sectionHeading} data-reveal>
            <div>
              <p className={styles.eyebrow}>Portal da operação</p>
              <h2 id="portal-title">Já é atendido pela Mobíliza?<br/><em>Acesse por aqui.</em></h2>
            </div>
            <p>Abra uma solicitação sem login ou entre no painel da equipe.</p>
          </div>
          <div className={styles.portalGrid} data-reveal>
            <a className={styles.portalCard} href="/formularios/manutencao">
              <Wrench size={30} strokeWidth={1.4} aria-hidden="true"/>
              <h3>Solicitar manutenção</h3>
              <p>Informe o local e descreva o que precisa de atendimento.</p>
              <span>Abrir formulário <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/></span>
            </a>
            <a className={styles.portalCard} href="/formularios/compra">
              <ShoppingCart size={30} strokeWidth={1.4} aria-hidden="true"/>
              <h3>Pedir uma compra</h3>
              <p>Indique os itens, as quantidades e a obra que precisa da compra.</p>
              <span>Abrir formulário <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/></span>
            </a>
            <a className={`${styles.portalCard} ${styles.portalLogin}`} href={signInHref} target="_top">
              <LayoutDashboard size={30} strokeWidth={1.4} aria-hidden="true"/>
              <h3>Entrar no painel</h3>
              <p>Acesso da equipe a imóveis, ocupação, manutenção, limpeza e solicitações.</p>
              <span>Entrar <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/></span>
            </a>
          </div>
        </section>

        <section className={`${styles.section} ${styles.contact}`} id="contato" aria-labelledby="contact-title">
          <div data-reveal>
            <p className={styles.eyebrow}>Vamos conversar</p>
            <h2 id="contact-title">Vamos falar sobre<br/><em>sua operação?</em></h2>
            <p>Informe o serviço, o local e o período desejado.</p>
            <p className={styles.demoNote}>Canal comercial a confirmar.<br/>Por enquanto, nenhuma mensagem é enviada por esta página.</p>
          </div>
          <div data-reveal><BriefForm/></div>
        </section>
      </main>

      <footer className={styles.footer}>
        <img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobíliza Facilities" width={150} height={66} loading="lazy"/>
        <p>Apoio às equipes.<br/>Cuidado com a estrutura.</p>
        <div>
          <a href="#mobiliza">A Mobíliza</a>
          <a href="#solucoes">Soluções</a>
          <a href="#contato">Contato</a>
          <a href={signInHref} target="_top">Entrar no painel</a>
        </div>
        <small><span>Mobíliza Facilities · Canaã dos Carajás, PA</span><a href="#inicio">Voltar ao início <ArrowUp size={14} aria-hidden="true"/></a></small>
      </footer>

      <AssistantDemo/>
    </div>
  );
}
