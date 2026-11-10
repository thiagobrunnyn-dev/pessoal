import { safeRelativeReturnPath } from '../../chatgpt-auth';
import { boundedJson, RequestError, requireSameOrigin } from '../../../lib/http-security';
import { db, noCache } from '../../../lib/maintenance';
import { redeemTeamCode, teamSessionCookie } from '../../../lib/team-access';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await boundedJson(request);
    if (typeof body?.code !== 'string') throw new RequestError('Informe o código de convite.');

    const session = await redeemTeamCode(db(), body.code);
    if (!session) throw new RequestError('Código inválido, expirado ou já utilizado. Peça um novo convite ao administrador.', 401);
    const returnTo = typeof body.return_to === 'string' ? safeRelativeReturnPath(body.return_to) : '/';
    return Response.json(
      {ok: true, return_to: returnTo},
      {headers: {...noCache, 'Set-Cookie': teamSessionCookie(session.sessionToken, session.expiresAt)}},
    );
  } catch (error) {
    return Response.json(
      {error: error instanceof RequestError ? error.message : 'Não foi possível entrar. Tente novamente.'},
      {status: error instanceof RequestError ? error.status : 503, headers: noCache},
    );
  }
}
