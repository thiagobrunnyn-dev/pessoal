'use client';
/* Native document links preserve the app's established iPhone navigation fix. */
/* eslint-disable @next/next/no-html-link-for-pages */
import {useCallback,useEffect,useRef,useState} from 'react';
import {Archive,ArrowLeft,RefreshCw} from 'lucide-react';
import ArchiveButton from '../components/archive-button';
import type {ArchivedList,ArchiveEntity} from '../../lib/archive';

const labels:Record<ArchiveEntity,string>={property:'Imóveis',equipment:'Equipamentos',cleaning_location:'Locais de limpeza',client:'Clientes',cost_center:'Centros de custo'};
export default function ArchivedCatalog({displayName,initialData}:{displayName:string;initialData:ArchivedList|null}){
 const [data,setData]=useState(initialData),[entity,setEntity]=useState<ArchiveEntity>('property'),[busy,setBusy]=useState(!initialData),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const controller=useRef<AbortController|null>(null),generation=useRef(0);
 const load=useCallback(async(selected:ArchiveEntity,offset=0)=>{
  const current=++generation.current;controller.current?.abort();controller.current=new AbortController();setBusy(true);setError('');
  try{
   const response=await fetch('/api/archive?'+new URLSearchParams({list:'1',entity:selected,offset:String(offset)}),{cache:'no-store',signal:controller.current.signal}),result=await response.json() as ArchivedList&{error?:string};
   if(current!==generation.current)return;
   if(!response.ok)throw new Error(result.error||'Não foi possível consultar os cadastros arquivados.');
   if(result.entity!==selected||!Array.isArray(result.items)||!Array.isArray(result.availableEntities))throw new Error('A resposta não corresponde ao filtro atual. Tente novamente.');
   setData(previous=>offset&&previous?.entity===selected?{...result,items:[...new Map([...previous.items,...result.items].map(item=>[item.id,item])).values()]}:result);
  }catch(cause){if(current===generation.current&&!controller.current?.signal.aborted)setError(cause instanceof Error?cause.message:'Não foi possível consultar.');}
  finally{if(current===generation.current)setBusy(false);}
 },[]);
 useEffect(()=>{
  const requests=generation,timer=!initialData?setTimeout(()=>void load('property'),0):undefined;
  return()=>{clearTimeout(timer);requests.current++;controller.current?.abort();};
 },[initialData,load]);
 const matches=data?.entity===entity,items=matches?data.items:[];
 return <><header className="topbar"><a className="brand" href="/"><span>MOBILIZA GESTÃO<br/><strong>Cadastros arquivados</strong></span></a><span className="clean-header-label">{displayName}</span></header><main className="shell"><a className="nav-back" href="/"><ArrowLeft size={19}/>Voltar ao painel</a><section className="page-title"><div><div className="eyebrow">HISTÓRICO PRESERVADO</div><h1>Arquivados</h1><p>Cadastros fora das listas ativas. A restauração mantém os registros e fotos já existentes.</p></div><button type="button" className="button secondary" disabled={busy} onClick={()=>void load(entity)}><RefreshCw size={17} className={busy?'spin':''}/>{busy?'Atualizando…':'Atualizar'}</button></section><section className="panel"><label className="field"><span>Tipo de cadastro</span><select value={entity} onChange={event=>{const selected=event.target.value as ArchiveEntity;setEntity(selected);setNotice('');void load(selected);}}>{(data?.availableEntities||['property','equipment','cleaning_location'] as ArchiveEntity[]).map(key=><option key={key} value={key}>{labels[key]}</option>)}</select></label>
 {busy&&<p role="status" className="muted">Carregando cadastros arquivados…</p>}{error&&<div className="error" role="alert"><p>{error}</p>{matches&&<p>Os dados exibidos são da última leitura.</p>}<button type="button" className="text-button" disabled={busy} onClick={()=>void load(entity)}>Tentar novamente</button></div>}{notice&&<p role="status" className="visit-success">{notice}</p>}
 {!busy&&!error&&matches&&!items.length&&<div className="empty compact"><Archive size={30}/><h3>Nenhum cadastro arquivado nesta seleção</h3><p>Os cadastros ativos continuam disponíveis nas suas áreas.</p></div>}
 {items.map(item=><article className="today-task" key={item.id}><div className="today-task-info"><h3>{item.name}</h3>{item.parent_name&&<p className="muted">{item.parent_name}</p>}<small>Arquivado em {new Date(item.archived_at).toLocaleString('pt-BR',{timeZone:'America/Belem'})} (Belém)</small>{item.actor_name&&<p>{item.actor_name}</p>}{item.reason&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.reason}</p>}</div><div className="today-task-actions"><ArchiveButton entity={entity} id={item.id} action="restore" iconOnly={false} ariaLabel={'Restaurar '+item.name} onSaved={async()=>{setNotice('Cadastro restaurado. O histórico e as fotos foram mantidos.');await load(entity);}}/></div></article>)}
 {matches&&data.nextOffset!==null&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void load(entity,data.nextOffset!)}>Mostrar mais</button>}<p className="today-footnote">Para restaurar um equipamento ou local de limpeza, restaure primeiro seu imóvel. Centros de custo precisam de um cliente ativo.</p></section></main></>;
}
