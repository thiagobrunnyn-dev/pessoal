import {createProperty} from '../../../lib/property-create';
import {belemToday} from '../../../lib/dashboard-period';
import {applyCorrection,businessSnapshot,correctionRow} from '../../../lib/corrections';
import {checklistSnapshot} from '../../../lib/checklist';
import {controlData} from '../../../lib/control-data';
import {editEquipment} from '../../../lib/equipment-edit';
import {privateRecordLocations} from '../../../lib/service-location';
import {getOperator,recheckOperator,operatorGuard} from '../../../lib/app-access';
import {boundedForm,RequestError} from '../../../lib/http-security';
import {all,first,db,bucket,clean,validDate,addDays,noCache} from '../../../lib/maintenance';
import {recomputeSchedule} from '../../../lib/maintenance-schedule';
import {saveMaintenance} from '../../../lib/maintenance-record';
import {readIdentificationPhoto,PhotoValidationError,equipmentForClient} from '../../../lib/identification-photo';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:noCache});
export async function GET(request:Request){try{const user=await getOperator();if(!user)return reply({error:'Entre na sua conta para continuar.'},401);const data=await controlData(user.ownerId,new URL(request.url).searchParams.get('id'));return data?reply(data):reply({error:'Equipamento não encontrado.'},404);}catch{return reply({error:'Não foi possível carregar os dados. Tente novamente.'},503);}}
export async function POST(request:Request){
 let uploaded:string[]=[];
 try{
 const user=await getOperator();if(!user)return reply({error:'Entre na sua conta para continuar.'},401);
 const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin)return reply({error:'Origem inválida.'},403);
 if(Number(request.headers.get('content-length')||0)>25*1024*1024)return reply({error:'Envie até 6 fotos de até 4 MB cada.'},413);
 const form=await boundedForm(request,25*1024*1024),action=clean(form.get('action')),now=new Date().toISOString();await recheckOperator(user);const auth=operatorGuard(user);
 if(action==='edit_equipment')return reply(await editEquipment(form,user));
 if(action==='property')return reply(await createProperty(user,form));
 if(action==='equipment'){
 const propertyId=clean(form.get('property_id')),name=clean(form.get('name'),100),location=clean(form.get('location'),120),baseline=clean(form.get('baseline_date'),40)||null;
 const property=await first('SELECT * FROM properties WHERE id=? AND owner_id=?',propertyId,user.ownerId);if(!property)return reply({error:'Selecione um imóvel cadastrado.'},400);
 if(!name||!location)return reply({error:'Informe identificação e ambiente do equipamento.'},400);
 if(baseline&&(!validDate(baseline)||baseline>belemToday()))return reply({error:'A última limpeza deve ser uma data válida, hoje ou anterior.'},400);
 const checklist=clean(form.get('checklist'),4000).split('\n').map(s=>s.trim()).filter(Boolean).slice(0,20);const id=crypto.randomUUID();
 const labelPhoto=await readIdentificationPhoto(form);let labelKey:string|null=null;
 if(labelPhoto){labelKey=`identification/${user.ownerId}/${id}/${crypto.randomUUID()}`;await bucket().put(labelKey,labelPhoto.bytes,{httpMetadata:{contentType:labelPhoto.type,cacheControl:'private, no-store'}});uploaded.push(labelKey);}
 const created=await db().batch([
 db().prepare('INSERT INTO equipment (id,owner_id,property_id,name,location,brand_model,serial,baseline_date,checklist,created_at,identification_photo_key,identification_photo_type,identification_photo_size,identification_photo_created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE '+auth.sql+' AND EXISTS(SELECT 1 FROM properties WHERE id=? AND owner_id=? AND revision=?)').bind(id,user.ownerId,propertyId,name,location,clean(form.get('brand_model'),150),clean(form.get('serial'),100),baseline,JSON.stringify(checklist),now,labelKey,labelPhoto?.type??null,labelPhoto?.size??null,labelPhoto?now:null,...auth.args,propertyId,user.ownerId,property.revision),
 db().prepare('INSERT INTO maintenance_schedule (equipment_id,owner_id,equipment_name,property_name,address,location,last_service_date,due_date,alert_date,interval_days,alert_days_before,cycle_id,updated_at) SELECT ?,?,?,?,?,?,?,?,?,90,5,?,? WHERE EXISTS(SELECT 1 FROM equipment WHERE id=? AND owner_id=?)').bind(id,user.ownerId,name,property.name,property.address,location,baseline,baseline?addDays(baseline,90):null,baseline?addDays(baseline,85):null,baseline?'baseline:'+id+':'+baseline:null,now,id,user.ownerId)]);if(!created[0].meta.changes){await recheckOperator(user);throw new RequestError('O imóvel foi alterado. Atualize a lista e confira antes de salvar.',409);}uploaded=[];return reply({id});
 }
 if(action==='identification_photo'){
 const equipmentId=clean(form.get('equipment_id'));
 const equipment=await first('SELECT id,identification_photo_key FROM equipment WHERE id=? AND owner_id=?',equipmentId,user.ownerId);
 if(!equipment)return reply({error:'Equipamento não encontrado.'},404);
 if(equipment.identification_photo_key)return reply({id:equipmentId,alreadySaved:true});
 const photo=await readIdentificationPhoto(form,true);const key=`identification/${user.ownerId}/${equipmentId}/${crypto.randomUUID()}`;
 await bucket().put(key,photo!.bytes,{httpMetadata:{contentType:photo!.type,cacheControl:'private, no-store'}});uploaded.push(key);
 const result=await db().prepare('UPDATE equipment SET identification_photo_key=?,identification_photo_type=?,identification_photo_size=?,identification_photo_created_at=? WHERE id=? AND owner_id=? AND identification_photo_key IS NULL AND '+auth.sql).bind(key,photo!.type,photo!.size,now,equipmentId,user.ownerId,...auth.args).run();
 if(!result.meta.changes){await recheckOperator(user);await bucket().delete(key);uploaded=[];return reply({id:equipmentId,alreadySaved:true});}
 uploaded=[];return reply({id:equipmentId});
 }
 if(action==='classify_maintenance'){const id=clean(form.get('record_id'),60),flag=form.get('is_test');if(flag!=='0'&&flag!=='1')throw new RequestError('Classificação inválida.');const current=await correctionRow(user.ownerId,'maintenance',id);if(!current)throw new RequestError('Registro não encontrado.',404);const result=await applyCorrection(user,{entity:'maintenance',id,expected_revision:Number(form.get('expected_revision')),request_id:form.get('request_id'),reason:flag==='1'?'Classificado como teste pelo usuário':'Restaurado como real pelo usuário',confirmed:true,values:{...businessSnapshot('maintenance',current),checklist:checklistSnapshot(current.checklist),is_test:flag==='1'}});return reply({...result,isTest:flag==='1'});}
 if(action==='checklist_settings'){const id=clean(form.get('equipment_id'),80),current=await first('SELECT * FROM equipment WHERE id=? AND owner_id=?',id,user.ownerId);if(!current)throw new RequestError('Equipamento não encontrado.',404);const edit=new FormData();for(const k of ['property_id','name','location','brand_model','serial'])edit.set(k,current[k]);for(const k of ['expected_revision','request_id','reason','confirmed','checklist'])edit.set(k,String(form.get(k)||''));edit.set('equipment_id',id);return reply(await editEquipment(edit,user));}
 if(action==='maintenance'){return reply(await saveMaintenance(form,{ownerId:user.ownerId,equipmentId:clean(form.get('equipment_id')),operator:user}));}
 return reply({error:'Ação desconhecida.'},400);
 }catch(e){if(uploaded.length){try{await bucket().delete(uploaded);}catch{console.error('Temporary upload cleanup failed');}}if(e instanceof RequestError)return reply({error:e.message},e.status);if(e instanceof PhotoValidationError)return reply({error:e.message},400);console.error('Save maintenance',e);return reply({error:'Não foi possível salvar. Seus dados continuam no formulário. Tente novamente.'},503);}
}
