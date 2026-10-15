import {getOperator,recheckOperator,operatorGuard} from '../../../../../lib/app-access';
import {first,bucket,noCache} from '../../../../../lib/maintenance';
import {sanitizePhoto} from '../../../../../lib/photo-privacy';

export const dynamic='force-dynamic';
const headers={...noCache,'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive'};

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const op=await getOperator();if(!op)return new Response('Acesso restrito',{status:401,headers});
  const {id}=await params;
  // Current-photo-only access. Historical assets need their separate, scoped service route.
  const photo=await first('SELECT a.object_key,a.content_type,p.id profile_id,p.revision profile_revision FROM person_photo_assets a JOIN person_profiles p ON p.id=a.profile_id AND p.owner_id=a.owner_id AND p.current_photo_asset_id=a.id WHERE a.id=? AND a.owner_id=?',id,op.ownerId);
  if(!photo)return new Response('Foto não encontrada',{status:404,headers});
  const object=await bucket().get(photo.object_key);
  if(!object)return new Response('Foto indisponível',{status:404,headers});
  const bytes=sanitizePhoto(await object.arrayBuffer(),photo.content_type);await recheckOperator(op);const guard=operatorGuard(op);if(!await first('SELECT id FROM person_profiles WHERE id=? AND owner_id=? AND revision=? AND current_photo_asset_id=? AND '+guard.sql,photo.profile_id,op.ownerId,photo.profile_revision,id,...guard.args))return new Response('Foto não encontrada',{status:404,headers});
  return new Response(bytes.buffer as ArrayBuffer,{headers:{...headers,'Content-Type':photo.content_type,'Content-Disposition':'inline'}});
 }catch{return new Response('Foto temporariamente indisponível',{status:503,headers});}
}
