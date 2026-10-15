'use client';
import {useCallback,useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {History,LoaderCircle,X} from 'lucide-react';
import type {ArchiveAction,ArchiveEntity,ArchiveView} from '../../lib/archive';

export type ArchiveDialogProps={entity:ArchiveEntity;id:string;action:ArchiveAction;onClose:()=>void;onSaved?:()=>void|Promise<void>};
const labels:Record<ArchiveEntity,string>={property:'imóvel',equipment:'equipamento',cleaning_location:'local de limpeza',client:'cliente',cost_center:'centro de custo'};
const stamp=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Belem'});
function message(error:unknown){return error instanceof Error?error.message:'Não foi possível confirmar a ação.';}

export default function ArchiveDialog({entity,id,action,onClose,onSaved}:ArchiveDialogProps){
 const [data,setData]=useState<ArchiveView|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const alive=useRef(false),busyRef=useRef(false),generation=useRef(0),controller=useRef<AbortController|null>(null),requestId=useRef(''),closeButton=useRef<HTMLButtonElement>(null),titleId=useId(),descriptionId=useId();
 const restoring=action==='restore',verb=restoring?'Restaurar':'Arquivar';
 const load=useCallback(async()=>{
  const current=++generation.current;
  controller.current?.abort();controller.current=new AbortController();setLoading(true);setError('');setData(null);setConfirmed(false);
  try{
   const response=await fetch('/api/archive?'+new URLSearchParams({entity,id}),{cache:'no-store',signal:controller.current.signal});
   const result=await response.json() as ArchiveView&{error?:string};
   if(!alive.current||current!==generation.current)return;
   if(!response.ok)throw new Error(result.error||'Não foi possível abrir a confirmação.');
   if(result.entity!==entity||result.id!==id||!Number.isSafeInteger(result.revision))throw new Error('O cadastro mudou. Feche e reabra a confirmação.');
   setData(result);requestId.current=crypto.randomUUID();
  }catch(cause){if(alive.current&&current===generation.current&&!controller.current?.signal.aborted)setError(message(cause));}
  finally{if(alive.current&&current===generation.current)setLoading(false);}
 },[entity,id]);
 useEffect(()=>{
  alive.current=true;const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';closeButton.current?.focus();const timer=setTimeout(()=>void load(),0),requests=generation;
  return()=>{alive.current=false;clearTimeout(timer);requests.current++;controller.current?.abort();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[load]);
 function close(){if(!busyRef.current)onClose();}
 async function submit(event:FormEvent){
  event.preventDefault();event.stopPropagation();
  if(!data||busyRef.current||data.action!==action||data.blockers.length||!confirmed||saved)return;
  busyRef.current=true;setBusy(true);setError('');
  try{
   const response=await fetch('/api/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity,id,action,expected_revision:data.revision,request_id:requestId.current,reason,confirmed})});
   const result=await response.json() as {id?:string;action?:string;error?:string};
   if(!response.ok)throw new Error(result.error||'Não foi possível confirmar. Tente novamente com o mesmo formulário.');
   if(result.id!==id||result.action!==action)throw new Error('A resposta não corresponde ao cadastro. Atualize a página para conferir.');
   if(!alive.current)return;
   setSaved(true);
   try{if(onSaved)await onSaved();else window.location.reload();}
   catch{if(alive.current)setError('A ação foi salva. Atualize a página para ver a lista atual.');return;}
   if(alive.current)onClose();
  }catch(cause){if(alive.current)setError(message(cause));}
  finally{busyRef.current=false;if(alive.current)setBusy(false);}
 }
 const changed=data&&data.action!==action;
 return <div className="modal-backdrop no-print" onClick={event=>{if(event.target===event.currentTarget)close();}}><section className="modal correction-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  if(event.key!=='Tab')return;
  const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,a[href]')).filter(element=>element.getClientRects().length),first=elements[0],last=elements.at(-1);
  if(!first){event.preventDefault();return;}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }}><header><div><span className="eyebrow">CADASTRO COM HISTÓRICO</span><h2 id={titleId}>{verb} {labels[entity]}</h2></div><button ref={closeButton} type="button" className="close" disabled={busy} aria-label="Fechar confirmação" onClick={close}><X size={22}/></button></header>
 <p id={descriptionId} className="muted">{restoring?'O cadastro voltará às listas ativas. Os registros e fotos existentes serão mantidos.':'O cadastro sairá das listas ativas e poderá ser restaurado em Arquivados. O histórico e as fotos serão preservados.'}</p>
 {loading?<p role="status"><LoaderCircle size={18} className="spin"/>Carregando os dados atuais…</p>:data?<>
 <div className="clean-inset"><strong>{data.name}</strong>{data.archivedAt&&<p className="muted">Arquivado em {stamp(data.archivedAt)} (Belém).</p>}</div>
 {entity==='equipment'&&<p className="inline-note">{restoring?'A agenda será recalculada com os serviços reais concluídos e a data inicial já cadastrada.':'Este equipamento deixará a agenda ativa. Os serviços registrados e a data inicial serão preservados para a restauração.'}</p>}
 {changed?<p className="error" role="alert">{data.archivedAt?'Este cadastro já está arquivado.':'Este cadastro já está ativo.'} Feche a confirmação e atualize a página.</p>:data.blockers.length?<div className="error" role="alert"><p>Resolva estes vínculos antes de continuar:</p><ul>{data.blockers.map(blocker=><li key={blocker}>{blocker}</li>)}</ul></div>:<form onSubmit={submit}>
 <fieldset className="correction-fields" disabled={busy||saved}><label className="field"><span>Motivo {restoring?'da restauração':'do arquivamento'}</span><textarea required maxLength={1000} rows={3} value={reason} onChange={event=>{setReason(event.target.value);setConfirmed(false);}} placeholder={restoring?'Explique por que o cadastro deve voltar às listas ativas':'Explique por que o cadastro deve sair das listas ativas'}/></label><label className="confirm"><input type="checkbox" required checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>{restoring?'Conferi este cadastro e confirmo sua restauração.':'Conferi este cadastro e confirmo o arquivamento reversível, preservando o histórico.'}</span></label></fieldset>
 {saved&&<p className="visit-success" role="status">{restoring?'Cadastro restaurado.':'Cadastro arquivado.'}</p>}
 <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>{saved?'Fechar':'Cancelar'}</button><button type="submit" className="button" disabled={busy||saved||!confirmed||!reason.trim()}>{busy?'Salvando…':verb+' cadastro'}</button></div></form>}
 <details className="correction-history"><summary><History size={18}/>Histórico de arquivamento</summary>{!data.history.length?<p className="muted">Nenhuma ação de arquivamento disponível neste acesso.</p>:data.history.map(event=><article className="history-item" key={event.id}><h3>{event.action==='restore'?'Restauração':'Arquivamento'} · {stamp(event.created_at)} (Belém)</h3><p>{event.actor_name}</p><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{event.reason}</p></article>)}{data.historyLimited&&<p className="muted">Exibindo as 20 ações mais recentes. As anteriores continuam preservadas.</p>}</details>
 </>:<button type="button" className="button secondary" onClick={()=>void load()}>Tentar novamente</button>}
 {error&&<p className="error" role="alert">{error}</p>}
 </section></div>;
}
