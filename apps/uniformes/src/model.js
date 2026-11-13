export const empty=()=>({companies:[],destinations:[],people:[],pieces:[],rols:[]});
export class Invalid extends Error{constructor(message,status=400){super(message);this.status=status}}
const fail=m=>{throw new Invalid(m)};
const text=(v,name,max=100)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(`${name}: preencha de 1 a ${max} caracteres.`);return v.trim()};
const optional=(v,max=180)=>{if(v==null||v==='')return '';return text(v,'Texto',max)};
const num=(v,name)=>{if(!Number.isInteger(v)||v<0||v>1000)fail(`${name}: use um número inteiro entre 0 e 1.000.`);return v};
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(new Date(v+'T12:00:00Z').getTime())||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)fail('Data inválida.');return v};
const find=(list,id,name)=>list.find(x=>x.id===id)||fail(`${name} não encontrado neste cadastro.`);
const uid=(prefix)=>prefix+'-'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
export const businessDate=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Belem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
// Calendar arithmetic uses a UTC-shaped local clock, independent of the host timezone.
// Pará uses UTC-03:00 (America/Belem); Sundays contribute no hours.
export function returnDeadline(value){
 const triageDate=date(value);const clock=new Date(triageDate+'T09:00:00Z');
 if(clock.getUTCDay()===0)fail('Domingo fechado. Escolha uma data de início da triagem de segunda a sábado.');
 let remaining=48;
 while(remaining){if(clock.getUTCDay()!==0)remaining--;clock.setUTCHours(clock.getUTCHours()+1)}
 if(clock.getUTCFullYear()>9999)fail('Data fora do intervalo permitido.');
 const local=clock.toISOString().slice(0,19);
 return {triageDate,triageStartAt:triageDate+'T09:00:00-03:00',due:local.slice(0,10),dueAt:local+'-03:00',deadlineRule:'48h-excluding-sundays-v1',deadlineTimezone:'America/Belem'};
}
const collectionTime=v=>{if(v==null||v==='')return '';if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail('Horário de coleta inválido.');return v};
const collectionDate=v=>{const d=date(v);if(new Date(d+'T12:00:00Z').getUTCDay()===0)fail('Domingo fechado. A coleta ocorre de segunda a sábado.');return d};
export function act(state,input,mode,now){
 const s=structuredClone(state),type=input.type;let message='',result={};const newId=prefix=>{let id;do{id=uid(prefix)}while(Object.values(s).some(rows=>rows.some(x=>x.id===id)));return id};
 const log=(r,m)=>{r.events.unshift({time:now,message:m});r.events=r.events.slice(0,30)};
 if(type==='company'){const name=text(input.name,'Empresa');if(s.companies.some(x=>x.name.toLocaleLowerCase()===name.toLocaleLowerCase()))fail('Já existe uma empresa com esse nome.');const x={id:newId('EMP'),name};s.companies.push(x);message='Empresa cadastrada';result={id:x.id}}
 else if(type==='destination'){find(s.companies,input.companyId,'Empresa');const x={id:newId('DEST'),companyId:input.companyId,city:text(input.city,'Cidade'),lodging:text(input.lodging,'Destino/alojamento'),block:optional(input.block,40),room:optional(input.room,40)};s.destinations.push(x);message='Destino cadastrado';result={id:x.id}}
 else if(type==='person'){find(s.companies,input.companyId,'Empresa');const d=find(s.destinations,input.destinationId,'Destino');if(d.companyId!==input.companyId)fail('O destino não pertence a essa empresa.');const mat=text(input.mat,'Matrícula',40);if(s.people.some(x=>x.companyId===input.companyId&&x.mat.toLowerCase()===mat.toLowerCase()))fail('Matrícula já cadastrada nesta empresa.');const x={id:newId('P'),companyId:input.companyId,destinationId:d.id,name:text(input.name,'Nome'),mat};s.people.push(x);message='Colaborador cadastrado';result={id:x.id}}
 else if(type==='piece'){const p=find(s.people,input.owner,'Colaborador');if(!['Camisa','Calça'].includes(input.pieceType))fail('Tipo de peça inválido.');const x={id:newId('U'),owner:p.id,companyId:p.companyId,type:input.pieceType};s.pieces.push(x);message='Peça cadastrada com código permanente';result={id:x.id}}
 else if(type==='rol'){
  const person=find(s.people,input.owner,'Colaborador');
  const destination=find(s.destinations,person.destinationId,'Destino');
  const company=find(s.companies,person.companyId,'Empresa');
  const shirts=num(input.shirts,'Camisas'),pants=num(input.pants,'Calças');
  if(shirts+pants<1)fail('Declare pelo menos uma peça.');

  const collected=collectionDate(input.date);
  const deadline=returnDeadline(input.triageDate);
  const collectedTime=collectionTime(input.collectionTime);
  const collectionAt=`${collected}T${collectedTime||'00:00'}:00-03:00`;
  if(Date.parse(deadline.triageStartAt)<Date.parse(collectionAt)){
   fail('A triagem não pode começar antes da coleta. Se a coleta for após as 09:00, escolha um dia posterior para a triagem.');
  }

  const rol={
   id:newId('ROL'),owner:person.id,companyId:person.companyId,
   date:collected,collectionTime:collectedTime,...deadline,
   expected:{Camisa:shirts,'Calça':pants},records:[],notes:optional(input.notes),
   events:[{time:now,message:'Rol criado. Aguardando entrada física.'}],dispatched:false,
   snapshot:{...destination,name:person.name,mat:person.mat,company:company.name},
  };
  s.rols.push(rol);
  message='Rol criado';
  result={id:rol.id};
 }
 else if(['entry','exit','wash','ready','dispatch'].includes(type)){
  const r=find(s.rols,input.rolId,'Rol');if(r.dispatched)fail('Este rol já foi enviado.');const total=Object.values(r.expected).reduce((a,b)=>a+b,0);
  if(type==='entry'||type==='exit'){const code=text(input.code,'Código',64).toUpperCase();const p=find(s.pieces,code,'Código de peça');if(p.owner!==r.owner||p.companyId!==r.companyId)fail('Peça de outro colaborador ou empresa. Conferência bloqueada.');const old=r.records.find(x=>x.id===code);
   if(type==='entry'){if(old)fail('Leitura duplicada: esta peça já foi recebida no rol.');if(s.rols.some(a=>a.id!==r.id&&!a.dispatched&&a.records.some(x=>x.id===code)))fail('Esta peça está em outro rol aberto.');if(r.records.filter(x=>(x.pieceType||find(s.pieces,x.id,'Peça').type)===p.type).length>=r.expected[p.type])fail('Tipo ou quantidade não declarada neste rol.');r.records.push({id:code,pieceType:p.type,status:'received',checked:false,receivedAt:now});message=`${code} recebida para lavagem`;log(r,message)}
   else {if(!old)fail('Esta peça não foi recebida neste rol.');if(old.checked)fail('Leitura duplicada: saída já conferida.');if(old.status!=='ready')fail('A peça ainda não está limpa e separada.');old.checked=true;old.checkedAt=now;message=`${code} conferida para saída`;log(r,message)}
  }else if(type==='wash'||type==='ready'){const from=type==='wash'?'received':'processing',to=type==='wash'?'processing':'ready';const items=r.records.filter(x=>x.status===from);if(!items.length)fail('Não há peças na etapa anterior.');items.forEach(x=>{x.status=to;x.updatedAt=now;x[type==='wash'?'processingAt':'readyAt']=now});message=`${items.length} peça(s) ${type==='wash'?'em lavagem':'limpa(s) e separada(s)'}`;log(r,message)}
  else {if(r.records.length!==total)fail(`Envio bloqueado: declarado ${total}, recebido ${r.records.length}.`);if(r.records.some(x=>x.status!=='ready'||!x.checked))fail('Envio bloqueado: todas as peças precisam estar limpas e conferidas.');r.dispatched=true;r.dispatchedAt=now;r.records.forEach(x=>x.status='dispatched');message='Envio registrado. Não confirma entrega ao colaborador.';log(r,message)}result={id:r.id}
 }
 else if(type==='seed'){if(mode!=='demo')fail('Exemplos só podem ser criados no ambiente de teste.');if(Object.values(s).some(a=>a.length))fail('O ambiente de teste já contém dados.');const company={id:'FIC-EMP',name:'Empresa fictícia'};const destination={id:'FIC-DEST',companyId:company.id,city:'Canaã dos Carajás',lodging:'Alojamento fictício',block:'A',room:'101'};const p={id:'FIC-P01',name:'Colaborador fictício 01',mat:'FIC-001',companyId:company.id,destinationId:destination.id};s.companies.push(company);s.destinations.push(destination);s.people.push(p);s.pieces.push({id:'DEMO-001',owner:p.id,companyId:company.id,type:'Camisa'},{id:'DEMO-002',owner:p.id,companyId:company.id,type:'Calça'});s.rols.push({id:'ROL-DEMO',owner:p.id,companyId:company.id,date:businessDate(now),due:businessDate(now),expected:{Camisa:1,'Calça':1},records:[],notes:'Dados fictícios. Nenhuma peça real.',events:[{time:now,message:'Exemplo criado no ambiente isolado de teste.'}],dispatched:false,snapshot:{...destination,name:p.name,mat:p.mat,company:company.name}});message='Exemplos criados somente no teste';result={id:'ROL-DEMO'}}
 else fail('Ação inválida.');
 if(Object.values(s).some(a=>a.length>10000))fail('Limite deste piloto atingido. Exporte os dados e revise a capacidade antes de continuar.');
 return {state:s,message,result};
}
