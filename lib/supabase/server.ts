import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';

/** Cliente de servidor com acesso aos cookies da requisição (uso: callback de login e logout). */
export async function supabaseServer(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.');
 const store=await cookies();
 return createServerClient(url,key,{cookies:{getAll(){return store.getAll();},setAll(list){try{for(const {name,value,options} of list)store.set(name,value,options);}catch{/* fora de contexto gravável (Server Component): ignorado */}}}});
}
