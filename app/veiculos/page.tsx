import {requireOperator} from '../../lib/app-access';
import VehiclesDirectory from './vehicles-directory';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const operator = await requireOperator('/veiculos');
  return <VehiclesDirectory displayName={operator.actor.fullName || operator.actor.displayName} accessTitle={operator.title}/>;
}
