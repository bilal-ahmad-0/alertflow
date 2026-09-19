/**
 * Alert correlation engine.
 * Finds existing open incidents that a new alert may belong to.
 * Uses deterministic rule-based correlation:
 * - Same service
 * - Same environment
 * - Within a configurable time window (default 5 minutes)
 */
export function findCorrelatedIncident(db, event) {
  if (!event.service_id) return null;

  const CORRELATION_WINDOW_MINUTES = 30;

  // Look for open incidents matching service + environment within the time window
  const incident = db.prepare(`
    SELECT * FROM incidents
    WHERE service_id = ?
      AND environment = ?
      AND status NOT IN ('resolved')
      AND datetime(started_at) > datetime('now', ?)
    ORDER BY started_at DESC
    LIMIT 1
  `).get(event.service_id, event.environment, `-${CORRELATION_WINDOW_MINUTES} minutes`);

  return incident || null;
}
