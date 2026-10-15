'use client';
import {useEffect, useRef} from 'react';
import {Ellipsis} from 'lucide-react';
export type PeopleView = 'active' | 'archived' | 'trash';
export default function PeopleViewMenu({view, disabled,guests=false}: {view: PeopleView; disabled: boolean;guests?:boolean}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;};
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape' && menu.current?.open) {menu.current.open = false; menu.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown', closeOutside); document.addEventListener('keydown', escape);
    return () => {document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape);};
  }, []);
  if (disabled) return <button type="button" className="button secondary people-menu-disabled" disabled aria-label="Feche o formulário para abrir as opções de colaboradores"><Ellipsis size={21}/></button>;
  return <details ref={menu} className="admin-menu people-view-menu"><summary aria-label="Opções de colaboradores" title="Opções"><Ellipsis size={21}/></summary><nav aria-label="Listas de colaboradores" onClick={event => {if ((event.target as Element).closest('a') && menu.current) menu.current.open = false;}}>
    <a href={guests?'/hospedes':'/pessoas'} aria-current={view === 'active' ? 'page' : undefined}>{guests?'Hóspedes ativos':'Colaboradores ativos'}</a>
    <a href={guests?'/hospedes?view=archived':'/pessoas?view=archived'} aria-current={view === 'archived' ? 'page' : undefined}>Arquivados</a>
    <a href={guests?'/hospedes?view=trash':'/pessoas?view=trash'} aria-current={view === 'trash' ? 'page' : undefined}>Lixeira</a>
  </nav></details>;
}
