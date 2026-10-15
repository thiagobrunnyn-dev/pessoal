import {googleMapsApi} from '../../../../lib/google-maps-server';
export const dynamic = 'force-dynamic';
export const GET = () => googleMapsApi.settingsGet();
export const POST = (request: Request) => googleMapsApi.settingsPost(request);
