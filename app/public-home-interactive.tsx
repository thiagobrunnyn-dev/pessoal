'use client';
// Interactive pieces of the public home. Everything here works on the visitor's device only:
// no form, summary or assistant answer is sent anywhere.
import {useEffect, useRef, useState, type CSSProperties, type FormEvent} from 'react';
import {AirVent, ArrowRight, BedDouble, Building2, Cog, LogIn, Menu, Sparkles, Trees, WashingMachine, X, Zap, type LucideIcon} from 'lucide-react';
import styles from './public-home.module.css';

const INTEREST_EVENT = 'mobiliza:interesse';
const ASSISTANT_EVENT = 'mobiliza:assistente';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const NAV_LINKS = [
  {href: '#mobiliza', label: 'A Mobíliza'},
  {href: '#solucoes', label: 'Soluções'},
  {href: '#como', label: 'Como trabalhamos'},
  {href: '#historia', label: 'Nossa história'},
  {href: '#solicitacoes', label: 'Solicitações'},
];

/** Header navigation, the two header actions and the small-screen menu button. */
export function HomeNav({signInHref}: {signInHref: string}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <nav id="home-nav" className={open ? `${styles.nav} ${styles.navOpen}` : styles.nav} aria-label="Navegação principal">
        {NAV_LINKS.map(link => <a key={link.href} href={link.href} onClick={close}>{link.label}</a>)}
        <a className={styles.navExtra} href="#contato" onClick={close}>Fale com a Mobíliza</a>
      </nav>
      <a className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost} ${styles.headerLogin}`} href={signInHref} target="_top">
        <LogIn size={16} aria-hidden="true"/> Entrar no painel
      </a>
      <a className={`${styles.btn} ${styles.btnSmall} ${styles.headerCta}`} href="#contato">
        Fale com a Mobíliza <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/>
      </a>
      <button type="button" className={styles.menuButton} aria-controls="home-nav" aria-expanded={open} aria-label={open ? 'Fechar menu' : 'Abrir menu'} onClick={() => setOpen(value => !value)}>
        {open ? <X size={22} aria-hidden="true"/> : <Menu size={22} aria-hidden="true"/>}
      </button>
    </>
  );
}

/**
 * Reveals sections as they enter the screen. Content stays visible when JavaScript is off,
 * when the visitor asks for reduced motion, or when the observer never reports.
 */
export function HomeMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-home-root]');
    if (!root || !('IntersectionObserver' in window) || reducedMotion()) return;
    const targets = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
    const show = (element: HTMLElement) => {
      element.dataset.shown = 'true';
    };
    let reported = false;
    const observer = new IntersectionObserver(entries => {
      reported = true;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        show(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      }
    }, {rootMargin: '0px 0px -8% 0px', threshold: 0.08});
    root.dataset.motion = 'ready';
    targets.forEach(target => observer.observe(target));
    const safety = window.setTimeout(() => {
      if (!reported) targets.forEach(show);
    }, 3000);
    return () => {
      window.clearTimeout(safety);
      observer.disconnect();
      delete root.dataset.motion;
      targets.forEach(target => {
        delete target.dataset.shown;
      });
    };
  }, []);
  return null;
}

/** Optional looping clip over a hero panel. It plays muted, only on screen and never with reduced motion. */
export function PanelVideo({src, poster}: {src: string; poster: string}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element || !('IntersectionObserver' in window) || reducedMotion()) return;
    element.muted = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void element.play().catch(() => {/* The still image stays in place. */});
      else element.pause();
    }, {threshold: 0.2});
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <video ref={video} className={styles.panelVideo} src={src} poster={poster} muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1}/>;
}

type Category = 'pessoas' | 'espacos';
const SOLUTIONS: {number: string; name: string; lines: [string, string]; detail: string; category: Category; icon: LucideIcon; featured?: boolean}[] = [
  {number: '01', name: 'Hospedagem corporativa', lines: ['Hospedagem', 'corporativa'], detail: 'Hospedagem para profissionais e equipes a trabalho.', category: 'pessoas', icon: BedDouble, featured: true},
  {number: '02', name: 'Lavanderia industrial', lines: ['Lavanderia', 'industrial'], detail: 'Lavagem de itens têxteis utilizados na operação.', category: 'pessoas', icon: WashingMachine},
  {number: '03', name: 'Manutenção predial', lines: ['Manutenção', 'predial'], detail: 'Cuidados com a manutenção de prédios e instalações.', category: 'espacos', icon: Building2},
  {number: '04', name: 'Áreas verdes', lines: ['Áreas', 'verdes'], detail: 'Conservação de jardins e áreas verdes.', category: 'espacos', icon: Trees},
  {number: '05', name: 'Climatização e refrigeração', lines: ['Climatização', 'e refrigeração'], detail: 'Manutenção de sistemas de climatização e refrigeração.', category: 'espacos', icon: AirVent},
  {number: '06', name: 'Serviços elétricos', lines: ['Serviços', 'elétricos'], detail: 'Serviços de manutenção elétrica em instalações.', category: 'espacos', icon: Zap},
  {number: '07', name: 'Manutenção de equipamentos', lines: ['Manutenção', 'de equipamentos'], detail: 'Manutenção de equipamentos utilizados na operação.', category: 'espacos', icon: Cog},
];
const SERVICE_OPTIONS = [...SOLUTIONS.map(solution => solution.name), 'Mais de uma solução'];
const FILTERS: {key: 'all' | Category; label: string}[] = [
  {key: 'all', label: 'Todas as soluções'},
  {key: 'pessoas', label: 'Apoio às equipes'},
  {key: 'espacos', label: 'Espaços e infraestrutura'},
];

/** Service cards with the two group filters. "Tenho interesse" pre-selects the service in the contact form. */
export function SolutionsBoard() {
  const [filter, setFilter] = useState<'all' | Category>('all');
  return (
    <>
      <div className={styles.filters} role="group" aria-label="Filtrar soluções">
        {FILTERS.map(option => (
          <button key={option.key} type="button" className={filter === option.key ? styles.filterActive : undefined} aria-pressed={filter === option.key} onClick={() => setFilter(option.key)}>
            {option.label}
          </button>
        ))}
      </div>
      <div className={styles.cards} data-reveal>
        {SOLUTIONS.map((solution, index) => (
          <article key={solution.number} className={solution.featured ? `${styles.serviceCard} ${styles.featured}` : styles.serviceCard} hidden={filter !== 'all' && solution.category !== filter} style={{'--card-index': index} as CSSProperties}>
            <span className={styles.number}>{solution.number}</span>
            <div className={styles.lineIcon}><solution.icon size={36} strokeWidth={1.4} aria-hidden="true"/></div>
            <h3>{solution.lines[0]}<br/>{solution.lines[1]}</h3>
            <p>{solution.detail}</p>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(INTEREST_EVENT, {detail: solution.name}))}>
              Tenho interesse <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/>
            </button>
          </article>
        ))}
        <div className={`${styles.serviceCard} ${styles.question}`} style={{'--card-index': SOLUTIONS.length} as CSSProperties}>
          <p>Precisa de mais<br/>de um serviço?</p>
          <h3>Conte o que<br/>você precisa.</h3>
          <a href="#contato" className={styles.textLink}>Descreva sua necessidade <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/></a>
        </div>
      </div>
    </>
  );
}

/** Contact brief. It only writes a summary on the page; nothing is sent. */
export function BriefForm() {
  const [service, setService] = useState('');
  const [need, setNeed] = useState('');
  const [summary, setSummary] = useState('');
  const needField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const onInterest = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      if (SERVICE_OPTIONS.includes(name)) setService(name);
      document.getElementById('contato')?.scrollIntoView({behavior: reducedMotion() ? 'auto' : 'smooth'});
      needField.current?.focus({preventScroll: true});
    };
    window.addEventListener(INTEREST_EVENT, onInterest);
    return () => window.removeEventListener(INTEREST_EVENT, onInterest);
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSummary(`Resumo preparado para revisão\n\nSolução: ${service}\nNecessidade: ${need.trim()}\n\nNenhuma solicitação foi enviada. O canal comercial será conectado após validação.`);
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="home-service">Qual solução você procura?</label>
      <select id="home-service" required value={service} onChange={event => setService(event.target.value)}>
        <option value="">Selecione uma solução</option>
        {SERVICE_OPTIONS.map(option => <option key={option}>{option}</option>)}
      </select>
      <label htmlFor="home-need">Conte um pouco sobre sua necessidade</label>
      <textarea ref={needField} id="home-need" rows={4} maxLength={1200} placeholder="Ex.: tipo de serviço, cidade e prazo desejado" required value={need} onChange={event => setNeed(event.target.value)}/>
      <button className={styles.btn} type="submit">Preparar resumo <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/></button>
      <output className={styles.summary} aria-live="polite">{summary}</output>
    </form>
  );
}

const ASSISTANT_REPLIES = {
  hospedagem: 'A hospedagem corporativa atende profissionais e equipes a trabalho. Para preparar sua demanda, informe a cidade, a quantidade aproximada de pessoas e o período desejado.',
  lavanderia: 'A lavanderia industrial atende às necessidades têxteis da operação. Para preparar sua demanda, descreva os tipos de peças, o volume estimado e a frequência necessária.',
  manutencao: 'As frentes incluem manutenção predial, áreas verdes, climatização e refrigeração, serviços elétricos e manutenção de equipamentos. Conte qual estrutura precisa de atenção e em que local.',
  integradas: 'Você pode reunir hospedagem corporativa, lavanderia industrial e manutenção em uma mesma descrição. Para cada frente, informe o serviço desejado, local, período e detalhes relevantes. No formulário, escolha Mais de uma solução. O resumo fica apenas nesta página: nada é enviado ou executado.',
};
const ASSISTANT_OPTIONS: {key: keyof typeof ASSISTANT_REPLIES; label: string}[] = [
  {key: 'hospedagem', label: 'Hospedagem corporativa'},
  {key: 'lavanderia', label: 'Lavanderia industrial'},
  {key: 'manutencao', label: 'Manutenção e facilities'},
  {key: 'integradas', label: 'Soluções integradas'},
];

/** Opens the assistant demonstration from anywhere on the page. */
export function AssistantOpenButton() {
  return (
    <button type="button" className={styles.btn} onClick={() => window.dispatchEvent(new Event(ASSISTANT_EVENT))}>
      Experimente a demonstração <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/>
    </button>
  );
}

/** Assistant demonstration: fixed answers, no AI and no data leaving the page. */
export function AssistantDemo() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reply, setReply] = useState('');
  const close = () => dialog.current?.close();
  useEffect(() => {
    const open = () => {
      const element = dialog.current;
      if (element && !element.open) element.showModal();
    };
    window.addEventListener(ASSISTANT_EVENT, open);
    return () => window.removeEventListener(ASSISTANT_EVENT, open);
  }, []);
  return (
    <>
      <button type="button" className={styles.assistantTrigger} aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(ASSISTANT_EVENT))}>
        <Sparkles size={15} aria-hidden="true"/> <span>Assistente virtual</span> <b>24h*</b>
      </button>
      <dialog ref={dialog} className={styles.assistant} aria-label="Jarvis, assistente Mobíliza (demonstração)" onClick={event => {
        if (event.target === dialog.current) close();
      }}>
        <div className={styles.dialogTop}>
          <div>
            <p><Sparkles size={15} aria-hidden="true"/> Jarvis · Assistente Mobíliza</p>
            <small>Demonstração de apoio às soluções integradas</small>
          </div>
          <button type="button" aria-label="Fechar assistente" onClick={close}><X size={20} aria-hidden="true"/></button>
        </div>
        <div className={styles.dialogBody}>
          <p>Olá! Explore as soluções da Mobíliza e veja quais informações ajudam a descrever sua necessidade.</p>
          <div className={styles.assistantOptions}>
            {ASSISTANT_OPTIONS.map(option => <button key={option.key} type="button" aria-pressed={reply === ASSISTANT_REPLIES[option.key]} onClick={() => setReply(ASSISTANT_REPLIES[option.key])}>{option.label}</button>)}
          </div>
          <p className={styles.chatResponse} aria-live="polite">{reply}</p>
          <a href="#contato" className={styles.chatContact} onClick={close}>Preparar minha demanda <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true"/></a>
          <small>*Demonstração com respostas pré-definidas. Sem IA conectada, sistemas integrados, atendimento real ou envio de dados. A proposta de disponibilidade 24h depende de implementação.</small>
        </div>
      </dialog>
    </>
  );
}
