import {sanitizePhoto} from '../../../../lib/photo-privacy';
import {getOperator} from '../../../../lib/app-access';
import {first,bucket,noCache} from '../../../../lib/maintenance';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 try{const user=await getOperator();if(!user)return new Response('Acesso restrito',{status:401,headers:noCache});const {id}=await params;
 const photo=await first('SELECT * FROM photos WHERE id=? AND owner_id=?',id,user.ownerId);if(!photo)return new Response('Foto não encontrada',{status:404,headers:noCache});const object=await bucket().get(photo.object_key);if(!object)return new Response('Foto indisponível',{status:404,headers:noCache});return new Response(sanitizePhoto(await object.arrayBuffer(),photo.content_type).buffer as ArrayBuffer,{headers:{...noCache,'Content-Type':photo.content_type,'Content-Disposition':'inline'}});
 }catch(e){console.error(e);return new Response('Foto temporariamente indisponível',{status:503,headers:noCache});}
}
