import {NextResponse} from 'next/server';
import {supabaseServer} from '../../lib/supabase/server';
export const dynamic='force-dynamic';
function safeReturn(value:string|null){if(!value||!value.startsWith('/')||value.startsWith('//'))return '/';return value;}
/** Encerra a sessão (cookies do Supabase) e redireciona. Aceita GET para o link "Sair" e POST para formulários. */
async function signOut(request:Request){
 const url=new URL(request.url);const target=safeReturn(url.searchParams.get('return_to'));
 const response=NextResponse.redirect(new URL(target,url.origin),{status:303});
 try{const supabase=await supabaseServer();await supabase.auth.signOut({scope:'local'});}catch{}
 // Garante remoção mesmo se o SDK não conseguiu gravar: apaga todos os cookies sb-*.
 for(const c of request.headers.get('cookie')?.split(';')||[]){const name=c.split('=')[0].trim();if(name.startsWith('sb-'))response.cookies.set(name,'',{path:'/',maxAge:0});}
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const GET=signOut;
export const POST=signOut;
