import {googleMapsApi} from '../../../../lib/google-maps-server';
export const dynamic = 'force-dynamic';
// No GET endpoint, no QR/bearer authorization and no caching or shared module-level key.
export const POST = (request: Request) => googleMapsApi.bootstrapPost(request);
