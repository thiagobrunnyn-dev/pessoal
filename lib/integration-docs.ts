import rawCatalog from './integration-catalog.json';
export type Endpoint={path:string;title:string;methods:string[];body:string;description:string;query:string[];fields:string[];actions:string[]};
export const integrationCatalog:Endpoint[]=rawCatalog;
export const API_PREFIX='/api/integrations/v1';
export const DEFAULT_ORIGIN='https://mobiliza.example.invalid';
export const exampleClient={action:'client',name:'NOME DA EMPRESA',entity_type:'external_client',request_id:'11111111-1111-4111-8111-111111111111'};
export const exampleArchive={entity:'equipment',id:'ID_OBTIDO_NA_CONSULTA',expected_revision:0,request_id:'22222222-2222-4222-8222-222222222222',reason:'Motivo do arquivamento',confirmed:true};
export function integrationOpenApi(origin:string){
 const paths:Record<string,unknown>={};
 for(const endpoint of integrationCatalog){
  const operations:Record<string,unknown>={};
  for(const method of endpoint.methods){
   const description=endpoint.description+(method==='POST'&&endpoint.actions.length?' Ações do módulo: '+endpoint.actions.join(', ')+'.':'')+(method==='DELETE'?' Arquivamento reversível. Não exclui fisicamente registros ou evidências.':'');
   const parameters=[...(endpoint.path.includes('{id}')?[{name:'id',in:'path',required:true,schema:{type:'string'},description:'Identificador obtido em uma consulta autorizada.'}]:[]),...(method==='GET'?endpoint.query.map(name=>({name,in:'query',schema:{type:'string'}})):[])];
   operations[method.toLowerCase()]={summary:endpoint.title,description,operationId:method.toLowerCase()+'_'+endpoint.path.replace(/[^a-z0-9]+/g,'_'),parameters,security:[{bearerAuth:[]}],...(method!=='GET'?{requestBody:{required:true,description:'Campos e obrigatoriedade variam por ação. Mantenha as revisões e identificadores retornados pelo módulo. Campos de referência: '+endpoint.fields.join(', '),content:{[method==='DELETE'?'application/json':endpoint.body]:{schema:{type:'object',additionalProperties:true},...(endpoint.path==='handovers'?{example:exampleClient}:endpoint.path==='archive'?{example:method==='DELETE'?exampleArchive:{...exampleArchive,action:'restore'}}:{})}}}}:{}),responses:{'200':{description:'Resultado confirmado pelo módulo; estrutura depende da operação.'},'400':{description:'Confira os campos informados; a resposta contém error.'},'401':{description:'Token ausente, inválido, expirado ou revogado.'},'403':{description:'Credencial sem permissão de escrita ou chamada originada de navegador.'},'404':{description:'Registro ou rota indisponível.'},'409':{description:'Revisão, vínculo ou request_id em conflito.'},'413':{description:'Corpo ou arquivo acima do limite do módulo.'},'415':{description:'Content-Type incompatível.'},'429':{description:'Limite de 120 chamadas por minuto. Aguarde Retry-After.'},'503':{description:'Resultado não confirmado. Consulte antes de repetir.'}}};
  }
  paths['/'+endpoint.path]=operations;
 }
 paths['/access']={get:{summary:'Validar conexão e consultar permissão',security:[{bearerAuth:[]}],responses:{'200':{description:'connected, name, permission e api_version'}}},delete:{summary:'Revogar a própria credencial',security:[{bearerAuth:[]}],responses:{'200':{description:'revoked: true; chamadas seguintes retornam 401'}}}};
 paths['/openapi']={get:{summary:'Baixar esta especificação',security:[{bearerAuth:[]}],responses:{'200':{description:'OpenAPI 3.0.3'}}}};
 return {openapi:'3.0.3',info:{title:'Mobiliza — Integração n8n',version:'1.0.0',description:'API operacional. GET consulta; POST cria ou altera; DELETE /archive arquiva, DELETE /access revoga o token. Sem exclusão definitiva. Permissões read e write; write inclui consulta. Nenhum token é incluído nesta especificação.'},servers:[{url:origin+API_PREFIX}],components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',description:'Credencial criada pelo administrador em Configurações. Nunca use cookies ou headers de identidade.'}}},paths};
}
export function n8nStarter(origin:string){return {name:'Mobiliza — verificar conexão',nodes:[{parameters:{},id:'manual',name:'Executar manualmente',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[260,300]},{parameters:{method:'GET',url:origin+API_PREFIX+'/access',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{}},id:'mobiliza',name:'Verificar acesso Mobiliza',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[500,300]}],connections:{'Executar manualmente':{main:[[{node:'Verificar acesso Mobiliza',type:'main',index:0}]]}},active:false,settings:{executionOrder:'v1'}};}
