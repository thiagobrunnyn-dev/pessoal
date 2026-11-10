import {currentIntegration,integrationGuard,integrationOperator} from './integration-context';
import {ensureRegionalContext,regionalWriteGuard} from './regional-access';
import {getChatGPTUser,requireChatGPTUser,type ChatGPTUser} from '../app/chatgpt-auth';
import {notFound,redirect} from 'next/navigation';
import {SITE_OWNER_ID} from './owner-access';
import {first} from './maintenance';
import {RequestError} from './http-security';
import {isMemberRole, isSupabaseMemberId, MEMBER_ROLES, SUPABASE_MEMBER_SQL} from './member-roles';
export const MEMBER_INVITATIONS=[{email:'gerente@example.invalid',name:'Gerente de exemplo',title:'Gerente geral',role:'general_manager'},{email:'manutencao@example.invalid',name:'Encarregado de exemplo',title:'Encarregado de manutenção',role:'maintenance_lead'},{email:'administrativo@example.invalid',name:'Analista de exemplo',title:'Analista administrativo',role:'administrative_analyst'}] as const;
export const invitationFor=(email:string)=>MEMBER_INVITATIONS.find(x=>x.email===email.trim().toLowerCase());
export type Operator={actor:ChatGPTUser;ownerId:string;role:'owner'|'admin'|'operator';title:string;revision:number;integrationId?:string};
const memberScope='('+[...MEMBER_INVITATIONS.map(()=>'(email=? AND role=?)'),'('+SUPABASE_MEMBER_SQL+')'].join(' OR ')+')';
const memberScopeArgs=MEMBER_INVITATIONS.flatMap(x=>[x.email,x.role]);
export function memberTitle(member: {userId: string; email: string; role: string}) {
  if (isSupabaseMemberId(member.userId) && isMemberRole(member.role)) return MEMBER_ROLES[member.role];
  const invitation = invitationFor(member.email);
  return invitation?.role === member.role ? invitation.title : null;
}
export function managerGuard(userId:string,revision?:number,requireAdmin=false){
  return {sql:"EXISTS(SELECT 1 FROM app_members WHERE user_id=? AND "+memberScope+" AND status='active'"+
    (revision===undefined?'':" AND revision=?")+(requireAdmin?" AND role='admin'":"")+")",
    args:[userId,...memberScopeArgs,...(revision===undefined?[]:[revision])]};
}
export function canAdminister(op:Operator|null):boolean{
  return !!op && !op.integrationId && (op.role==='owner'||op.role==='admin');
}
export function operatorGuard(op:Operator){const base=op.integrationId?integrationGuard(op.integrationId,op.ownerId):op.role==='owner'?{sql:'1',args:[]}:managerGuard(op.actor.userId,op.revision,op.role==='admin'),region=regionalWriteGuard();return {sql:'('+base.sql+') AND ('+region.sql+')',args:[...base.args,...region.args]};}
export async function managerActive(userId:string,revision?:number,requireAdmin=false){const g=managerGuard(userId,revision,requireAdmin);return !!await first('SELECT 1 permitted WHERE '+g.sql,...g.args);}
async function operatorFor(actor:ChatGPTUser|null):Promise<Operator|null>{
  if (!actor) return null;
  if (actor.userId === SITE_OWNER_ID) return {actor,ownerId:SITE_OWNER_ID,role:'owner',title:'Sócio-administrador',revision:0};
  const member = await first("SELECT revision,email,role FROM app_members WHERE user_id=? AND "+memberScope+" AND status='active'",actor.userId,...memberScopeArgs);
  if (!member || (isSupabaseMemberId(actor.userId) && !actor.passwordSession) ||
      (actor.passwordSession && (actor.passwordSessionRevision!==member.revision ||
        member.email.toLowerCase()!==actor.email.toLowerCase()))) return null;
  const title = memberTitle({...member, userId: actor.userId});
  if (!title) return null;
  ensureRegionalContext(member.email, actor.userId, member.role);
  return {actor,ownerId:SITE_OWNER_ID,role:member.role==='admin'?'admin':'operator',title,revision:member.revision};
}
export async function getOperator(){const grant=currentIntegration();if(grant){const op=integrationOperator(grant);await recheckOperator(op);return op;}return operatorFor(await getChatGPTUser());}
export async function requireOperator(returnTo:string){const actor=await requireChatGPTUser(returnTo),op=await operatorFor(actor);if(!op)redirect('/acesso');return op;}
export async function getAdministrator(){
  if(currentIntegration())return null;
  const op=await operatorFor(await getChatGPTUser());
  return canAdminister(op)?op:null;
}
export async function requireAdministrator(returnTo:string){
  const op=await requireOperator(returnTo);
  if(!canAdminister(op))notFound();
  return op;
}
export async function recheckOperator(op:Operator){if(op.integrationId){const g=integrationGuard(op.integrationId,op.ownerId);if(!await first('SELECT 1 permitted WHERE '+g.sql,...g.args))throw new RequestError('Credencial expirada ou revogada.',401);}else if(op.role!=='owner'&&!await managerActive(op.actor.userId,op.revision,op.role==='admin'))throw new RequestError('Acesso operacional encerrado. Atualize a página.',401);}
