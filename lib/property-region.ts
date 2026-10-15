import {isRegionalRequest} from './regional-access';
import {first,clean} from './maintenance';
import {RequestError} from './http-security';
import {BRAZIL_STATES} from './brazil-states';
export {BRAZIL_STATES} from './brazil-states';
export async function propertyRegion(ownerId:string,state:unknown,worksite:unknown,client:unknown=undefined,previousWorksiteId?:string|null){
 if(state!==null&&state!==undefined&&typeof state!=='string')throw new RequestError('Confira o estado do imóvel.');
 const uf=typeof state==='string'?state.trim().toUpperCase():'',id=clean(worksite,80)||null,requestedClient=clean(client,80)||null;
 if(uf&&!Object.hasOwn(BRAZIL_STATES,uf))throw new RequestError('Selecione um estado válido ou deixe a confirmar.');
 if(isRegionalRequest()&&uf!=='PA')throw new RequestError('Seu acesso permite cadastrar imóveis somente no Pará.',403);
 if(!id){if(requestedClient)throw new RequestError('Escolha o centro de custo da empresa ou deixe os dois campos sem vínculo.');return {state_code:uf||null,worksite_id:null,catalog_client_id:null,guard:{sql:'1',args:[] as unknown[]}};}
 if(client!==undefined&&!requestedClient)throw new RequestError('Escolha a empresa do centro de custo.');
 const historical=id===previousWorksiteId;
 const center=await first('SELECT c.id,c.client_id FROM cost_centers c JOIN clients p ON p.id=c.client_id AND p.owner_id=c.owner_id WHERE c.id=? AND c.owner_id=?'+(historical?'':' AND c.archived_at IS NULL AND p.archived_at IS NULL'),id,ownerId);
 if(!center||requestedClient&&requestedClient!==center.client_id)throw new RequestError('Escolha um centro de custo disponível da empresa selecionada.');
 return {state_code:uf||null,worksite_id:id,catalog_client_id:center.client_id as string,guard:{sql:'EXISTS(SELECT 1 FROM cost_centers c JOIN clients p ON p.id=c.client_id AND p.owner_id=c.owner_id WHERE c.id=? AND c.owner_id=? AND c.client_id=?'+(historical?'':' AND c.archived_at IS NULL AND p.archived_at IS NULL')+')',args:[id,ownerId,center.client_id] as unknown[]}};
}
