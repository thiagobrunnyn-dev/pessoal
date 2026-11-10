'use client';

import {useEffect,useState} from 'react';
import {ArrowLeft,Copy,KeyRound,RefreshCw,UserRound} from 'lucide-react';
import {isMemberRole,isSupabaseMemberId,MEMBER_ROLES} from '../lib/member-roles';
import TeamSignOut from './components/team-sign-out';
import CreatePasswordMember from './equipe/create-password-member';

type Data=Record<string,any>;
type IssuedInvite={email:string;code:string;expiresAt:Date};
const inviteTime=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Belem'});

export default function MemberAccess({owner=false,teamSession=false,passwordAuth=false}:{owner?:boolean;teamSession?:boolean;passwordAuth?:boolean}){
 const [data,setData]=useState<Data|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [invite,setInvite]=useState<IssuedInvite|null>(null);
 const [generatingEmail,setGeneratingEmail]=useState('');
 const [inviteError,setInviteError]=useState<{email:string;message:string}|null>(null);
 const [copyStatus,setCopyStatus]=useState('');

 async function load(){
  setError('');
  try{
   const r=await fetch('/api/members'+(owner?'':'?self=1'),{cache:'no-store'});
   const d=await r.json() as Data;
   if(!r.ok)throw new Error(d.error);
   setData(d);
  }catch(e){setError((e as Error).message);}
 }
 useEffect(()=>{void load();},[owner]);

 async function act(action:string,userId?:string,name?:string){
  if(action==='approve'&&!confirm(`Confirme com ${name} que esta é a conta dele. Ao liberar, ele poderá gerenciar cadastros, rotinas e registros das centrais e da limpeza. Publicação, membros e códigos continuam com Administrador. Gestores podem ativar o QR de consulta da Limpeza. Liberar?`))return;
  if(action==='revoke'&&!confirm('Encerrar o acesso operacional desta conta? Os registros e fotos serão preservados.'))return;
  setBusy(true);
  setError('');
  setInvite(null);
  try{
   const r=await fetch('/api/members',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,user_id:userId,confirmed:action==='approve'}),
   });
   const d=await r.json() as Data;
   if(!r.ok)throw new Error(d.error);
   await load();
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 async function generateInvite(email:string){
  setGeneratingEmail(email);
  setInviteError(null);
  setCopyStatus('');
  const fallback='Não foi possível confirmar a geração do convite.';
  try{
   const response=await fetch('/api/team-invitations',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    cache:'no-store',
    body:JSON.stringify({email}),
   });
   const result=await response.json().catch(()=>null) as {error?:unknown;code?:unknown;expires_at?:unknown}|null;
   if(!response.ok){
    setInviteError({email,message:typeof result?.error==='string'?result.error:fallback});
    return;
   }
   const expiry=result?.expires_at;
   const expiresAt=new Date(typeof expiry==='number'?expiry*1000:typeof expiry==='string'?expiry:NaN);
   if(typeof result?.code!=='string'||!result.code||Number.isNaN(expiresAt.getTime()))throw new Error(fallback);
   setInvite({email,code:result.code,expiresAt});
   await load();
  }catch{setInviteError({email,message:fallback});}
  finally{setGeneratingEmail('');}
 }

 async function copyInvite(code:string){
  try{
   await navigator.clipboard.writeText(code);
   setCopyStatus('Código copiado.');
  }catch{setCopyStatus('Selecione e copie o código mostrado acima.');}
 }

 const disabled=busy||!!generatingEmail;
 return <>
  <header className="topbar"><a href="/" className="brand"><img src="/mobiliza-logo-0cff20bedde7.jpeg" alt="Mobiliza"/><span>MOBILIZA GESTÃO<br/><strong>{owner?'Equipe':'Acesso da gestão'}</strong></span></a></header>
  <main className="tech-shell">
   <a href="/" className="nav-back"><ArrowLeft size={19}/>Voltar ao painel</a>
   <section className="panel">
    <div className="section-heading">
     <div><div className="eyebrow">EQUIPE MBL</div><h1>{owner?'Gestão operacional':'Vincular minha conta'}</h1></div>
     <button type="button" className="button secondary" disabled={disabled} onClick={()=>{setInvite(null);setInviteError(null);void load();}}><RefreshCw size={16}/>Atualizar</button>
    </div>
    {!data?<p>Carregando…</p>:owner?<>
     <p className="muted">Administrador é o sócio-administrador. Os integrantes abaixo gerenciam as áreas operacionais conforme o escopo indicado. Publicação, membros e códigos permanecem com Administrador. Gestores podem ativar e desativar o QR de consulta da Limpeza. A lavanderia tem acesso separado.</p>
     {passwordAuth ? <>
      <CreatePasswordMember onCreated={()=>void load()}/>
      <section className="clean-inset" aria-labelledby="password-members-title">
       <h2 id="password-members-title">Contas de e-mail e senha</h2>
       {data.members.filter((member:Data)=>isSupabaseMemberId(member.user_id)).map((member:Data)=><article className="history-item" key={member.user_id}>
        <h3>{member.display_name}</h3>
        <p>{member.email} · {isMemberRole(member.role)?MEMBER_ROLES[member.role]:''}</p>
        <p className="muted">{member.status==='active'?'Acesso operacional liberado':member.status==='provisioning'?'Cadastro pendente de verificação':'Acesso encerrado'}</p>
        {member.status==='active'&&<button type="button" className="button secondary" disabled={disabled}
          onClick={()=>void act('revoke',member.user_id)}>Encerrar acesso</button>}
        {member.status==='revoked'&&<button type="button" className="button secondary" disabled={disabled}
          onClick={()=>void act('approve',member.user_id,member.display_name)}>Liberar acesso</button>}
       </article>)}
       {!data.members.some((member:Data)=>isSupabaseMemberId(member.user_id))&&<p className="muted">As contas cadastradas aqui aparecem nesta lista.</p>}
      </section>
     </>:<p className="muted">O código de convite autoriza quem o utilizar a entrar no painel com o escopo indicado. Entregue-o diretamente à pessoa convidada.</p>}
     {data.invitations.map((inv:Data)=>{
      const members=data.members.filter((member:Data)=>member.email===inv.email);
      return <section className="clean-inset" key={inv.email}>
       <div className="form-equipment"><UserRound size={25}/><div>
        <strong>{inv.name} · {inv.title}</strong>
        <p>{inv.email}</p>
        <small>{inv.role==='maintenance_lead'?'Pará · todas as obras. Registros sem região confirmada ficam restritos.':'Acesso geral · todos os estados e obras.'}</small>
       </div></div>
       {!passwordAuth&&(invite&&invite.email===inv.email?<div className="visit-code no-print" aria-label={'Convite para '+inv.name}>
        <span>Código individual de uso único</span>
        <strong>{invite.code}</strong>
        <small>Válido até <time dateTime={invite.expiresAt.toISOString()}>{inviteTime.format(invite.expiresAt)}</time> (Belém). Compartilhe somente com {inv.email}. O código é exibido apenas nesta confirmação.</small>
        <div className="form-actions">
         <button type="button" className="button secondary" onClick={()=>void copyInvite(invite.code)}><Copy size={16}/>Copiar código</button>
         <button type="button" className="button secondary" onClick={()=>setInvite(null)}>Ocultar código</button>
        </div>
        {copyStatus&&<small role="status">{copyStatus}</small>}
       </div>:<div className="form-actions no-print">
        <button type="button" className="button secondary" disabled={disabled||!!invite} aria-label={'Gerar código de convite para '+inv.name} onClick={()=>void generateInvite(inv.email)}>
         <KeyRound size={16}/>{generatingEmail===inv.email?'Gerando convite…':'Gerar código de convite'}
        </button>
       </div>)}
       {inviteError&&inviteError.email===inv.email&&<p className="error" role="alert">{inviteError.message}</p>}
       {!members.length?<><h3>Aguardando o primeiro acesso</h3><p>{passwordAuth?'Vincule a conta de e-mail e senha a um cadastro autorizado do Mobiliza.':'Gere um código para liberar o perfil. Se a pessoa entrar com ChatGPT, ela pode solicitar o vínculo para sua aprovação.'}</p></>:members.map((m:Data)=><article className="history-item" key={m.user_id}>
        <p className="muted">{m.status==='active'?'Acesso operacional liberado':m.status==='pending'?'Aguardando confirmação da identidade':'Acesso encerrado'}</p>
        <details><summary>Referência da conta para conferir com {inv.name}</summary><p style={{overflowWrap:'anywhere'}}>{m.user_id}</p></details>
        <div className="form-actions">{m.status!=='active'?<button type="button" className="button" disabled={disabled} onClick={()=>void act('approve',m.user_id,inv.name)}>Confirmar {inv.name} e liberar</button>:<button type="button" className="button secondary" disabled={disabled} onClick={()=>void act('revoke',m.user_id)}>Encerrar acesso</button>}</div>
       </article>)}
      </section>;
     })}
    </>:<>
     <p className="muted">Conta conectada: <strong>{data.email}</strong></p>
     {data.status==='active'?<><p className="visit-success">Acesso operacional liberado.</p><a className="button" href="/">Abrir MOBILIZA GESTÃO</a></>:data.status==='pending'?<p className="clean-inset">Solicitação registrada. Peça a Administrador para confirmar sua conta na área Equipe.</p>:data.status==='revoked'?<p className="clean-inset">Este acesso foi encerrado. Consulte Administrador.</p>:data.eligible?<><p className="clean-inset">Seu cadastro como {data.title} foi preparado. Confirme esta conta para que Administrador possa liberar a gestão operacional. Nenhum dado dos controles será exibido antes da aprovação.</p><button type="button" className="button" disabled={busy} onClick={()=>void act('request')}>Solicitar vínculo desta conta</button></>:<p className="clean-inset">Esta conta não tem acesso operacional liberado. Consulte o sócio-administrador.</p>}
     <details className="clean-inset"><summary>Minha referência de conta</summary><p style={{overflowWrap:'anywhere'}}>{data.reference}</p></details>
     {teamSession?<TeamSignOut label="Sair e trocar conta"/>:<a className="text-button" href="/signout-with-chatgpt?return_to=/acesso" target="_top">Sair e trocar conta</a>}
    </>}
    {error&&<p className="error" role="alert">{error}</p>}
   </section>
  </main>
 </>;
}
