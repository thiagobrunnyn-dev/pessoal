import {maintenanceEvidenceSql} from './maintenance-evidence';
// Fixed aliases e/s; shared by the private daily agenda and planning guard.
export const VALID_SCHEDULE_CYCLE=`((e.baseline_date IS NOT NULL AND s.cycle_id='baseline:'||e.id||':'||e.baseline_date) OR EXISTS(SELECT 1 FROM maintenance m WHERE m.id=s.cycle_id AND m.equipment_id=e.id AND m.owner_id=e.owner_id AND m.is_test=0 AND m.completion_status='completed' AND ${maintenanceEvidenceSql('m')}))`;
