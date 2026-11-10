export const MEMBER_ROLES = {
  admin: 'Administrador (ADM)',
  general_manager: 'Gerente geral',
  maintenance_lead: 'Encarregado de manutenção',
  administrative_analyst: 'Analista administrativo',
} as const;

export type MemberRole = keyof typeof MEMBER_ROLES;

export function isMemberRole(role: unknown): role is MemberRole {
  return typeof role === 'string' && Object.hasOwn(MEMBER_ROLES, role);
}

const SUPABASE_MEMBER_ID = /^supabase:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

export function isSupabaseMemberId(userId: string) {
  return SUPABASE_MEMBER_ID.test(userId);
}

export function isRegionalMember(userId: string, email: string, role: string, legacyRegionalEmail: string) {
  return role === 'maintenance_lead' && (email === legacyRegionalEmail || isSupabaseMemberId(userId));
}

export const SUPABASE_MEMBER_SQL = "user_id LIKE 'supabase:%' AND role IN (" +
  Object.keys(MEMBER_ROLES).map(role => "'" + role + "'").join(',') + ')';
