'use client';
import {useEffect,useId,useRef,useState,type ComponentType} from 'react';
import {createPortal} from 'react-dom';
import {Archive,ArchiveRestore,LoaderCircle,X} from 'lucide-react';
import type {ArchiveAction,ArchiveEntity} from '../../lib/archive';
import type {ArchiveDialogProps} from './archive-dialog';

type Props={entity:ArchiveEntity;id:string;action?:ArchiveAction;label?:string;ariaLabel?:string;className?:string;iconOnly?:boolean;onSaved?:()=>void|Promise<void>};
const labels:Record<ArchiveEntity,string>={property:'imóvel',equipment:'equipamento',cleaning_location:'local de limpeza',client:'cliente',cost_center:'centro de custo'};

export default function ArchiveButton(props:Props){
 return <ArchiveTrigger key={props.entity+':'+props.id+':'+(props.action||'archive')} {...props}/>;
}
function ArchiveTrigger({entity,id,action='archive',label,ariaLabel,className='button secondary edit-action',iconOnly=true,onSaved}:Props){
 const [open,setOpen]=useState(false),[Dialog,setDialog]=useState<ComponentType<ArchiveDialogProps>|null>(null),[error,setError]=useState('');
 const generation=useRef(0),opening=useRef(false);
 useEffect(()=>{const requests=generation;return()=>{requests.current++;};},[]);
 async function show(){
  if(opening.current)return;
  opening.current=true;const current=++generation.current;setOpen(true);setError('');
  try{
   if(!Dialog){const component=(await import('./archive-dialog')).default;if(current===generation.current)setDialog(()=>component);}
  }catch{if(current===generation.current)setError('Não foi possível abrir a confirmação. Tente novamente.');}
  finally{if(current===generation.current)opening.current=false;}
 }
 function close(){generation.current++;opening.current=false;setOpen(false);setError('');}
 const text=label||(action==='restore'?'Restaurar':'Arquivar'),Icon=action==='restore'?ArchiveRestore:Archive;
 return <><button type="button" className={className+(iconOnly?' icon-edit':'')} aria-label={ariaLabel||text+' '+labels[entity]} title={ariaLabel||text+' '+labels[entity]} disabled={open} onClick={()=>void show()}><Icon size={16} aria-hidden="true"/>{!iconOnly&&text}</button>{open&&typeof document!=='undefined'&&createPortal(Dialog?<Dialog entity={entity} id={id} action={action} onClose={close} onSaved={onSaved}/>:<ArchiveLoading error={error} onClose={close} onRetry={()=>void show()}/>,document.body)}</>;
}

function ArchiveLoading({error,onClose,onRetry}:{error:string;onClose:()=>void;onRetry:()=>void}){
 const closeButton=useRef<HTMLButtonElement>(null),titleId=useId();
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';closeButton.current?.focus();return()=>{document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};},[]);
 return <div className="modal-backdrop no-print" onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
  if(event.key!=='Tab')return;
  const elements=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')),first=elements[0],last=elements.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }}><header><h2 id={titleId}>Confirmação do cadastro</h2><button ref={closeButton} type="button" className="close" aria-label="Fechar confirmação" onClick={onClose}><X size={22}/></button></header>{error?<p className="error" role="alert">{error}</p>:<p role="status"><LoaderCircle size={18} className="spin"/>Abrindo confirmação…</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button>{error&&<button type="button" className="button secondary" onClick={onRetry}>Tentar novamente</button>}</div></section></div>;
}
