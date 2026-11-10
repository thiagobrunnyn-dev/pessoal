export const PASSWORD_COOKIE = '__Host-mobiliza-password';
export const NATIVE_SUPPRESSION_COOKIE = '__Host-mobiliza-logged-out';
export const PASSWORD_SESSION_HEADER = 'x-mobiliza-password-session';
export const PASSWORD_SESSION_REVISION_HEADER = 'x-mobiliza-password-member-revision';

type PasswordIdentity = {userId: string; email: string; fullName: string | null; revision: number | null};

export function sitesPasswordIdentity(request: Request, actor: PasswordIdentity | null, passwordMode: boolean) {
  const cookieNames = passwordMode ? (request.headers.get('cookie') ?? '').split(';').map(cookie => cookie.trim().split('=', 1)[0]) : [];
  const localSessionSelected = passwordMode && (cookieNames.includes(PASSWORD_COOKIE) || cookieNames.includes(NATIVE_SUPPRESSION_COOKIE));
  if (!actor && !localSessionSelected && !request.headers.has(PASSWORD_SESSION_HEADER) &&
      !request.headers.has(PASSWORD_SESSION_REVISION_HEADER)) return request;
  const headers = new Headers(request.headers);
  headers.delete(PASSWORD_SESSION_HEADER);
  headers.delete(PASSWORD_SESSION_REVISION_HEADER);

  if (actor || localSessionSelected) {
    for (const name of [...headers.keys()]) {
      if (name.startsWith('oai-authenticated-user-')) headers.delete(name);
    }
  }

  if (actor) {
    headers.set('oai-authenticated-user-id', actor.userId);
    headers.set('oai-authenticated-user-email', actor.email);
    if (actor.fullName) {
      headers.set('oai-authenticated-user-full-name', encodeURIComponent(actor.fullName));
      headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
    }
    headers.set(PASSWORD_SESSION_HEADER, '1');
    if (actor.revision !== null) headers.set(PASSWORD_SESSION_REVISION_HEADER, String(actor.revision));
  }

  return new Request(request, {headers});
}
