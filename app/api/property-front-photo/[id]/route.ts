import {getOperator} from '../../../../lib/app-access';
import {privatePropertyFrontPhoto} from '../../../../lib/property-front-photo-data';
import {RequestError} from '../../../../lib/http-security';
import {PRIVATE_FRONT_PHOTO_HEADERS} from '../../../../lib/property-front-photo';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    const op = await getOperator();
    if (!op) throw new RequestError('Acesso restrito à gestão autorizada.', 401);
    return await privatePropertyFrontPhoto(op, (await params).id);
  } catch (error) {
    return new Response(error instanceof RequestError ? error.message : 'Foto temporariamente indisponível.', {
      status: error instanceof RequestError ? error.status : 503,
      headers: {...PRIVATE_FRONT_PHOTO_HEADERS, 'Content-Type': 'text/plain; charset=utf-8'},
    });
  }
}
