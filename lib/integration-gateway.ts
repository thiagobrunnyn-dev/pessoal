import {integrationCatalog,integrationOpenApi} from './integration-docs';
import {integrationHandlers} from './integration-handlers';
import {authenticateIntegration,integrationError,integrationReply} from './integration-keys';
import {withIntegration,integrationOperator} from './integration-context';
import {boundedJson,RequestError} from './http-security';
import {db} from './maintenance';
import {recheckOperator} from './app-access';

export function matchIntegrationPath(path:string){
 for(const endpoint of integrationCatalog){const pattern=endpoint.path.split('/'),parts=path.split('/');if(pattern.length!==parts.length)continue;let id='';if(pattern.every((part,i)=>part==='{id}'?(id=parts[i],/^[\w-]{1,100}$/.test(id)):part===parts[i]))return {endpoint,id};}
 return null;
}
export async function integrationGateway(request:Request,{params}:{params:Promise<{path:string[]}>}){
 try{
  const grant=await authenticateIntegration(request),segments=(await params).path;
  if(!segments||segments.some(p=>!p||p==='.'||p==='..'||p.includes('/')))throw new RequestError('Rota inválida.',404);
  const path=segments.join('/'),method=request.method,url=new URL(request.url);
  if(path==='access'){
   if(method==='GET')return integrationReply({connected:true,name:grant.name,permission:grant.permission,api_version:'1.0.0'});
   if(method==='DELETE'){await db().prepare('UPDATE integration_keys SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND owner_id=?').bind(new Date().toISOString(),grant.id,grant.ownerId).run();return integrationReply({revoked:true});}
   throw new RequestError('Use GET para consultar ou DELETE para revogar esta credencial.',405);
  }
  if(path==='openapi'&&method==='GET')return integrationReply(integrationOpenApi(url.origin));
  const match=matchIntegrationPath(path);if(!match)throw new RequestError('Endpoint não disponível para integrações. Consulte Configurações.',404);
  if(!match.endpoint.methods.includes(method))return integrationReply({error:'Método não disponível neste endpoint.'},405,{Allow:match.endpoint.methods.join(', ')});
  if(method!=='GET'&&grant.permission!=='write')throw new RequestError('Esta credencial permite somente consultas.',403);
  const handler=integrationHandlers[match.endpoint.path]?.[method==='DELETE'?'POST':method as 'GET'|'POST'];if(!handler)throw new RequestError('Método indisponível.',405);
  // Direct invocation of a fixed handler, with a server-created origin. No internal fetch,
  // dispatcher identity spoofing, arbitrary URL proxy or browser authentication fallback.
  const forwardedHeaders=new Headers();for(const key of ['content-type','content-length']){const value=request.headers.get(key);if(value)forwardedHeaders.set(key,value);}
  forwardedHeaders.set('origin',url.origin);
  let body:BodyInit|null|undefined=request.body;
  if(method==='DELETE'){
   const data=await boundedJson(request,8000);
   if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['entity','id','expected_revision','request_id','reason','confirmed'].includes(k)))throw new RequestError('Confira os campos do arquivamento.');
   body=JSON.stringify({...data,action:'archive'});forwardedHeaders.set('content-type','application/json');forwardedHeaders.delete('content-length');
  }
  const target=url.origin+'/api/'+path+url.search;
  const forwarded=new Request(target,{method:method==='DELETE'?'POST':method,headers:forwardedHeaders,...(method==='GET'?{}:{body,duplex:'half'})} as RequestInit);
  return await withIntegration(grant,async()=>{const response=await handler(forwarded,{params:Promise.resolve({id:match.id})});await recheckOperator(integrationOperator(grant));return response;});
 }catch(error){return integrationError(error);}
}
