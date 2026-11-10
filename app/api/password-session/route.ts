import {env} from 'cloudflare:workers';
import {safeRelativeReturnPath} from '../../chatgpt-auth';
import {boundedJson, RequestError, requireSameOrigin} from '../../../lib/http-security';
import {noCache} from '../../../lib/maintenance';
import {PasswordChangeRequired, signInWithPassword} from '../../../lib/supabase-auth';

export async function POST(request: Request) {
  try {
    if (env.MOBILIZA_SUPABASE_AUTH !== '1') throw new RequestError('Acesso indisponível.', 404);
    requireSameOrigin(request);
    const body = await boundedJson(request, 6144);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 1024) {
      throw new RequestError('Informe um e-mail e uma senha válidos.');
    }
    const returnTo = safeRelativeReturnPath(typeof body.return_to === 'string' ? body.return_to : '/');
    const newPassword = typeof body.new_password === 'string' ? body.new_password : undefined;
    const cookie = await signInWithPassword(request, env, email, password, newPassword);
    return Response.json({ok: true, return_to: returnTo}, {headers: {...noCache, 'Set-Cookie': cookie}});
  } catch (error) {
    return Response.json({
      error: error instanceof RequestError ? error.message : 'Não foi possível entrar. Tente novamente.',
      ...(error instanceof PasswordChangeRequired ? {password_change_required: true} : {}),
    }, {
      status: error instanceof RequestError ? error.status : 503, headers: noCache,
    });
  }
}
