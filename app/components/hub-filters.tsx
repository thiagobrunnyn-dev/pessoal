'use client';
import {useState} from 'react';
import {SlidersHorizontal,ChevronDown} from 'lucide-react';
import {FILTER_KEYS,type FilterKey,type OperationFilters,type OperationFilterOptions} from '../../lib/operation-filter-values';
const LABELS:Record<FilterKey,string>={state_code:'Estado',client_id:'Empresa',worksite_id:'Centro de custo',property_id:'Imóvel'};
const ALL:Record<FilterKey,string>={state_code:'Todos os estados permitidos',client_id:'Todas as empresas',worksite_id:'Todos os centros de custo',property_id:'Todos os imóveis'};
export default function HubFilters({filters,options,loading,onChange,onClear,hasQuery}:{hasQuery:boolean;filters:OperationFilters;options:OperationFilterOptions|null;loading:boolean;onChange:(key:FilterKey,value:string)=>void;onClear:()=>void}){
 const active=FILTER_KEYS.filter(key=>!!filters[key]).length,[open,setOpen]=useState(hasQuery);
 return <details className="hub-filter-panel" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary><SlidersHorizontal size={19}/><strong>Filtros gerais</strong><span>{active?`${active} ${active===1?'filtro aplicado':'filtros aplicados'}`:hasQuery?'Revisar seleção':'Toda a operação permitida'}</span><ChevronDown size={17}/></summary>
  <div className="hub-filter-body"><div className="hub-filter-fields">{FILTER_KEYS.map(key=><label className="field" key={key}><span>{LABELS[key]}</span><select value={filters[key]} disabled={!options||loading&&key!=='state_code'} onChange={event=>onChange(key,event.target.value)}><option value="">{ALL[key]}</option>{filters[key]&&!options?.[key].some(option=>option.value===filters[key])&&<option value={filters[key]} disabled>Seleção indisponível</option>}{options?.[key].map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</div>
   <div className="hub-filter-footer"><p>Empresa e centro de custo são os do cadastro atual do imóvel, inclusive nas ordens de serviço.</p><button className="button secondary" type="button" disabled={!hasQuery&&!loading} onClick={onClear}>Limpar filtros</button></div>
  </div>
 </details>;
}
