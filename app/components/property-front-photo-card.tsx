'use client';
import PropertyCapacitySummary from './property-capacity-summary';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Camera,X} from 'lucide-react';
import {PropertyFrontPhotoPicker} from './property-details-fields';
import {prepareProfilePhoto} from '../pessoas/profile-photo';
import {propertyCountLabel} from '../../lib/property-details';
import {propertyTypeLabel} from '../../lib/property-type';
type Row=Record<string,any>;
export default function PropertyFrontPhotoCard({data,onSaved}:{data:Row;onSaved:()=>void|Promise<void>}){
 const [editing,setEditing]=useState(false),[file,setFile]=useState<File|null>(null),[preparing,setPreparing]=useState(false),[busy,setBusy]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const alive=useRef(true),request=useRef(crypto.randomUUID()),expected=useRef<number>(data.revision),latest=useRef(data),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);latest.current=data;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(editing&&dialog.current&&!dialog.current.open)dialog.current.showModal();},[editing]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(file||busy||preparing){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[file,busy,preparing]);
 function pick(next:File|null){setFile(next);setError('');setNotice('');request.current=crypto.randomUUID();expected.current=latest.current.revision;}
 function finish(){dialog.current?.close();setEditing(false);trigger.current?.focus();}
 function close(){if(busy)return;if((file||preparing)&&!confirm('Fechar sem enviar a foto selecionada?'))return;finish();pick(null);setPreparing(false);setReason('');}
 async function save(){
  if(!file||busy||preparing||!data.can_edit_photo)return;
  setBusy(true);setError('');
  const form=new FormData();form.set('property_id',data.id);form.set('expected_revision',String(expected.current));form.set('request_id',request.current);form.set('front_photo',file);form.set('reason',reason);form.set('confirmed','yes');
  try{const r=await fetch('/api/property-front-photo',{method:'POST',body:form}),result=await r.json() as Row;if(!r.ok)throw new Error(result.error||'Não foi possível salvar a foto.');if(!alive.current)return;setFile(null);finish();setReason('');setNotice(result.alreadySaved?'Envio já registrado. A ficha será atualizada.':'Foto da fachada salva.');request.current=crypto.randomUUID();await onSaved();}
  catch(e){if(alive.current)setError((e as Error).message);}
  finally{if(alive.current)setBusy(false);}
 }
 return <div className="clean-inset no-print">
  <div className="property-facade-heading"><h3>Foto da fachada</h3>
  {data.can_edit_photo&&<button ref={trigger} type="button" className="button secondary" onClick={()=>{expected.current=data.revision;setNotice('');setEditing(true);}}><Camera size={17}/>{data.front_photo?'Trocar foto da fachada':'Adicionar foto da fachada'}</button>}
  </div>
  {data.front_photo?<><a href={data.front_photo.path} target="_blank" rel="noopener noreferrer" aria-label="Ampliar foto privada da fachada"><img src={data.front_photo.path} alt="Foto da frente do imóvel" width={240} height={160} loading="lazy" decoding="async" style={{maxWidth:'100%',objectFit:'contain'}}/></a><p className="muted">Foto registrada em {new Date(data.front_photo.created_at).toLocaleString('pt-BR',{timeZone:'America/Belem'})} (Belém).</p></>:<>{!data.can_edit_photo&&<p className="muted">Foto da fachada indisponível.</p>}</>}
  <h3>Características do imóvel</h3><dl className="property-characteristics"><div><dt>Tipo</dt><dd>{propertyTypeLabel(data.property_type)}</dd></div><div><dt>Quartos</dt><dd>{propertyCountLabel(data.bedrooms??null)}</dd></div><div><dt>Banheiros</dt><dd>{propertyCountLabel(data.bathrooms??null)}</dd></div></dl>
  <PropertyCapacitySummary data={data}/>
  {editing&&createPortal(<dialog ref={dialog} className="modal facade-dialog no-print" aria-label="Foto privada da fachada" onCancel={e=>{e.preventDefault();close();}}>
   <header><div><h2>Foto da fachada</h2><p className="muted">{data.name}</p></div><button type="button" className="close" disabled={busy} onClick={close} aria-label="Fechar foto da fachada"><X size={22}/></button></header>
   <PropertyFrontPhotoPicker file={file} onChange={pick} onPreparingChange={setPreparing} preparePhoto={prepareProfilePhoto} disabled={busy||!data.can_edit_photo}/>
   <p className="muted">A foto fica privada para a gestão autorizada. Evite pessoas e documentos; metadados pessoais de localização são removidos. Escolher a imagem não envia o arquivo.</p>
   <label className="field"><span>{data.front_photo?'Motivo da troca da foto':'Observação da foto (opcional)'}</span><input value={reason} maxLength={1000} disabled={busy} onChange={e=>{setReason(e.target.value);request.current=crypto.randomUUID();expected.current=latest.current.revision;}}/></label>
   {error&&<p className="error" role="alert">{error} A foto selecionada foi mantida. Se a ficha mudou, cancele a seleção, atualize os dados e confira novamente.</p>}
   <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>Cancelar</button><button type="button" className="button" disabled={busy||preparing||!file||!data.can_edit_photo||!!data.front_photo&&!reason.trim()} onClick={save}>{busy?'Enviando foto…':'Salvar foto da fachada'}</button></div>
  </dialog>,document.body)}
  {notice&&<p className="visit-success" role="status">{notice}</p>}
 </div>;
}
