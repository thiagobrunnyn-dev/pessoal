import {getVisit,limitVisitWrite} from '../../../../lib/visit-security';
import {boundedForm,requireSameOrigin,RequestError} from '../../../../lib/http-security';
import {saveMaintenance} from '../../../../lib/maintenance-record';
import {noCache} from '../../../../lib/maintenance';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{requireSameOrigin(request);const visit=await getVisit(request);if(!visit)return Response.json({error:'Seu acesso expirou ou foi encerrado.'},{status:401,headers:noCache});await limitVisitWrite(visit);const form=await boundedForm(request,25*1024*1024);if(form.get('equipment_id')!==visit.equipment_id)throw new RequestError('Acesso não autorizado a este aparelho.',403);const result=await saveMaintenance(form,{ownerId:visit.owner_id,equipmentId:visit.equipment_id,visit});return Response.json(result,{headers:noCache});}catch(e){return Response.json({error:e instanceof RequestError?e.message:'Não foi possível salvar. Confira o acesso e tente novamente.'},{status:e instanceof RequestError?e.status:503,headers:noCache});}}
