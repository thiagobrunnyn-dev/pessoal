import {acceptanceDescriptor,executionPrincipal,saveAcceptance} from '../../../lib/execution-acceptance';
import {serviceEntity} from '../../../lib/service-people';
import {boundedForm,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {noCache} from '../../../lib/maintenance';
const reply=(d:unknown,status=200)=>Response.json(d,{status,headers:noCache});
export async function GET(request:Request){try{const q=new URL(request.url).searchParams,type=serviceEntity(q.get('type')),principal=await executionPrincipal(request,type);return reply(await acceptanceDescriptor(principal,type,q.get('id')||''));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível abrir o aceite.'},e instanceof RequestError?e.status:503);}}
export async function POST(request:Request){try{requireSameOrigin(request);const form=await boundedForm(request,400_000),type=serviceEntity(form.get('type')),principal=await executionPrincipal(request,type);return reply(await saveAcceptance(principal,form));}catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível salvar. A assinatura continua no formulário.'},e instanceof RequestError?e.status:503);}}
