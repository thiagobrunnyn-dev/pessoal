import {first} from './maintenance';
import {RequestError} from './http-security';
import type {Operator} from './app-access';
type Row=Record<string,string|number|null>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function personAssignmentInput(form:FormData, original:Row|null){
  const supplied=form.has('client_id')||form.has('cost_center_id');
  if(!supplied)return {supplied:false,client_id:original?.client_id||null,cost_center_id:original?.cost_center_id||null};
  if(!form.has('client_id')||!form.has('cost_center_id'))throw new RequestError('Confira a empresa e o centro de custo juntos.');
  function id(key:string){const values=form.getAll(key);if(values.length!==1||typeof values[0]!=='string'||values[0]!==''&&!UUID.test(values[0]))throw new RequestError('Escolha uma opção válida de empresa e centro de custo.');return values[0]||null;}
  const client_id=id('client_id'),cost_center_id=id('cost_center_id');
  if(cost_center_id&&!client_id)throw new RequestError('Escolha a empresa correspondente ao centro de custo.');
  return {supplied:true,client_id,cost_center_id};
}
export async function personAssignmentGuards(op:Operator,next:Row,original:Row|null,supplied:boolean){
  const guards:string[]=[],args:unknown[]=[];
  if(!supplied||original&&next.client_id===(original.client_id||null)&&next.cost_center_id===(original.cost_center_id||null))return {guards,args};
  if(!next.client_id)return {guards,args};
  const client=await first('SELECT id,revision FROM clients WHERE id=? AND owner_id=? AND archived_at IS NULL',next.client_id,op.ownerId);
  if(!client)throw new RequestError('Escolha uma empresa disponível neste acesso.');
  guards.push('EXISTS(SELECT 1 FROM clients WHERE id=? AND owner_id=? AND revision=? AND archived_at IS NULL)');args.push(client.id,op.ownerId,client.revision);
  if(next.cost_center_id){
    const center=await first('SELECT id,revision FROM cost_centers WHERE id=? AND owner_id=? AND client_id=? AND archived_at IS NULL',next.cost_center_id,op.ownerId,next.client_id);
    if(!center)throw new RequestError('Escolha um centro de custo disponível da empresa selecionada.');
    guards.push('EXISTS(SELECT 1 FROM cost_centers WHERE id=? AND owner_id=? AND client_id=? AND revision=? AND archived_at IS NULL)');args.push(center.id,op.ownerId,next.client_id,center.revision);
  }
  return {guards,args};
}
export function visiblePersonAssignment(row:Row){
  const assigned=!!(row.client_id||row.cost_center_id);
  const visible=!assigned||!!row.visible_client_id&&(!row.cost_center_id||!!row.visible_center_id);
  return {has_assignment:assigned,assignment_unavailable:assigned&&!visible,
    client_id:visible?row.visible_client_id||null:null,cost_center_id:visible?row.visible_center_id||null:null,
    client:visible&&row.visible_client_id?{id:row.visible_client_id,name:row.visible_client_name,entity_type:row.visible_client_type,archived:!!row.client_archived_at}:null,
    cost_center:visible&&row.visible_center_id?{id:row.visible_center_id,client_id:row.visible_client_id,name:row.visible_center_name,archived:!!row.center_archived_at}:null};
}
