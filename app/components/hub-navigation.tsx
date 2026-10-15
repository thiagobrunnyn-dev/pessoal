'use client';
import {useEffect,useRef} from 'react';
import {Home,House,Wrench,FolderOpen,Shirt,Menu,ChevronDown} from 'lucide-react';
function Links(){return <nav aria-label="Áreas do painel" className="hub-navigation-links">
 <a className="hub-nav-current" href="/" aria-current="page"><Home size={19}/>Visão geral</a>
 <details><summary><House size={19}/><span>Imóveis</span><ChevronDown size={16}/></summary><div><a href="/imoveis?new=property">Cadastrar imóvel e endereço</a><a href="/ocupacao?intent=guest">Cadastrar hóspede</a><a href="/mobilizacoes?new=1">Nova mobilização</a><a href="/entregas">Entrega e devolução</a><a href="/gestao-a-vista">Gestão à Vista · PDFs do mural</a><a className="hub-nav-secondary" href="/imoveis">Consultar fichas e endereços</a><a className="hub-nav-secondary" href="/ocupacao">Consultar quartos e hóspedes</a><a className="hub-nav-secondary" href="/mobilizacoes">Consultar mobilizações</a></div></details>
 <details><summary><Wrench size={19}/><span>Serviços</span><ChevronDown size={16}/></summary><div><a href="/hoje">Tarefas de hoje</a><a href="/centrais">Centrais de ar</a><a href="/ordens">Manutenção geral</a><a href="/limpeza">Limpeza de imóveis</a><a href="/servicos-laudos">Serviços e laudos</a><a href="/solicitacoes">Solicitações</a></div></details>
 <a href="/cadastros"><FolderOpen size={19}/>Cadastros</a>
 <a href="https://lavanderia.example.invalid" target="_blank" rel="noopener noreferrer"><Shirt size={19}/><span>Lavanderia<small>Abre o controle existente</small></span></a>
 </nav>;}
export default function HubNavigation({displayName,accessTitle,regional}:{displayName:string;accessTitle:string;regional:boolean}){
 const mobile=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=()=>{if(mobile.current)mobile.current.open=false;};const outside=(e:PointerEvent)=>{if(mobile.current&&!mobile.current.contains(e.target as Node))close();};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&mobile.current?.open){close();mobile.current.querySelector('summary')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('pageshow',close);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('pageshow',close);};},[]);
 return <><aside className="hub-sidebar no-print"><a className="hub-side-brand" href="/" aria-label="MOBILIZA GESTÃO, visão geral"><img src="/icons/symbol-192-v54.png" width={44} height={44} alt="Símbolo Mobiliza"/><strong>MOBILIZA GESTÃO</strong></a><div className="hub-side-user"><strong>{displayName}</strong><small>{accessTitle}</small>{regional&&<small>Pará · todas as obras</small>}</div><Links/></aside>
 <details ref={mobile} className="hub-mobile-navigation no-print"><summary><Menu size={21}/><span>Menu</span></summary><div className="hub-mobile-menu" onClick={event=>{if((event.target as Element).closest('a')&&mobile.current)mobile.current.open=false;}}><div className="hub-mobile-user"><strong>{displayName}</strong><small>{accessTitle}{regional?' · Pará':''}</small></div><Links/></div></details></>;
}
