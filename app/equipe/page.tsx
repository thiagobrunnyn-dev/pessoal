import {requireOwnerUser} from '../../lib/owner-access';
import MemberAccess from '../member-access';
export const dynamic='force-dynamic';
export default async function Page(){await requireOwnerUser('/equipe');return <MemberAccess owner/>;}
