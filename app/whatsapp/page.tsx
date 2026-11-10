import {requireOperator} from '../../lib/app-access';
import WhatsappCentral from './whatsapp-central';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const operator = await requireOperator('/whatsapp');
  return <WhatsappCentral displayName={operator.actor.fullName || operator.actor.displayName} accessTitle={operator.title}/>;
}
