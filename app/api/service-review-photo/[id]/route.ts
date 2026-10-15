import {reviewPeoplePhoto} from '../../../../lib/people-photo';
import {RequestError} from '../../../../lib/http-security';
import {noCache} from '../../../../lib/maintenance';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return await reviewPeoplePhoto(request,(await params).id);}catch(e){return new Response(e instanceof RequestError?e.message:'Foto indisponível.',{status:e instanceof RequestError?e.status:503,headers:noCache});}}
