import {publicCleaningPeoplePhoto} from '../../../../../../../lib/people-photo';
import {RequestError} from '../../../../../../../lib/http-security';
import {noCache} from '../../../../../../../lib/maintenance';
export async function GET(_request:Request,{params}:{params:Promise<{token:string;id:string}>}){try{const {token,id}=await params;return await publicCleaningPeoplePhoto(token,id);}catch(e){return new Response(e instanceof RequestError?e.message:'Foto indisponível.',{status:e instanceof RequestError?e.status:503,headers:noCache});}}
