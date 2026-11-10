'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {supabaseBrowser} from '../../lib/supabase/browser';

function safeReturn(value:string|null){if(!value||!value.startsWith('/')||value.startsWith('//')||value.startsWith('/entrar')||value.startsWith('/sair'))return '/';return value;}

export default function SignIn({returnTo}:{returnTo:string|null}){
 const target=safeReturn(returnTo);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[checking,setChecking]=useState(true);
 // Sessão já existente (ou token renovado pelo cliente): segue direto.
 useEffect(()=>{let active=true;(async()=>{try{const {data}=await supabaseBrowser().auth.getSession();if(active&&data.session){window.location.replace(target);return;}}catch{}if(active)setChecking(false);})();return()=>{active=false;};},[target]);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError(null);setNotice(null);try{const {error}=await supabaseBrowser().auth.signInWithPassword({email:email.trim().toLowerCase(),password});if(error)throw error;window.location.replace(target);}catch(err){setError(message(err));setBusy(false);}}
 async function magicLink(){const address=email.trim().toLowerCase();if(!address){setError('Informe o e-mail para receber o link.');return;}setBusy(true);setError(null);try{const {error}=await supabaseBrowser().auth.signInWithOtp({email:address,options:{emailRedirectTo:`${window.location.origin}/auth/callback?return_to=${encodeURIComponent(target)}`,shouldCreateUser:false}});if(error)throw error;setNotice('Se este e-mail tiver acesso, um link de entrada foi enviado. Verifique sua caixa de entrada.');}catch(err){setError(message(err));}finally{setBusy(false);}}
 return <><header className="topbar"><a href="/" className="brand"><img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza"/><span>MOBILIZA GESTÃO<br/><strong>Entrar</strong></span></a></header>
 <main className="tech-shell"><section className="panel" style={{maxWidth:440,margin:'0 auto'}}><div className="section-heading"><div><div className="eyebrow">ACESSO</div><h1>Entrar na gestão</h1></div></div>
 {checking?<p className="muted">Verificando sessão…</p>:<form onSubmit={submit} noValidate>
  <label className="field">E-mail<input type="email" name="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>
  <label className="field">Senha<input type="password" name="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>
  <div className="form-actions"><button className="button" type="submit" disabled={busy}>{busy?'Entrando…':'Entrar'}</button><button className="button secondary" type="button" onClick={magicLink} disabled={busy}>Receber link por e-mail</button></div>
  {notice&&<p className="clean-inset">{notice}</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  <p className="muted" style={{marginTop:18}}>O acesso é liberado pelo administrador. Não há cadastro público.</p>
 </form>}</section></main></>;
}
function message(err:unknown){const m=err instanceof Error?err.message:String(err);if(/invalid login credentials/i.test(m))return 'E-mail ou senha inválidos.';if(/email not confirmed/i.test(m))return 'E-mail ainda não confirmado.';if(/rate limit/i.test(m))return 'Muitas tentativas. Aguarde um instante.';if(/signups not allowed|not allowed/i.test(m))return 'Este e-mail não tem acesso liberado.';return 'Não foi possível entrar. Tente novamente.';}
