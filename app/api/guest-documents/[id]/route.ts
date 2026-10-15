import {readGuestDocument} from '../../../../lib/guest-documents';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return readGuestDocument(request,(await params).id);}
