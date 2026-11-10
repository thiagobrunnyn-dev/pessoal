import {NextResponse} from 'next/server';
import {supabaseServer} from '../../../lib/supabase/server';
export const dynamic='force-dynamic';
function safeReturn(value:string|null){if(!value||!value.startsWith('/')||value.startsWith('//')||value.startsWith('/entrar'))return '/';return value;}
/** Troca o `code` (link mágico/convite, fluxo PKCE) por sessão e grava os cookies. */
export async function GET(request:Request){
 const url=new URL(request.url);const code=url.searchParams.get('code');const target=safeReturn(url.searchParams.get('return_to'));
 if(!code)return NextResponse.redirect(new URL('/entrar',url.origin),{status:303});
 const supabase=await supabaseServer();
 const {error}=await supabase.auth.exchangeCodeForSession(code);
 const response=NextResponse.redirect(new URL(error?`/entrar?return_to=${encodeURIComponent(target)}`:target,url.origin),{status:303});
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
