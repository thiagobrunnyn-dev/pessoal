import {currentIntegration,integrationGuard,integrationOperator} from './integration-context';
import {ensureRegionalContext,regionalWriteGuard} from './regional-access';
import {getChatGPTUser,requireChatGPTUser,type ChatGPTUser} from '../app/chatgpt-auth';
import {redirect} from 'next/navigation';
import {SITE_OWNER_ID} from './owner-access';
import {first} from './maintenance';
import {RequestError} from './http-security';
export const MEMBER_INVITATIONS=[{email:'gerente@example.invalid',name:'Gerente de exemplo',title:'Gerente geral',role:'general_manager'},{email:'manutencao@example.invalid',name:'Encarregado de exemplo',title:'Encarregado de manutenção',role:'maintenance_lead'},{email:'administrativo@example.invalid',name:'Analista de exemplo',title:'Analista administrativo',role:'administrative_analyst'}] as const;
export const invitationFor=(email:string)=>MEMBER_INVITATIONS.find(x=>x.email===email.trim().toLowerCase());
export type Operator={actor:ChatGPTUser;ownerId:string;role:'owner'|'operator';title:string;revision:number;integrationId?:string};
const memberScope='('+MEMBER_INVITATIONS.map(()=>'(email=? AND role=?)').join(' OR ')+')';
const memberScopeArgs=MEMBER_INVITATIONS.flatMap(x=>[x.email,x.role]);
export function managerGuard(userId:string,revision?:number){return {sql:"EXISTS(SELECT 1 FROM app_members WHERE user_id=? AND "+memberScope+" AND status='active'"+(revision===undefined?'':" AND revision=?")+")",args:[userId,...memberScopeArgs,...(revision===undefined?[]:[revision])]};}
export function operatorGuard(op:Operator){const base=op.integrationId?integrationGuard(op.integrationId,op.ownerId):op.role==='owner'?{sql:'1',args:[]}:managerGuard(op.actor.userId,op.revision),region=regionalWriteGuard();return {sql:'('+base.sql+') AND ('+region.sql+')',args:[...base.args,...region.args]};}
export async function managerActive(userId:string,revision?:number){const g=managerGuard(userId,revision);return !!await first('SELECT 1 permitted WHERE '+g.sql,...g.args);}
async function operatorFor(actor:ChatGPTUser|null):Promise<Operator|null>{if(!actor)return null;if(actor.userId===SITE_OWNER_ID)return {actor,ownerId:SITE_OWNER_ID,role:'owner',title:'Sócio-administrador',revision:0};const member=await first("SELECT revision,email FROM app_members WHERE user_id=? AND "+memberScope+" AND status='active'",actor.userId,...memberScopeArgs);if(member){ensureRegionalContext(member.email);return {actor,ownerId:SITE_OWNER_ID,role:'operator',title:invitationFor(member.email)!.title,revision:member.revision};}return null;}
export async function getOperator(){const grant=currentIntegration();if(grant){const op=integrationOperator(grant);await recheckOperator(op);return op;}return operatorFor(await getChatGPTUser());}
export async function requireOperator(returnTo:string){const actor=await requireChatGPTUser(returnTo),op=await operatorFor(actor);if(!op)redirect('/acesso');return op;}
export async function recheckOperator(op:Operator){if(op.integrationId){const g=integrationGuard(op.integrationId,op.ownerId);if(!await first('SELECT 1 permitted WHERE '+g.sql,...g.args))throw new RequestError('Credencial expirada ou revogada.',401);}else if(op.role==='operator'&&!await managerActive(op.actor.userId,op.revision))throw new RequestError('Acesso operacional encerrado. Atualize a página.',401);}
