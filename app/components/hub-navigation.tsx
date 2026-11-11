'use client';
import {createContext,useContext,useEffect,useRef,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {Home,House,Wrench,FolderOpen,Shirt,Menu,ChevronDown} from 'lucide-react';

/** Menu entry that stands for each screen: detail screens light up the entry of their list. */
const MENU_ALIAS:Record<string,string>={'/equipamentos':'/centrais','/pessoas':'/cadastros','/hospedes':'/cadastros','/prestadores':'/cadastros','/veiculos':'/cadastros','/arquivados':'/cadastros'};
export function menuTarget(pathname:string){if(!pathname||pathname==='/')return '/';const first='/'+pathname.split('/')[1];return MENU_ALIAS[first]||first;}
const PROPERTY_PAGES=['/imoveis','/ocupacao','/mobilizacoes','/entregas','/gestao-a-vista'],SERVICE_PAGES=['/hoje','/centrais','/ordens','/limpeza','/servicos-laudos','/solicitacoes','/whatsapp'];
const CurrentTarget=createContext('/');
/** Link to a screen of the panel; it marks itself when that screen is the one open. */
function NavLink({href,className,children}:{href:string;className?:string;children:ReactNode}){const active=useContext(CurrentTarget)===href;return <a href={href} className={[className,active&&'hub-nav-current'].filter(Boolean).join(' ')||undefined} aria-current={active?'page':undefined}>{children}</a>;}
function Links(){const current=useContext(CurrentTarget);return <nav aria-label="Áreas do painel" className="hub-navigation-links">
 <NavLink href="/"><Home size={19}/>Visão geral</NavLink>
 <details open={PROPERTY_PAGES.includes(current)}><summary><House size={19}/><span>Imóveis</span><ChevronDown size={16}/></summary><div><a href="/imoveis?new=property">Cadastrar imóvel e endereço</a><a href="/ocupacao?intent=guest">Cadastrar hóspede</a><a href="/mobilizacoes?new=1">Nova mobilização</a><NavLink href="/entregas">Entrega e devolução</NavLink><NavLink href="/gestao-a-vista">Gestão à Vista · PDFs do mural</NavLink><NavLink className="hub-nav-secondary" href="/imoveis">Consultar fichas e endereços</NavLink><NavLink className="hub-nav-secondary" href="/ocupacao">Consultar quartos e hóspedes</NavLink><NavLink className="hub-nav-secondary" href="/mobilizacoes">Consultar mobilizações</NavLink></div></details>
 <details open={SERVICE_PAGES.includes(current)}><summary><Wrench size={19}/><span>Serviços</span><ChevronDown size={16}/></summary><div><NavLink href="/hoje">Tarefas de hoje</NavLink><NavLink href="/centrais">Centrais de ar</NavLink><NavLink href="/ordens">Manutenção geral</NavLink><NavLink href="/limpeza">Limpeza de imóveis</NavLink><NavLink href="/servicos-laudos">Serviços e laudos</NavLink><NavLink href="/solicitacoes">Solicitações</NavLink><NavLink href="/whatsapp">Central do WhatsApp</NavLink></div></details>
 <NavLink href="/cadastros"><FolderOpen size={19}/>Cadastros</NavLink>
 <a href="https://lavanderia.example.invalid" target="_blank" rel="noopener noreferrer"><Shirt size={19}/><span>Lavanderia<small>Abre o controle existente</small></span></a>
 </nav>;}
export default function HubNavigation({displayName,accessTitle,regional}:{displayName:string;accessTitle:string;regional:boolean}){
 const mobile=useRef<HTMLDetailsElement>(null),current=menuTarget(usePathname()||'/');
 useEffect(()=>{const close=()=>{if(mobile.current)mobile.current.open=false;};const outside=(e:PointerEvent)=>{if(mobile.current&&!mobile.current.contains(e.target as Node))close();};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&mobile.current?.open){close();mobile.current.querySelector('summary')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('pageshow',close);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('pageshow',close);};},[]);
 return <CurrentTarget.Provider value={current}><aside className="hub-sidebar no-print"><a className="hub-side-brand" href="/" aria-label="MOBILIZA GESTÃO, visão geral"><img src="/icons/symbol-192-v54.png" width={44} height={44} alt="Símbolo Mobiliza"/><strong>MOBILIZA GESTÃO</strong></a><div className="hub-side-user"><strong>{displayName}</strong><small>{accessTitle}</small>{regional&&<small>Pará · todas as obras</small>}</div><Links/></aside>
 <details ref={mobile} className="hub-mobile-navigation no-print"><summary><Menu size={21}/><span>Menu</span></summary><div className="hub-mobile-menu" onClick={event=>{if((event.target as Element).closest('a')&&mobile.current)mobile.current.open=false;}}><div className="hub-mobile-user"><strong>{displayName}</strong><small>{accessTitle}{regional?' · Pará':''}</small></div><Links/></div></details></CurrentTarget.Provider>;
}
