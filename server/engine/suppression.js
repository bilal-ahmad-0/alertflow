/**
 * Alert suppression engine.
 * Checks maintenance windows and suppression rules.
 */
export function checkSuppression(db, event) {
  // Check active maintenance windows
  const now = new Date().toISOString();

  const windows = db.prepare(`
    SELECT * FROM maintenance_windows
    WHERE active = 1
      AND datetime(start_time) <= datetime(?)
      AND datetime(end_time) >= datetime(?)
  `).all(now, now);

  for (const mw of windows) {
    const services = mw.services ? JSON.parse(mw.services) : [];
    const environments = mw.environments ? JSON.parse(mw.environments) : [];
    const policy = mw.suppression_policy || 'all';

    // Check if event matches maintenance window scope
    let serviceMatch = services.length === 0;
    if (event.service_id && services.includes(event.service_id)) serviceMatch = true;
    if (event.service && services.includes(event.service)) serviceMatch = true;

    let envMatch = environments.length === 0;
    if (event.environment && environments.includes(event.environment)) envMatch = true;

    if (serviceMatch && envMatch) {
      // Check suppression policy
      if (policy === 'all') {
        // Suppress everything unless critical
        if (event.severity === 'critical') {
          // Critical events bypass suppression
          continue;
        }
        return {
          suppressed: true,
          reason: `Maintenance window: ${mw.name}`,
          window: mw,
        };
      } else if (policy === 'non_critical') {
        if (event.severity !== 'critical') {
          return {
            suppressed: true,
            reason: `Maintenance window: ${mw.name} (non-critical suppressed)`,
            window: mw,
          };
        }
      }
    }
  }

  return { suppressed: false };
}
