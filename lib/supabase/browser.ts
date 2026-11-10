import {createBrowserClient} from '@supabase/ssr';

/** Cliente do navegador (chave publicável/anon). A sessão fica em cookies `sb-<ref>-auth-token`, lidos pelo servidor. */
export function supabaseBrowser(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.');
 return createBrowserClient(url,key);
}
