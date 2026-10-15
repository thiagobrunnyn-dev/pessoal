// Configure only explicitly authorized requester profile IDs. Empty by default.
const APPROVED_REQUESTER_PROFILE_IDS: readonly string[] = Object.freeze([]);

export function requesterScope(approvedIds: readonly string[] = APPROVED_REQUESTER_PROFILE_IDS) {
  const ids = [...new Set(approvedIds)].filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  return {ids, sql: ids.length ? `p.id IN (${ids.map(() => '?').join(',')})` : '0'};
}
