import {env} from 'cloudflare:workers';
import {requireAdministrator} from '../../lib/app-access';
import MemberAccess from '../member-access';
export const dynamic='force-dynamic';
export default async function Page(){
  await requireAdministrator('/equipe');
  return <MemberAccess owner passwordAuth={env.MOBILIZA_SUPABASE_AUTH === '1'}/>;
}
