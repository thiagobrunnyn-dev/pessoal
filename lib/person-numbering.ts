import {db, first} from './maintenance';
import {operatorGuard, recheckOperator, type Operator} from './app-access';
import {requireGlobalCatalog} from './regional-access';

/** Explicit, repeatable management action. Schema migrations never backfill records. */
export async function initializePersonNumbers(op: Operator) {
  requireGlobalCatalog();
  await recheckOperator(op);
  const auth=operatorGuard(op);
  const statements=[
    db().prepare(`INSERT INTO person_number_counters(owner_id,last_number)
      SELECT ?,COALESCE((SELECT MAX(control_number) FROM person_profiles WHERE owner_id=?),0) WHERE ${auth.sql}
      ON CONFLICT(owner_id) DO UPDATE SET last_number=MAX(person_number_counters.last_number,excluded.last_number)`)
      .bind(op.ownerId,op.ownerId,...auth.args),
    db().prepare(`WITH pending AS MATERIALIZED (
      SELECT id,ROW_NUMBER() OVER(ORDER BY created_at,id) position FROM person_profiles
      WHERE owner_id=? AND control_number IS NULL AND directory<>'guest' ORDER BY created_at,id LIMIT 500
    ), base AS MATERIALIZED (SELECT last_number FROM person_number_counters WHERE owner_id=?)
    UPDATE person_profiles SET control_number=(SELECT last_number FROM base)+(SELECT position FROM pending WHERE pending.id=person_profiles.id)
    WHERE owner_id=? AND control_number IS NULL AND id IN(SELECT id FROM pending) AND ${auth.sql}`)
      .bind(op.ownerId,op.ownerId,op.ownerId,...auth.args),
    db().prepare(`UPDATE person_number_counters SET last_number=MAX(last_number,COALESCE((SELECT MAX(control_number) FROM person_profiles WHERE owner_id=?),0)) WHERE owner_id=? AND ${auth.sql}`)
      .bind(op.ownerId,op.ownerId,...auth.args),
  ];
  const result=await db().batch(statements);
  await recheckOperator(op);
  const pending=await first(`SELECT COUNT(*) count FROM person_profiles WHERE owner_id=? AND directory<>'guest' AND control_number IS NULL AND ${auth.sql}`,op.ownerId,...auth.args);
  return {assigned:result[1].meta.changes,remaining:Number(pending?.count||0)};
}
