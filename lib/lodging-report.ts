import type {OccupancyStay} from './occupancy';

export type LodgingReportStay = Pick<OccupancyStay,'id'|'property_id'|'person_profile_id'|'person_name'|'person_title'|'entry_on'|'exit_on'|'planned_exit_on'|'client_id'|'client_name'|'cost_center_id'|'cost_center_name'|'assignment_captured_at'|'assignment_unavailable'> & {property_name:string;control_number:number|null};
export type LodgingReportRow = {key:string;name:string;detail:string;realized:number;forecast:number;unknown_entry:number;stays:number};
export type LodgingReport = {from:string;to:string;today:string;totals:{realized:number;forecast:number;unknown_entry:number;without_forecast:number;stays:number};people:LodgingReportRow[];properties:LodgingReportRow[];companies:LodgingReportRow[];clients:{id:string;name:string}[];cost_centers:{id:string;client_id:string|null;name:string}[]};
const DAY=86400000;
export function nextCivilDay(day:string){return new Date(Date.parse(day+'T12:00:00Z')+DAY).toISOString().slice(0,10);}
function nights(start:string,end:string){return Math.max(0,Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/DAY));}
export function lodgingStayNights(stay:Pick<LodgingReportStay,'entry_on'|'exit_on'|'planned_exit_on'>,from:string,to:string,today:string){
  if(stay.entry_on===null)return {realized:0,forecast:0,unknown_entry:1};
  const periodEnd=nextCivilDay(to),start=[stay.entry_on,from].sort().at(-1)!;
  const realizedEnd=[stay.exit_on||today,today,periodEnd].sort()[0];
  const forecastStart=[start,today].sort().at(-1)!;
  return {realized:nights(start,realizedEnd),forecast:stay.exit_on===null&&stay.planned_exit_on?nights(forecastStart,[stay.planned_exit_on,periodEnd].sort()[0]):0,unknown_entry:0};
}
export function lodgingAssignmentLabel(stay:Pick<LodgingReportStay,'client_name'|'cost_center_name'|'assignment_captured_at'|'assignment_unavailable'>){return stay.assignment_unavailable?'Empresa/centro de custo fora deste acesso':!stay.assignment_captured_at?'Vínculo não registrado':[stay.client_name||'Empresa não informada',stay.cost_center_name].filter(Boolean).join(' · ');}
export function makeLodgingReport(source:LodgingReportStay[],from:string,to:string,today:string,clientFilter='',centerFilter=''):LodgingReport{
  const all=[...new Map(source.map(s=>[s.id,s])).values()];
  const clients=[...new Map(all.filter(s=>s.client_id&&!s.assignment_unavailable).map(s=>[s.client_id!,{id:s.client_id!,name:s.client_name||'Empresa'}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const cost_centers=[...new Map(all.filter(s=>s.cost_center_id&&!s.assignment_unavailable&&(!clientFilter||s.client_id===clientFilter)).map(s=>[s.cost_center_id!,{id:s.cost_center_id!,client_id:s.client_id,name:s.cost_center_name||'Centro de custo'}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const stays=all.filter(s=>(!clientFilter||s.client_id===clientFilter&&!s.assignment_unavailable)&&(!centerFilter||s.cost_center_id===centerFilter&&!s.assignment_unavailable));
  const totals={realized:0,forecast:0,unknown_entry:0,without_forecast:0,stays:stays.length};
  const people=new Map<string,LodgingReportRow>(),properties=new Map<string,LodgingReportRow>(),companies=new Map<string,LodgingReportRow>();
  function add(map:Map<string,LodgingReportRow>,key:string,name:string,detail:string,n:{realized:number;forecast:number;unknown_entry:number}){const row=map.get(key)||{key,name,detail,realized:0,forecast:0,unknown_entry:0,stays:0};row.realized+=n.realized;row.forecast+=n.forecast;row.unknown_entry+=n.unknown_entry;row.stays++;map.set(key,row);}
  for(const stay of stays){const n=lodgingStayNights(stay,from,to,today);totals.realized+=n.realized;totals.forecast+=n.forecast;totals.unknown_entry+=n.unknown_entry;if(!stay.exit_on&&!stay.planned_exit_on)totals.without_forecast++;
    const companyKey=stay.assignment_unavailable?'restricted':!stay.assignment_captured_at?'legacy':stay.client_id||'unassigned';
    const propertyLabel=(stay.control_number===null?'':'Imóvel '+stay.control_number+' · ')+stay.property_name;
    add(people,stay.person_profile_id,stay.person_name,stay.person_title,n);
    add(properties,stay.property_id,propertyLabel,'',n);
    add(companies,companyKey,stay.assignment_unavailable?'Empresa fora deste acesso':!stay.assignment_captured_at?'Vínculo não registrado':stay.client_name||'Empresa não informada','',n);
  }
  const sorted=(m:Map<string,LodgingReportRow>)=>[...m.values()].sort((a,b)=>b.realized-a.realized||b.forecast-a.forecast||a.name.localeCompare(b.name,'pt-BR'));
  return {from,to,today,totals,people:sorted(people),properties:sorted(properties),companies:sorted(companies),clients,cost_centers};
}
