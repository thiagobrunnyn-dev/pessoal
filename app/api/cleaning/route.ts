import {createProperty} from '../../../lib/property-create';
import {isRegionalRequest} from '../../../lib/regional-access';
import {applyCorrection,correctionRow,businessSnapshot} from '../../../lib/corrections';
import {getOperator,recheckOperator,operatorGuard} from '../../../lib/app-access';
import {all,first,db,clean,validDate,noCache} from '../../../lib/maintenance';
import {boundedForm,requireSameOrigin,RequestError} from '../../../lib/http-security';
import {DEFAULT_CLEANING,FREQUENCIES} from '../../../lib/cleaning-catalog';
import {cleaningDetail} from '../../../lib/cleaning-data';
import {saveCleaning} from '../../../lib/cleaning-record';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>Response.json(d,{status,headers:noCache});
export async function GET(request:Request){try{const owner=await getOperator();if(!owner)return reply({error:'Acesso exclusivo do proprietário.'},401);const id=new URL(request.url).searchParams.get('id');if(id){const detail=await cleaningDetail(owner.ownerId,id,true);return detail?reply(detail):reply({error:'Local não encontrado.'},404);}return reply({regional:isRegionalRequest(),properties:await all('SELECT id,name,address,control_number,state_code FROM properties WHERE owner_id=? AND archived_at IS NULL ORDER BY name',owner.ownerId),locations:await all('SELECT l.id,l.name,l.property_id,l.catalog,p.name property_name,p.address,p.control_number property_control_number,p.state_code property_state_code FROM cleaning_locations l JOIN properties p ON p.id=l.property_id AND p.owner_id=l.owner_id WHERE l.owner_id=? AND l.archived_at IS NULL AND p.archived_at IS NULL ORDER BY p.name,l.name',owner.ownerId)});}catch{return reply({error:'Não foi possível carregar os locais.'},503);}}
export async function POST(request:Request){try{const owner=await getOperator();if(!owner)return reply({error:'Acesso exclusivo do proprietário.'},401);requireSameOrigin(request);const form=await boundedForm(request,25*1024*1024),action=clean(form.get('action')),id=clean(form.get('location_id'),80),now=new Date().toISOString();await recheckOperator(owner);const auth=operatorGuard(owner);
 if(action==='property')return reply(await createProperty(owner,form));
 if(action==='location'){const property=clean(form.get('property_id'),80),name=clean(form.get('name'),120);if(!name||!await first('SELECT id FROM properties WHERE id=? AND owner_id=?',property,owner.ownerId))throw new RequestError('Selecione o imóvel e informe o ambiente/local.');const newId=crypto.randomUUID();const result=await db().prepare('INSERT INTO cleaning_locations (id,owner_id,property_id,name,catalog,created_at) SELECT ?,?,?,?,?,? WHERE '+auth.sql).bind(newId,owner.ownerId,property,name,JSON.stringify(DEFAULT_CLEANING),now,...auth.args).run();if(!result.meta.changes)throw new RequestError('Acesso operacional encerrado.',401);return reply({id:newId});}
 if(!await first('SELECT id FROM cleaning_locations WHERE id=? AND owner_id=?',id,owner.ownerId))throw new RequestError('Local não encontrado.',404);
 if(action==='record')return reply(await saveCleaning(form,owner.ownerId,id,undefined,owner));
 if(action==='catalog'){const current=await correctionRow(owner.ownerId,'cleaning_location',id);if(!current)throw new RequestError('Local não encontrado.',404);let catalog;try{catalog=JSON.parse(String(form.get('catalog')));}catch{throw new RequestError('Confira as rotinas.');}return reply(await applyCorrection(owner,{entity:'cleaning_location',id,expected_revision:Number(form.get('expected_revision')),request_id:form.get('request_id'),reason:form.get('reason'),confirmed:form.get('confirmed')==='yes',values:{...businessSnapshot('cleaning_location',current),catalog}}));}

 throw new RequestError('Ação inválida.');
 }catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível salvar. Seu formulário continua disponível.'},e instanceof RequestError?e.status:503);}}
