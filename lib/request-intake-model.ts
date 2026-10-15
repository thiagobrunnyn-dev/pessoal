import {RequestError} from './http-security';
import {guestText} from './guest-channel-model';
export const INTAKE_PRIVACY_VERSION='general-requests-v1';
export const INTAKE_KINDS={maintenance:'Solicitação de manutenção',purchase:'Pedido de compra'} as const;
export const INTAKE_STATUSES={received:'Recebida',reviewing:'Em análise',linked_order:'Encaminhada para OS',approved:'Compra aprovada pela gestão',closed:'Encerrada'} as const;
export type IntakeKind=keyof typeof INTAKE_KINDS;
export type IntakeValues={name:string;job_title:string;company:string;location:string;address:string;contact:string;description:string;cost_center:string;needed_on:string;items:{name:string;quantity:number;unit:string}[];privacy_accepted:true;privacy_version:string};
export function intakeKind(value:string):IntakeKind{if(!Object.hasOwn(INTAKE_KINDS,value))throw new RequestError('Formulário indisponível.',404);return value as IntakeKind;}
export function parseIntakeValues(kind:IntakeKind,input:unknown):IntakeValues{
 const allowed=['name','job_title','company','location','address','contact','description','cost_center','needed_on','items','privacy_accepted','privacy_version'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw new RequestError('Envie somente os campos do formulário.');
 const v=input as Record<string,unknown>;
 if(v.privacy_accepted!==true||v.privacy_version!==INTAKE_PRIVACY_VERSION)throw new RequestError('Confirme o envio das informações à gestão.');
 const result:IntakeValues={name:guestText(v.name,120,true),job_title:guestText(v.job_title,120,true),company:guestText(v.company,180,true),location:guestText(v.location,200,true),address:guestText(v.address??'',300,kind==='maintenance'),contact:guestText(v.contact??'',160),description:guestText(v.description,3000,true),cost_center:guestText(v.cost_center??'',180),needed_on:guestText(v.needed_on??'',10),items:[],privacy_accepted:true,privacy_version:INTAKE_PRIVACY_VERSION};
 if(result.name.length<2)throw new RequestError('Informe seu nome.');
 if(!Array.isArray(v.items)||v.items.length>20)throw new RequestError('Confira os itens do pedido.');
 if(kind==='purchase'){
  if(!v.items.length)throw new RequestError('Informe ao menos um item.');
  result.items=v.items.map((item:any)=>{if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['name','quantity','unit'].includes(k))||typeof item.quantity!=='number'||!Number.isFinite(item.quantity)||item.quantity<=0||item.quantity>100000||!/^\d+(?:\.\d{1,3})?$/.test(String(item.quantity)))throw new RequestError('Use quantidades positivas com até três casas decimais.');return {name:guestText(item.name,180,true),quantity:item.quantity,unit:guestText(item.unit??'',40)};});
  if(result.needed_on&&(!/^\d{4}-\d{2}-\d{2}$/.test(result.needed_on)||!Number.isFinite(new Date(result.needed_on+'T12:00:00Z').getTime())||new Date(result.needed_on+'T12:00:00Z').toISOString().slice(0,10)!==result.needed_on))throw new RequestError('Confira a data necessária.');
 }else if(v.items.length||result.needed_on||result.cost_center)throw new RequestError('Use o formulário de compra para itens e prazo de compra.');
 return result;
}
