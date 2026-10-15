import {getOperator} from '../../../lib/app-access';
import {controlData} from '../../../lib/control-data';
import Control from '../../control';
import Technician from '../../technician';
import EquipmentPublic from '../../equipment-public';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{acesso?:string}>}){const {id}=await params,{acesso}=await searchParams,op=await getOperator();return op?<Control key={id} initialData={await controlData(op.ownerId,id).catch(()=>null)} equipmentId={id} displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} canManageAccess={op.role==='owner'}/>:acesso==='tecnico'?<Technician key={id} equipmentId={id}/>:<EquipmentPublic key={id} equipmentId={id}/>;}
