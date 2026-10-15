'use client';
import {useEffect, useRef} from 'react';
import {Ellipsis, Pencil, RotateCcw, Trash2} from 'lucide-react';

type Action = 'update' | 'archive' | 'restore';
export default function PeopleCardMenu({name, archived, disabled, onAction}: {
  name: string; archived: boolean; disabled: boolean;
  onAction: (action: Action, trigger: HTMLElement) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {if (disabled && menu.current) menu.current.open = false;}, [disabled]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;};
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape' && menu.current?.open) {menu.current.open = false; menu.current.querySelector('summary')?.focus();}};
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);};
  }, []);
  function choose(action: Action) {
    const trigger = menu.current?.querySelector('summary');
    if (!trigger || disabled) return;
    menu.current!.open = false;
    onAction(action, trigger);
  }
  return <details ref={menu} name="people-card-actions" className="admin-menu people-card-menu"
    onBlur={event => {if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false;}}>
    <summary aria-label={'Opções de '+name} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} title="Opções do cadastro" onClick={event => {if (disabled) event.preventDefault();}}><Ellipsis size={20} aria-hidden="true"/></summary>
    <nav aria-label={'Ações de '+name}>
      <button type="button" disabled={disabled} onClick={() => choose('update')}><Pencil size={17} aria-hidden="true"/>Editar</button>
      {archived
        ? <button type="button" disabled={disabled} onClick={() => choose('restore')}><RotateCcw size={17} aria-hidden="true"/>Restaurar cadastro</button>
        : <button type="button" disabled={disabled} className="people-remove" onClick={() => choose('archive')}><Trash2 size={17} aria-hidden="true"/>Excluir da lista</button>}
    </nav>
  </details>;
}
