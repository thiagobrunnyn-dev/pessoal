import { RequestError, requireSameOrigin } from '../../../../lib/http-security';
import { db, noCache } from '../../../../lib/maintenance';
import { clearTeamSessionCookie, revokeTeamSession } from '../../../../lib/team-access';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await revokeTeamSession(request, db());
    return new Response(null, {
      status: 204,
      headers: {...noCache, 'Set-Cookie': clearTeamSessionCookie()},
    });
  } catch (error) {
    return Response.json(
      {error: error instanceof RequestError ? error.message : 'Não foi possível encerrar a sessão.'},
      {status: error instanceof RequestError ? error.status : 503, headers: noCache},
    );
  }
}
