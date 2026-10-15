import {requireOperator} from '../../../lib/app-access';
import {first} from '../../../lib/maintenance';
import {notFound} from 'next/navigation';
import GoogleMapFrame from './map-frame';
export const dynamic = 'force-dynamic';
export default async function Page({searchParams}: {searchParams: Promise<{property_id?: string}>}) {
  const query = await searchParams;
  const propertyId = typeof query.property_id === 'string' ? query.property_id : '';
  if (!propertyId || propertyId.length > 200) notFound();
  const op = await requireOperator('/mapa/editor?property_id=' + encodeURIComponent(propertyId));
  // The same scoped facade used elsewhere enforces live PA membership and property scope.
  if (!await first('SELECT id FROM properties WHERE id=? AND owner_id=? AND archived_at IS NULL', propertyId, op.ownerId)) notFound();
  return <GoogleMapFrame propertyId={propertyId}/>;
}
