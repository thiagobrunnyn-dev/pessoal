import {env} from 'cloudflare:workers';
import {boundedJson, RequestError, requireSameOrigin} from '../../../lib/http-security';
import {noCache} from '../../../lib/maintenance';
import {isMemberRole} from '../../../lib/member-roles';
import {getOwnerUser} from '../../../lib/owner-access';
import {createPasswordMember} from '../../../lib/supabase-auth';

export async function POST(request: Request) {
  try {
    if (env.MOBILIZA_SUPABASE_AUTH !== '1') throw new RequestError('Cadastro indisponível.', 404);
    requireSameOrigin(request);
    if (!await getOwnerUser()) throw new RequestError('Apenas o administrador pode cadastrar usuários.', 403);
    const body = await boundedJson(request);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body?.role;
    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 || !isMemberRole(role)) {
      throw new RequestError('Informe o nome, um e-mail válido e o perfil de acesso.');
    }
    const member = await createPasswordMember(env, {name, email, role});
    return Response.json({ok: true, ...member}, {status: 201, headers: noCache});
  } catch (error) {
    return Response.json({error: error instanceof RequestError ? error.message : 'Não foi possível concluir o cadastro.'}, {
      status: error instanceof RequestError ? error.status : 503, headers: noCache,
    });
  }
}
