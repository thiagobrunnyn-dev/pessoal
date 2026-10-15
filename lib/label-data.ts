export type LabelDraft={serviceDate:string;serviceTime:string;nextDate:string;responsible:string;address:string};
type LabelEquipment={address?:string;baseline_date?:string|null};
type LabelMaintenance={id?:string;service_date:string;service_time?:string;responsible?:string;created_at?:string;completion_status?:string;is_test?:number|boolean;evidence_version?:number;evidence_complete?:number|boolean};
export function labelNextDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
 const d=new Date(value+'T12:00:00Z');if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)return '';
 d.setUTCDate(d.getUTCDate()+90);return d.toISOString().slice(0,10);
}
export function makeLabelDraft(equipment:LabelEquipment,history:LabelMaintenance[]=[]):LabelDraft{
 const latest=history.filter(row=>!row.is_test&&(Number(row.evidence_version??1)===1||!!row.evidence_complete)&&(!row.completion_status||row.completion_status==='completed')).sort((a,b)=>(b.service_date+'T'+(b.service_time||'')+'|'+(b.created_at||'')+'|'+(b.id||'')).localeCompare(a.service_date+'T'+(a.service_time||'')+'|'+(a.created_at||'')+'|'+(a.id||'')))[0];
 return {serviceDate:latest?.service_date||'',serviceTime:latest?.service_time||'',nextDate:latest?labelNextDate(latest.service_date):'',responsible:latest?.responsible||'',address:equipment.address||''};
}
export function updateLabelDraft(draft:LabelDraft,key:keyof LabelDraft,value:string):LabelDraft{
 return key==='serviceDate'?{...draft,serviceDate:value,nextDate:labelNextDate(value)}:{...draft,[key]:value};
}
export function labelDisplayDate(value:string){
 if(!value)return 'Não informada';const [year,month,day]=value.split('-');return day&&month&&year?`${day}/${month}/${year}`:'Não informada';
}
