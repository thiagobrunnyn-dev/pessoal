import {sanitizePhoto} from '../../../../lib/photo-privacy';
import {getOperator} from '../../../../lib/app-access';
import {first,bucket,noCache} from '../../../../lib/maintenance';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 try{const user=await getOperator();if(!user)return new Response('Acesso restrito',{status:401,headers:noCache});const {id}=await params;
 const equipment=await first('SELECT identification_photo_key,identification_photo_type FROM equipment WHERE id=? AND owner_id=?',id,user.ownerId);
 if(!equipment?.identification_photo_key)return new Response('Foto não encontrada',{status:404,headers:noCache});
 const photo=await bucket().get(equipment.identification_photo_key);if(!photo)return new Response('Foto indisponível',{status:404,headers:noCache});
 return new Response(sanitizePhoto(await photo.arrayBuffer(),equipment.identification_photo_type).buffer as ArrayBuffer,{headers:{...noCache,'Content-Type':equipment.identification_photo_type,'Content-Disposition':'inline'}});
 }catch(e){console.error('Identification photo read',e);return new Response('Foto temporariamente indisponível',{status:503,headers:noCache});}
}
