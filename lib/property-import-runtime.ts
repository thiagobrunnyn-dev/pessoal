import {MEMBER_INVITATIONS, getOperator, operatorGuard, recheckOperator, type Operator} from './app-access';
import {db} from './maintenance';
import {requireGlobalCatalog} from './regional-access';
import {createPropertyImportApi} from './property-import-api';

// Use the approved membership record, never an email in the uploaded JSON or headers.
// Checking the explicit global roles also closes a role/email change mid-request.
const globalInvitations = MEMBER_INVITATIONS.filter(member => member.role === 'general_manager' || member.role === 'administrative_analyst');
export function propertyImportGlobalGuard(op: Operator) {
  const auth = operatorGuard(op);
  if (op.role === 'owner') return auth;
  return {sql: '(' + auth.sql + ') AND EXISTS(SELECT 1 FROM app_members WHERE user_id=? AND revision=? AND status=\'active\' AND (' + globalInvitations.map(() => '(email=? AND role=?)').join(' OR ') + '))',
    args: [...auth.args, op.actor.userId, op.revision, ...globalInvitations.flatMap(member => [member.email, member.role])]};
}
export const propertyImportApi = createPropertyImportApi({db, getOperator, recheckOperator, requireGlobalCatalog, globalGuard: propertyImportGlobalGuard});
