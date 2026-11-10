import { invitationFor } from '../../../lib/app-access';
import { boundedJson, RequestError, requireSameOrigin } from '../../../lib/http-security';
import { db, noCache } from '../../../lib/maintenance';
import { getOwnerUser, SITE_OWNER_ID } from '../../../lib/owner-access';
import { issueTeamCode } from '../../../lib/team-access';
import { sha256 } from '../../../lib/visit-security';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const owner = await getOwnerUser();
    if (!owner) throw new RequestError('Apenas o administrador pode gerar convites.', 403);
    const body = await boundedJson(request);
    const invitation = typeof body?.email === 'string' && invitationFor(body.email);
    if (!invitation) throw new RequestError('Selecione um perfil de acesso da equipe.');

    const database = db();
    const userId = 'team:' + await sha256(invitation.email);
    const now = new Date().toISOString();
    // An approved account keeps its identity and existing operational links.
    // A new team login never activates a pending ChatGPT account.
    await database.prepare(`
      INSERT INTO app_members
        (user_id, email, display_name, role, status, revision, requested_at, approved_at, approved_by)
      SELECT ?, ?, ?, ?, 'active', 1, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM app_members WHERE email = ? AND status = 'active')
      ON CONFLICT(user_id) DO UPDATE SET status = 'active', revision = app_members.revision + 1,
        approved_at = excluded.approved_at, approved_by = excluded.approved_by, revoked_at = NULL
      WHERE app_members.email = excluded.email AND app_members.role = excluded.role AND app_members.status = 'revoked'
    `).bind(userId, invitation.email, invitation.name, invitation.role, now, now, owner.userId, invitation.email).run();

    const member = await database.prepare(`
      SELECT user_id AS userId, revision FROM app_members
      WHERE email = ? AND role = ? AND status = 'active' AND user_id <> ?
    `).bind(invitation.email, invitation.role, SITE_OWNER_ID).first<{userId: string; revision: number}>();
    if (!member) throw new RequestError('Confira o perfil e o acesso existente antes de gerar o convite.', 409);
    const {code, expiresAt} = await issueTeamCode(database, member, owner.userId);
    return Response.json({code, expires_at: expiresAt}, {headers: noCache});
  } catch (error) {
    return Response.json(
      {error: error instanceof RequestError ? error.message : 'Não foi possível gerar o convite.'},
      {status: error instanceof RequestError ? error.status : 503, headers: noCache},
    );
  }
}
