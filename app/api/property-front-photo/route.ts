import {getOperator} from '../../../lib/app-access';
import {savePropertyFrontPhoto} from '../../../lib/property-front-photo-data';
import {boundedForm, requireSameOrigin, RequestError} from '../../../lib/http-security';
import {FRONT_PHOTO_FORM_LIMIT, PRIVATE_FRONT_PHOTO_HEADERS} from '../../../lib/property-front-photo';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: PRIVATE_FRONT_PHOTO_HEADERS});

export async function POST(request: Request) {
  try {
    const op = await getOperator();
    if (!op) return reply({error: 'Acesso restrito à gestão autorizada.'}, 401);
    requireSameOrigin(request);
    return reply(await savePropertyFrontPhoto(op, await boundedForm(request, FRONT_PHOTO_FORM_LIMIT)));
  } catch (error) {
    return reply({error: error instanceof RequestError ? error.message : 'Não foi possível salvar a foto. Tente novamente com os mesmos dados.'},
      error instanceof RequestError ? error.status : 503);
  }
}
