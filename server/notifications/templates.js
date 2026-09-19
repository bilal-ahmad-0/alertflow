import { getDb } from '../db.js';

/**
 * Generate notification template data for a given incident/event.
 */
export function getNotificationTemplate(type, incident, event) {
  const db = getDb();

  let serviceName = 'Unknown Service';
  if (incident?.service_id) {
    const svc = db.prepare('SELECT name FROM services WHERE id = ?').get(incident.service_id);
    if (svc) serviceName = svc.name;
  } else if (event?.service) {
    serviceName = event.service;
  }

  let teamName = null;
  if (incident?.team_id) {
    const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(incident.team_id);
    if (team) teamName = team.name;
  }

  const base = {
    service: serviceName,
    environment: incident?.environment || event?.environment || 'production',
    severity: incident?.severity || event?.severity || 'info',
    priority: incident?.priority || 'P3',
    incident_id: incident?.incident_number ? `INC-${incident.incident_number}` : null,
    team: teamName,
    timestamp: new Date().toISOString(),
    description: event?.description || incident?.title || 'No description',
  };

  switch (type) {
    case 'recovery':
      return {
        ...base,
        subject: `✅ RESOLVED — ${incident?.title || serviceName}`,
        template_type: 'recovery',
      };
    case 'escalation':
      return {
        ...base,
        subject: `🔺 ESCALATION — ${incident?.title || serviceName}`,
        template_type: 'escalation',
      };
    default:
      const emoji = base.severity === 'critical' ? '🚨' : base.severity === 'warning' ? '⚠️' : 'ℹ️';
      return {
        ...base,
        subject: `${emoji} ${(base.severity).toUpperCase()} — ${incident?.title || event?.description || serviceName}`,
        template_type: 'alert',
      };
  }
}
