'use client';
import {uppercasePersonText as upper} from '../../lib/person-text';
export type PersonClient={id:string;name:string;entity_type?:string;archived?:boolean};
export type PersonCenter={id:string;client_id:string;name:string;archived?:boolean};
export type PersonCatalog={clients:PersonClient[];costCenters:PersonCenter[]};
export default function PersonAssignmentFields({catalog,clientId,centerId,currentClient,currentCenter,unavailable,changed,disabled,onChange}:{
  catalog:PersonCatalog;clientId:string;centerId:string;currentClient?:PersonClient|null;currentCenter?:PersonCenter|null;
  unavailable:boolean;changed:boolean;disabled:boolean;onChange:(client:string,center:string)=>void;
}){
  const clients=catalog.clients,centers=catalog.costCenters.filter(item=>item.client_id===clientId);
  const retainedClient=currentClient?.id===clientId&&!clients.some(item=>item.id===clientId)?currentClient:null;
  const retainedCenter=currentCenter?.id===centerId&&currentCenter.client_id===clientId&&!centers.some(item=>item.id===centerId)?currentCenter:null;
  return <fieldset className="person-assignment" disabled={disabled}><legend>Empresa e centro de custo</legend>
    {unavailable&&!changed&&<p className="clean-access-note">O vínculo atual não está disponível neste acesso e será preservado. Escolha outra opção apenas se quiser trocá-lo.</p>}
    <div className="two-col">
      <label className="field"><span>Cliente / Empresa (opcional)</span><select value={clientId} onChange={event=>onChange(event.target.value,'')}>
        <option value="">{unavailable&&!changed?'Manter vínculo atual':'Sem empresa vinculada'}</option>
        {retainedClient&&<option value={retainedClient.id}>{upper(retainedClient.name)} · vínculo arquivado</option>}
        {clients.map(item=><option key={item.id} value={item.id}>{upper(item.name)}{item.entity_type==='internal_unit'?' · UNIDADE INTERNA':''}</option>)}
      </select></label>
      <label className="field"><span>Centro de custo / obra (opcional)</span><select value={centerId} disabled={disabled||!clientId} onChange={event=>onChange(clientId,event.target.value)}>
        <option value="">{clientId?'Sem centro de custo':'Escolha primeiro a empresa'}</option>
        {retainedCenter&&<option value={retainedCenter.id}>{upper(retainedCenter.name)} · vínculo arquivado</option>}
        {centers.map(item=><option key={item.id} value={item.id}>{upper(item.name)}</option>)}
      </select></label>
    </div>
    {clientId&&!centers.length&&!retainedCenter&&<small>Nenhum centro de custo ativo disponível para esta empresa. Você pode completar depois.</small>}
    {unavailable&&!changed&&<button type="button" className="text-button" onClick={()=>onChange('','')}>Remover o vínculo atual deste cadastro</button>}
  </fieldset>;
}
