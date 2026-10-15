/** Current, explicit occupancy. No capacity is inferred from any other module. */
export type OccupancyMetrics = {
  room_count: number;
  capacity_total: number | null;
  confirmed_capacity: number;
  unknown_rooms: number;
  occupied_count: number;
  available_count: number | null;
  occupancy_rate: number | null;
};
export type OccupancyPropertySummary = OccupancyMetrics & {
  id: string; control_number: number | null; name: string; address: string;
  state_code: string | null; worksite_id: string | null; worksite_name: string | null;
  revision: number; archived_at: string | null;
};
export type OccupancyRoom = {
  id: string; property_id: string; name: string; capacity: number | null;
  capacity_confirmed: boolean; revision: number; occupied_count: number;
  available_count: number | null; scope_changed: boolean;
};
export type OccupancyStay = {
  id: string; property_id: string; room_id: string; room_name: string; slot_number: number;
  person_profile_id: string; person_name_pending?: boolean; person_name: string; person_title: string; shift: string;
  entry_on: string | null; recorded_at: string; exit_on: string | null; planned_exit_on: string | null; revision: number;
  client_id: string | null; client_name: string | null; cost_center_id: string | null; cost_center_name: string | null; assignment_captured_at: string | null; assignment_unavailable?: boolean;
  state_code: string | null; worksite_id: string | null; scope_changed: boolean;
};
export type OccupancyPerson = {id: string; display_name: string; job_title: string; revision: number; name_pending?: boolean};
export type OccupancyDetail = {
  property: OccupancyPropertySummary; rooms: OccupancyRoom[]; historical_rooms: OccupancyRoom[];
  stays: OccupancyStay[]; people: OccupancyPerson[]; truncated: boolean; today: string;
};
export function occupancyMetrics(rooms: Pick<OccupancyRoom,'capacity'|'capacity_confirmed'|'occupied_count'>[]): OccupancyMetrics {
  const unknown = rooms.filter(r => r.capacity === null || !r.capacity_confirmed).length;
  const confirmed = rooms.reduce((n,r) => n + (r.capacity_confirmed ? r.capacity ?? 0 : 0), 0);
  const occupied = rooms.reduce((n,r) => n + r.occupied_count, 0);
  const total = rooms.length && !unknown ? confirmed : null;
  return {room_count: rooms.length, capacity_total: total, confirmed_capacity: confirmed,
    unknown_rooms: unknown, occupied_count: occupied,
    available_count: total === null ? null : total - occupied,
    occupancy_rate: total === null || total === 0 ? null : occupied / total * 100};
}

export function occupancyCapacityStatus(metrics: Pick<OccupancyMetrics, 'capacity_total' | 'occupied_count'>): 'unknown' | 'empty' | 'available' | 'full' | 'over' {
  if (metrics.capacity_total === null) return 'unknown';
  if (metrics.occupied_count > metrics.capacity_total) return 'over';
  if (metrics.capacity_total === 0) return 'empty';
  return metrics.occupied_count === metrics.capacity_total ? 'full' : 'available';
}
