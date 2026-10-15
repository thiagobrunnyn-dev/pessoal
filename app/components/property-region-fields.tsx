'use client';
import {useState} from 'react';
import {BRAZIL_STATES} from '../../lib/brazil-states';
import ClientCatalogSelector,{type CatalogStatus} from './client-catalog-selector';
export default function PropertyRegionFields({regional=false}:{regional?:boolean}){
 const [client,setClient]=useState(''),[center,setCenter]=useState(''),[status,setStatus]=useState<CatalogStatus>('loading');
 return <><label className="field"><span>Estado (UF)</span><select name="state_code" required={regional} defaultValue={regional?'PA':''}><option value="" disabled={regional}>{regional?'Selecione o estado':'UF a confirmar'}</option>{Object.entries(BRAZIL_STATES).filter(([uf])=>!regional||uf==='PA').map(([uf,name])=><option value={uf} key={uf}>{uf} · {name}</option>)}</select>{!regional&&<small>Sem UF confirmada, o imóvel fica disponível somente à gestão com acesso geral.</small>}</label><p className="muted">Empresa e centro de custo são opcionais. O vínculo deste imóvel é compartilhado por Centrais, Manutenção geral, Limpeza e Entregas.</p><input type="hidden" name="catalog_status" value={status}/><ClientCatalogSelector clientId={client} centerId={center} onClientChange={setClient} onCenterChange={setCenter} clientFieldName="catalog_client_id" centerFieldName="worksite_id" onStatusChange={setStatus}/></>;
}
