import {Invalid,returnDeadline} from './model.js';
const bad=m=>{throw new Invalid(m)};
export const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
export function reason(v){if(typeof v!=='string'||v.trim().length<5||v.trim().length>500)bad('Informe o motivo da correção, de 5 a 500 caracteres.');return v.trim()}
const text=(v,label,max=100,optional=false)=>{if(typeof v!=='string'||(!optional&&!v.trim())||v.trim().length>max||/[\u0000-\u001f]/.test(v))bad(label+' inválido.');return v.trim()};
const find=(s,kind,id)=>s[kind].find(x=>x.id===id)||bad('Registro não encontrado.');
export const recordType=(state,record)=>record.pieceType||state.pieces.find(x=>x.id===record.id)?.type;
export function correct(state,input,now){
 const allowed={companies:['name'],destinations:['companyId','city','lodging','block','room'],people:['companyId','destinationId','name','mat'],pieces:['owner','type'],rols:['owner','date','collectionTime','triageDate','shirts','pants','notes','snapshot']};
 if(Object.keys(input).some(k=>!['type','kind','id','changes','reason','version','requestId'].includes(k))||!Object.hasOwn(allowed,input.kind)||!input.changes||Array.isArray(input.changes)||typeof input.changes!=='object'||Object.keys(input.changes).some(k=>!allowed[input.kind].includes(k)))bad('Campos de correção inválidos. IDs, QR e movimentos são preservados.');
 const why=reason(input.reason),s=structuredClone(state),row=find(s,input.kind,input.id),original=structuredClone(row),c=input.changes;
 if(input.kind==='companies'){
  if(Object.hasOwn(c,'name'))row.name=text(c.name,'Empresa');
  if(s.companies.some(x=>x.id!==row.id&&x.name.toLocaleLowerCase()===row.name.toLocaleLowerCase()))bad('Já existe uma empresa com esse nome.');
 }else if(input.kind==='destinations'){
  if(Object.hasOwn(c,'companyId')){find(s,'companies',c.companyId);if(c.companyId!==row.companyId&&s.people.some(p=>p.destinationId===row.id))bad('Este destino possui colaboradores vinculados. Corrija o vínculo dos colaboradores antes de mudar a empresa.');row.companyId=c.companyId}
  for(const k of ['city','lodging','block','room'])if(Object.hasOwn(c,k))row[k]=text(c[k],k,k==='block'||k==='room'?40:100,k==='block'||k==='room');
 }else if(input.kind==='people'){
  if(Object.hasOwn(c,'companyId')){find(s,'companies',c.companyId);if(c.companyId!==row.companyId&&(s.pieces.some(p=>p.owner===row.id)||s.rols.some(r=>r.owner===row.id)))bad('A empresa não pode mudar enquanto houver peças ou rols vinculados a este colaborador.');row.companyId=c.companyId}
  if(Object.hasOwn(c,'destinationId'))row.destinationId=c.destinationId;
  if(find(s,'destinations',row.destinationId).companyId!==row.companyId)bad('O destino não pertence à empresa.');
  for(const k of ['name','mat'])if(Object.hasOwn(c,k))row[k]=text(c[k],k,k==='mat'?40:100);
  if(s.people.some(p=>p.id!==row.id&&p.companyId===row.companyId&&p.mat.toLocaleLowerCase()===row.mat.toLocaleLowerCase()))bad('Matrícula já cadastrada nesta empresa.');
 }else if(input.kind==='pieces'){
  if(Object.hasOwn(c,'owner')){const p=find(s,'people',c.owner);row.owner=p.id;row.companyId=p.companyId}
  if(Object.hasOwn(c,'type')){if(!['Camisa','Calça'].includes(c.type))bad('Tipo de peça inválido.');row.type=c.type}
  if((row.owner!==original.owner||row.type!==original.type)&&s.rols.some(r=>!r.dispatched&&r.records.some(x=>x.id===row.id)))bad('Esta peça está em um rol aberto. O vínculo e o tipo precisam permanecer compatíveis com a conferência em andamento.');
  // Freeze the original type on past movement records before changing the registry.
  if(row.type!==original.type)for(const r of s.rols)for(const x of r.records)if(x.id===row.id&&!x.pieceType)x.pieceType=original.type;
 }else{
  if(Object.hasOwn(c,'owner')&&c.owner!==row.owner){const p=find(s,'people',c.owner);if(row.records.length)bad('O colaborador não pode mudar em um rol que já recebeu peças.');row.owner=p.id;row.companyId=p.companyId;const d=find(s,'destinations',p.destinationId),company=find(s,'companies',p.companyId);row.snapshot={...d,name:p.name,mat:p.mat,company:company.name}}
  if(Object.hasOwn(c,'date')){if(typeof c.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(c.date)||!Number.isFinite(Date.parse(c.date+'T12:00:00Z'))||new Date(c.date+'T12:00:00Z').toISOString().slice(0,10)!==c.date||new Date(c.date+'T12:00:00Z').getUTCDay()===0)bad('Data da coleta inválida ou domingo fechado.');row.date=c.date}
  if(Object.hasOwn(c,'collectionTime')){if(typeof c.collectionTime!=='string'||c.collectionTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.collectionTime))bad('Horário de coleta inválido.');row.collectionTime=c.collectionTime}
  if(Object.hasOwn(c,'triageDate')&&c.triageDate!==row.triageDate){if(!c.triageDate)bad('Não é possível apagar uma triagem já definida.');Object.assign(row,returnDeadline(c.triageDate))}
  const collection=row.date+'T'+(row.collectionTime||'00:00')+':00-03:00';
  if(row.triageDate&&(row.triageDate<row.date||Date.parse(row.triageStartAt)<Date.parse(collection)))bad('A triagem não pode começar antes da coleta.');
  if(row.records.some(x=>x.receivedAt&&Date.parse(collection)>Date.parse(x.receivedAt)))bad('A coleta não pode ocorrer depois da entrada física já registrada.');
  if(row.triageStartAt&&row.records.some(x=>{const at=x.processingAt||x.readyAt||(['processing','ready','dispatched'].includes(x.status)?x.updatedAt:null);return at&&Date.parse(row.triageStartAt)>Date.parse(at)}))bad('A triagem não pode ocorrer depois do preparo já registrado.');
  for(const [key,type]of [['shirts','Camisa'],['pants','Calça']])if(Object.hasOwn(c,key)){if(!Number.isInteger(c[key])||c[key]<0||c[key]>1000)bad('Quantidade deve ser inteira, entre 0 e 1.000.');row.expected[type]=c[key]}
  if(row.expected.Camisa+row.expected['Calça']<1)bad('Declare pelo menos uma peça.');
  for(const type of ['Camisa','Calça']){const count=row.records.filter(x=>recordType(s,x)===type).length;if(row.expected[type]<count||row.dispatched&&row.expected[type]!==count)bad('A quantidade declarada deve preservar as peças recebidas e a conferência do envio.');}
  if(Object.hasOwn(c,'notes'))row.notes=text(c.notes,'Observações',180,true);
  if(Object.hasOwn(c,'snapshot')){const keys=['name','mat','company','city','lodging','block','room'];if(!c.snapshot||Array.isArray(c.snapshot)||Object.keys(c.snapshot).some(k=>!keys.includes(k)))bad('Dados registrados no rol inválidos.');for(const k of keys)if(Object.hasOwn(c.snapshot,k))row.snapshot[k]=text(c.snapshot[k],k,['mat','block','room'].includes(k)?40:100,['block','room'].includes(k));}
 }
 const changed=[];for(const kind of Object.keys(s))for(const after of s[kind]){const before=state[kind].find(x=>x.id===after.id);if(canonical(before)!==canonical(after))changed.push({kind,id:after.id,before,after})}
 if(!changed.length)bad('Nenhum campo foi alterado.');
 return {state:s,message:'Correção salva com histórico. IDs e movimentos preservados.',result:{id:row.id},correction:{kind:input.kind,id:row.id,reason:why,before:changed.map(x=>({kind:x.kind,id:x.id,data:x.before})),after:changed.map(x=>({kind:x.kind,id:x.id,data:x.after}))}};
}
