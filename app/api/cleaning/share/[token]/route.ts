import {getCleaningShare} from '../../../../../lib/cleaning-security';
import {cleaningDetail} from '../../../../../lib/cleaning-data';
import {noCache} from '../../../../../lib/maintenance';
export const dynamic='force-dynamic';
export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){try{const {token}=await params,share=await getCleaningShare(token);if(!share)return Response.json({error:'Link indisponível ou desativado.'},{status:404,headers:noCache});const data=await cleaningDetail(share.owner_id,share.id,false,token);if(data)delete data.item.address;return Response.json(data,{headers:{...noCache,'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive'}});}catch{return Response.json({error:'Consulta temporariamente indisponível.'},{status:503,headers:noCache});}}
