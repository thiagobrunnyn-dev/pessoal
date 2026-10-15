export const BASIC_CHECKLIST=[
 'Unidade interna · Filtro de ar',
 'Unidade interna · Serpentina',
 'Unidade interna · Turbina',
 'Unidade interna · Bandeja',
 'Unidade interna · Sistema de drenagem',
 'Unidade externa · Serpentina do condensador',
 'Unidade externa · Hélice do ventilador'
];
export type ChecklistResult={item:string;status:''|'done'|'pending'|'not_applicable';note:string};
export function checklistItems(value:string|string[]|null|undefined):string[]{let list:unknown;try{list=typeof value==='string'?JSON.parse(value):value;}catch{list=[];}return Array.isArray(list)&&list.length?list.filter((x):x is string=>typeof x==='string'):BASIC_CHECKLIST;}
export function initialChecklist(value:string|string[]|null|undefined):ChecklistResult[]{return checklistItems(value).map(item=>({item,status:'',note:''}));}
export function validateChecklist(items:string[],raw:unknown):{results:ChecklistResult[];completion:'completed'|'pending'|'not_performed'}{
 if(!Array.isArray(raw)||raw.length!==items.length)throw new Error('Preencha a situação de todos os itens da rotina.');
 const results=items.map((item,i)=>{const row=raw[i];if(!row||row.item!==item||!['done','pending','not_applicable'].includes(row.status))throw new Error('Preencha a situação de todos os itens da rotina.');const note=String(row.note||'').trim().slice(0,1000);if(row.status==='pending'&&!note)throw new Error('Descreva a observação de cada item pendente.');return {item,status:row.status,note} as ChecklistResult;});
 return {results,completion:results.some(r=>r.status==='pending')?'pending':results.some(r=>r.status==='done')?'completed':'not_performed'};
}
export function checklistSnapshot(value:string){try{const list=JSON.parse(value);if(!Array.isArray(list))return [];return list.map((item:any)=>typeof item==='string'?{item,status:'done',note:''}:item) as ChecklistResult[];}catch{return [];}}
export const checklistStatusLabel=(status:string)=>status==='done'?'Realizado':status==='pending'?'Pendente':status==='not_applicable'?'Não aplicável':'Não informado';
