import {requireChatGPTUser} from '../chatgpt-auth';
import MemberAccess from '../member-access';
export const dynamic='force-dynamic';
export default async function Page(){const actor=await requireChatGPTUser('/acesso');return <MemberAccess teamSession={actor.teamSession}/>;}
