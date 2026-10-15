import {requireOwnerUser} from '../../../lib/owner-access';
import GoogleMapsSettings from './settings';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireOwnerUser('/configuracoes/mapas');
  return <GoogleMapsSettings/>;
}
