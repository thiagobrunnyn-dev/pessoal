import {requireAdministrator} from '../../../lib/app-access';
import GoogleMapsSettings from './settings';
export const dynamic = 'force-dynamic';
export default async function Page() {
  await requireAdministrator('/configuracoes/mapas');
  return <GoogleMapsSettings/>;
}
