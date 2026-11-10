import {env} from 'cloudflare:workers';
import {RequestError, requireSameOrigin} from '../../../../lib/http-security';
import {db, noCache} from '../../../../lib/maintenance';
import {clearPasswordSessionCookie, revokePasswordSession, suppressNativeSiteSessionCookie} from '../../../../lib/supabase-auth';

export async function POST(request: Request) {
  try {
    if (env.MOBILIZA_SUPABASE_AUTH !== '1') throw new RequestError('Acesso indisponível.', 404);
    requireSameOrigin(request);
    await revokePasswordSession(request, db());
    const headers = new Headers(noCache);
    headers.append('Set-Cookie', clearPasswordSessionCookie());
    headers.append('Set-Cookie', suppressNativeSiteSessionCookie());
    return new Response(null, {status: 204, headers});
  } catch (error) {
    return Response.json({error: error instanceof RequestError ? error.message : 'Não foi possível encerrar a sessão.'}, {
      status: error instanceof RequestError ? error.status : 503,
      headers: noCache,
    });
  }
}
