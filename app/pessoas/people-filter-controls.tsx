'use client';
import {BRAZIL_STATES} from '../../lib/brazil-states';
import {uppercasePersonText as upper} from '../../lib/person-text';
import {personCityKey,personSupervisorKey,personClientKey,personCenterKey,type FilterablePerson,type PeopleFilters,type PersonSupervisor} from '../../lib/people-filters';
type Option={id:string;name:string};
const unique=(values:Option[])=>[...new Map(values.map(v=>[v.id,v])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
const label=(id:string,fallback='Não informado')=>id==='__unavailable__'?'Vínculo indisponível neste acesso':fallback;
export default function PeopleFilterControls({rows,filters,supervisors,regional,disabled,onChange,onClear,hasSearch}:{rows:FilterablePerson[];filters:PeopleFilters;supervisors:PersonSupervisor[];regional:boolean;disabled:boolean;onChange:(filters:PeopleFilters)=>void;onClear:()=>void;hasSearch:boolean}){
 const states=unique(rows.map(p=>({id:p.state_code||'__none__',name:p.state_code?`${p.state_code} · ${BRAZIL_STATES[p.state_code as keyof typeof BRAZIL_STATES]||p.state_code}`:'UF a confirmar'})));
 const cities=unique(rows.filter(p=>!filters.state||(p.state_code||'__none__')===filters.state).map(p=>({id:personCityKey(p),name:p.city?upper(p.city)+(filters.state?'':p.state_code?' · '+p.state_code:' · UF a confirmar'):'Cidade não informada'})));
 const supervisorsUsed=unique(rows.map(p=>{const id=personSupervisorKey(p,supervisors);return {id,name:supervisors.find(o=>o.ref===id)?.display_name||label(id,'Sem supervisor')};}));
 const clients=unique(rows.map(p=>({id:personClientKey(p),name:p.client?.name||label(personClientKey(p),'Sem empresa')})));
 const centers=unique(rows.filter(p=>personClientKey(p)===filters.client).map(p=>({id:personCenterKey(p),name:p.cost_center?.name||label(personCenterKey(p),'Sem centro de custo')})));
 const count=Object.values(filters).filter(Boolean).length;
 return <div className="people-filter-bar"><details className="people-filter-panel"><summary>Filtros{count>0?` · ${count} ativo${count===1?'':'s'}`:''}</summary><fieldset disabled={disabled} className="people-filter-grid">
  <label className="field"><span>Estado</span><select value={regional?'PA':filters.state} disabled={disabled||regional} onChange={e=>onChange({...filters,state:e.target.value,city:''})}>{regional?<option value="PA">PA · Pará</option>:<><option value="">Todos os estados</option>{states.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</>}</select></label>
  <label className="field"><span>Cidade</span><select value={filters.city} onChange={e=>onChange({...filters,city:e.target.value})}><option value="">Todas as cidades</option>{cities.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
  <label className="field"><span>Supervisor</span><select value={filters.supervisor} onChange={e=>onChange({...filters,supervisor:e.target.value})}><option value="">Todos os supervisores</option>{supervisorsUsed.map(o=><option key={o.id} value={o.id}>{upper(o.name)}</option>)}</select></label>
  <label className="field"><span>Cliente / Empresa</span><select value={filters.client} onChange={e=>onChange({...filters,client:e.target.value,center:''})}><option value="">Todas as empresas</option>{clients.map(o=><option key={o.id} value={o.id}>{upper(o.name)}</option>)}</select></label>
  <label className="field"><span>Centro de custo / obra</span><select value={filters.center} disabled={disabled||!filters.client||filters.client.startsWith('__')} onChange={e=>onChange({...filters,center:e.target.value})}><option value="">{filters.client?'Todos os centros de custo':'Escolha primeiro a empresa'}</option>{centers.map(o=><option key={o.id} value={o.id}>{upper(o.name)}</option>)}</select></label>
 </fieldset></details>{(count>0||hasSearch)&&<button type="button" className="button secondary" disabled={disabled} onClick={onClear}>Limpar filtros</button>}</div>;
}
