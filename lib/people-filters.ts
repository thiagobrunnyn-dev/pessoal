import {personNumber} from './person-number';
import {uppercasePersonText as upper} from './person-text';
export type FilterablePerson={id:string;display_name:string;job_title:string;status:string;directory:string;state_code?:string|null;city?:string|null;control_number?:number|null;supervisor_profile_id?:string|null;supervisor_account_user_id?:string|null;client_id?:string|null;cost_center_id?:string|null;assignment_unavailable?:boolean;has_assignment?:boolean;client?:{id:string;name:string}|null;cost_center?:{id:string;client_id:string;name:string}|null};
export type PersonSupervisor={ref:string;display_name:string;aliases?:string[]};
export type PeopleFilters={state:string;city:string;supervisor:string;client:string;center:string};
export const emptyPeopleFilters:PeopleFilters={state:'',city:'',supervisor:'',client:'',center:''};
const normalize=(s:string)=>upper(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export const personCityKey=(p:FilterablePerson)=>p.city?JSON.stringify([p.state_code||'',upper(p.city)]):'__none__';
export function personSupervisorKey(p:FilterablePerson,options:PersonSupervisor[]){const raw=p.supervisor_account_user_id?'account:'+p.supervisor_account_user_id:p.supervisor_profile_id?'person:'+p.supervisor_profile_id:'';return !raw?'__none__':options.find(o=>o.ref===raw||o.aliases?.includes(raw))?.ref||'__unavailable__';}
export const personClientKey=(p:FilterablePerson)=>p.assignment_unavailable?'__unavailable__':p.client_id||'__none__';
export const personCenterKey=(p:FilterablePerson)=>p.assignment_unavailable?'__unavailable__':p.cost_center_id||'__none__';
export function filterPeople<T extends FilterablePerson>(rows:T[],filters:PeopleFilters,search:string,supervisors:PersonSupervisor[]){const query=normalize(search.trim());return rows.filter(p=>
 (!filters.state||(p.state_code||'__none__')===filters.state)&&(!filters.city||personCityKey(p)===filters.city)&&
 (!filters.supervisor||personSupervisorKey(p,supervisors)===filters.supervisor)&&(!filters.client||personClientKey(p)===filters.client)&&(!filters.center||personCenterKey(p)===filters.center)&&
 (!query||normalize([personNumber(p.control_number),p.display_name,p.job_title,p.city,p.state_code,p.client?.name,p.cost_center?.name,supervisors.find(o=>o.ref===personSupervisorKey(p,supervisors))?.display_name].filter(Boolean).join(' ')).includes(query))
 );}
export function missingPersonData(p:FilterablePerson){if(p.directory==='guest')return [];const missing:string[]=[];if(!p.job_title?.trim())missing.push('função');if(!p.state_code)missing.push('UF');if(!p.city?.trim())missing.push('cidade');if(!p.assignment_unavailable){if(!p.client_id)missing.push('empresa');if(!p.cost_center_id)missing.push('centro de custo');}return missing;}
