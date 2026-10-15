// SQL fragments are internal constants only; profile association never grants a login identity.
export function anonymousGrantProfileSql(profileIdSql:string,ownerIdSql:string){return `(${profileIdSql} IS NULL OR EXISTS(SELECT 1 FROM person_profiles bp WHERE bp.id=${profileIdSql} AND bp.owner_id=${ownerIdSql} AND bp.status='active' AND bp.app_member_user_id IS NULL))`;}
