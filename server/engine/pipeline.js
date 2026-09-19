import { getDb, getNextIncidentNumber } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { evaluateRules } from './rules.js';
import { findCorrelatedIncident } from './correlation.js';
import { checkSuppression } from './suppression.js';
import { dispatchNotifications } from '../notifications/dispatcher.js';
import { scheduleEscalation } from './escalation.js';
import { broadcast } from '../index.js';

const ORG_ID = 'org-default';

/**
 * Main event processing pipeline.
 * Event → Validate → Normalize → Dedup → Suppress → Rules → Correlate → Incident → Route → Notify → Escalate → Timeline
 */
export async function processEvent(rawEvent) {
  const db = getDb();
  const pipelineLog = [];
  const log = (msg) => pipelineLog.push({ time: new Date().toISOString(), message: msg });

  try {
    // Step 1: Validate
    log('Event received');
    const validated = validateEvent(rawEvent);
    if (!validated.valid) {
      log(`Validation failed: ${validated.error}`);
      return { success: false, error: validated.error, pipeline: pipelineLog };
    }
    log('Event validated');

    // Step 2: Normalize
    const event = normalizeEvent(validated.event);
    log('Event normalized');

    // Step 3: Check duplicate
    const isDuplicate = checkDuplicate(db, event);
    if (isDuplicate.duplicate) {
      log('Duplicate event detected');
      // Still store the alert but mark as duplicate
      const alertId = storeAlert(db, event, 'duplicate', isDuplicate.existingIncidentId);
      log(`Alert ${alertId} stored as duplicate`);

      // Add to in-app notifications
      addAppNotification(db, 'duplicate', 'Duplicate Alert Detected',
        `Event ${event.event_id} is a duplicate. Associated with existing incident.`, 'info');

      broadcast({ type: 'alert_created', alert: getAlertById(db, alertId) });
      broadcast({ type: 'activity', activity: { type: 'alert_duplicate', message: `Duplicate alert detected for event ${event.event_id}`, timestamp: new Date().toISOString() } });

      return {
        success: true, duplicate: true,
        alert_id: alertId,
        incident_id: isDuplicate.existingIncidentId,
        pipeline: pipelineLog,
      };
    }
    log('Duplicate check passed');

    // Step 4: Check suppression/maintenance
    const suppression = checkSuppression(db, event);
    if (suppression.suppressed) {
      log(`Event suppressed: ${suppression.reason}`);
      const alertId = storeAlert(db, event, 'suppressed', null);

      // Mark as suppressed
      db.prepare('UPDATE alerts SET is_suppressed = 1 WHERE id = ?').run(alertId);

      addAppNotification(db, 'suppressed', 'Alert Suppressed',
        `${event.description || event.event_type} suppressed: ${suppression.reason}`, 'info');

      broadcast({ type: 'alert_created', alert: getAlertById(db, alertId) });
      broadcast({ type: 'activity', activity: { type: 'alert_suppressed', message: `Alert suppressed: ${suppression.reason}`, timestamp: new Date().toISOString() } });

      return {
        success: true, suppressed: true, reason: suppression.reason,
        alert_id: alertId, pipeline: pipelineLog,
      };
    }
    log('Suppression check passed');

    // Step 5: Evaluate alert rules
    const ruleResult = evaluateRules(db, event);
    log(ruleResult.matched ? `Rule matched: ${ruleResult.rule.name}` : 'No specific rule matched, using defaults');

    const actions = ruleResult.actions;

    // Apply rule-determined severity and priority
    if (actions.severity) event.severity = actions.severity;
    const priority = actions.priority || 'P3';

    // Step 6: Check if this is a recovery event
    if (event.event_type === 'recovery' || event.event_type === 'resolved' || event.event_type?.includes('recover')) {
      log('Recovery event detected');
      return await handleRecoveryEvent(db, event, pipelineLog, log);
    }

    // Step 7: Correlate - find existing related incident
    let incident = null;
    let isNewIncident = false;

    if (actions.create_incident !== false) {
      const correlated = findCorrelatedIncident(db, event);
      if (correlated) {
        incident = correlated;
        log(`Correlated with existing incident INC-${incident.incident_number}`);
      } else {
        // Create new incident
        const incidentNumber = getNextIncidentNumber();
        const serviceRow = event.service_id ? db.prepare('SELECT name FROM services WHERE id = ?').get(event.service_id) : null;
        const serviceName = serviceRow?.name || event.service || 'Unknown';

        const title = generateIncidentTitle(event, serviceName);
        const teamId = actions.route_team || findTeamForService(db, event.service_id);

        const incidentId = uuidv4();
        db.prepare(`
          INSERT INTO incidents (id, organization_id, incident_number, title, severity, priority, status, service_id, environment, team_id, started_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(incidentId, ORG_ID, incidentNumber, title, event.severity, priority, 'triggered', event.service_id, event.environment, teamId, new Date().toISOString());

        incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
        isNewIncident = true;
        log(`Incident INC-${incidentNumber} created`);

        // Update service status
        if (event.service_id) {
          const newStatus = event.severity === 'critical' ? 'down' : 'degraded';
          db.prepare('UPDATE services SET status = ? WHERE id = ?').run(newStatus, event.service_id);
          log(`Service status updated to ${newStatus}`);
        }

        // Add timeline events
        addTimelineEvent(db, incidentId, 'alert_received', `Alert received: ${event.description || event.event_type}`);
        addTimelineEvent(db, incidentId, 'incident_created', `Incident INC-${incidentNumber} created — ${title}`);

        if (teamId) {
          const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(teamId);
          if (team) {
            addTimelineEvent(db, incidentId, 'team_assigned', `${team.name} team assigned`);
            log(`${team.name} team selected`);
          }
        }

        // Audit log
        addAuditLog(db, 'incident_created', 'incident', incidentId, `INC-${incidentNumber}`, `Incident created: ${title}`);

        // App notification
        addAppNotification(db, 'incident_created', `New ${event.severity} Incident`,
          `INC-${incidentNumber}: ${title}`, event.severity, `/incidents/${incidentId}`);
      }
    }

    // Step 8: Store alert
    const alertId = storeAlert(db, event, 'processed', incident?.id);
    log(`Alert stored: ${alertId}`);

    // Step 9: Send notifications
    if (actions.notify !== false && incident && isNewIncident) {
      log('Sending notifications...');
      const deliveryResults = await dispatchNotifications(db, incident, event, actions);
      for (const dr of deliveryResults) {
        const dest = dr.destination_type || dr.type;
        if (dr.status === 'delivered') {
          log(`${dest} notification delivered`);
          addTimelineEvent(db, incident.id, 'notification_delivered', `${dest} notification delivered`);
        } else if (dr.status === 'failed') {
          log(`${dest} notification failed: ${dr.error}`);
          addTimelineEvent(db, incident.id, 'notification_failed', `${dest} notification failed: ${dr.error || 'Unknown error'}`);
        }
      }
    } else if (incident && !isNewIncident) {
      // Add alert to existing incident timeline
      addTimelineEvent(db, incident.id, 'alert_correlated', `New alert correlated: ${event.description || event.event_type}`);
    }

    // Step 10: Schedule escalation
    if (isNewIncident && incident && actions.escalation_policy) {
      scheduleEscalation(db, incident, actions.escalation_policy);
      log('Escalation scheduled');
      addTimelineEvent(db, incident.id, 'escalation_scheduled', 'Escalation policy activated');
    }

    // Broadcast updates via WebSocket
    broadcast({ type: 'alert_created', alert: getAlertById(db, alertId) });
    if (incident) {
      broadcast({ type: isNewIncident ? 'incident_created' : 'incident_updated', incident });
    }
    broadcast({ type: 'activity', activity: { type: 'event_processed', message: `${event.event_type}: ${event.description || 'Event processed'}`, timestamp: new Date().toISOString() } });

    return {
      success: true,
      alert_id: alertId,
      incident_id: incident?.id,
      incident_number: incident?.incident_number,
      is_new_incident: isNewIncident,
      pipeline: pipelineLog,
    };

  } catch (err) {
    console.error('[Pipeline] Error:', err);
    log(`Pipeline error: ${err.message}`);
    return { success: false, error: err.message, pipeline: pipelineLog };
  }
}

async function handleRecoveryEvent(db, event, pipelineLog, log) {
  // Find matching open incident
  let matchingIncident = null;

  if (event.service_id) {
    matchingIncident = db.prepare(`
      SELECT * FROM incidents 
      WHERE service_id = ? AND environment = ? AND status NOT IN ('resolved') 
      ORDER BY started_at DESC LIMIT 1
    `).get(event.service_id, event.environment);
  }

  if (!matchingIncident && event.service) {
    const svc = db.prepare('SELECT id FROM services WHERE name = ?').get(event.service);
    if (svc) {
      matchingIncident = db.prepare(`
        SELECT * FROM incidents 
        WHERE service_id = ? AND environment = ? AND status NOT IN ('resolved') 
        ORDER BY started_at DESC LIMIT 1
      `).get(svc.id, event.environment);
    }
  }

  const alertId = storeAlert(db, event, 'processed', matchingIncident?.id);

  if (matchingIncident) {
    log(`Found matching open incident INC-${matchingIncident.incident_number}`);

    // Resolve the incident
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE incidents SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, matchingIncident.id);

    addTimelineEvent(db, matchingIncident.id, 'recovery_received', `Recovery event received: ${event.description || 'Service recovered'}`);
    addTimelineEvent(db, matchingIncident.id, 'incident_resolved', 'Incident automatically resolved by recovery event');

    // Update service status
    if (matchingIncident.service_id) {
      // Check if any other open incidents exist for this service
      const otherOpen = db.prepare(`
        SELECT COUNT(*) as c FROM incidents 
        WHERE service_id = ? AND status NOT IN ('resolved') AND id != ?
      `).get(matchingIncident.service_id, matchingIncident.id);

      if (otherOpen.c === 0) {
        db.prepare('UPDATE services SET status = ? WHERE id = ?').run('healthy', matchingIncident.service_id);
        log('Service status updated to healthy');
      }
    }

    // Cancel escalation
    cancelEscalation(matchingIncident.id);
    log('Escalation cancelled');

    // Send recovery notification
    const updatedIncident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(matchingIncident.id);
    const recoveryDeliveries = await dispatchNotifications(db, updatedIncident, event, { notify: true }, 'recovery');
    for (const dr of recoveryDeliveries) {
      const dest = dr.destination_type || dr.type;
      if (dr.status === 'delivered') {
        log(`Recovery ${dest} notification delivered`);
        addTimelineEvent(db, matchingIncident.id, 'notification_delivered', `Recovery ${dest} notification delivered`);
      }
    }

    addAuditLog(db, 'incident_resolved', 'incident', matchingIncident.id, `INC-${matchingIncident.incident_number}`, 'Auto-resolved by recovery event');
    addAppNotification(db, 'incident_resolved', 'Incident Resolved',
      `INC-${matchingIncident.incident_number} auto-resolved`, 'success', `/incidents/${matchingIncident.id}`);

    broadcast({ type: 'incident_updated', incident: updatedIncident });
    broadcast({ type: 'activity', activity: { type: 'incident_resolved', message: `INC-${matchingIncident.incident_number} auto-resolved by recovery event`, timestamp: now } });

    return {
      success: true,
      recovery: true,
      alert_id: alertId,
      incident_id: matchingIncident.id,
      incident_number: matchingIncident.incident_number,
      pipeline: pipelineLog,
    };
  } else {
    log('No matching open incident found for recovery event');
    return { success: true, recovery: true, alert_id: alertId, no_match: true, pipeline: pipelineLog };
  }
}

// Active escalation timers (in-process)
const escalationTimers = new Map();

function cancelEscalation(incidentId) {
  const timer = escalationTimers.get(incidentId);
  if (timer) {
    clearTimeout(timer);
    escalationTimers.delete(incidentId);
  }
}

export { escalationTimers, cancelEscalation };

function validateEvent(raw) {
  if (!raw) return { valid: false, error: 'Empty event' };
  if (!raw.event_type && !raw.source) return { valid: false, error: 'Missing event_type or source' };
  return { valid: true, event: raw };
}

function normalizeEvent(event) {
  const db = getDb();

  // Resolve service_id from service name if needed
  if (event.service && !event.service_id) {
    const svc = db.prepare('SELECT id FROM services WHERE name = ? COLLATE NOCASE').get(event.service);
    if (svc) event.service_id = svc.id;
  }

  return {
    event_id: event.event_id || uuidv4(),
    source: event.source || 'unknown',
    event_type: event.event_type || 'generic',
    service: event.service || null,
    service_id: event.service_id || null,
    environment: event.environment || 'production',
    severity: (event.severity || 'info').toLowerCase(),
    metric: event.metric || null,
    value: event.value != null ? String(event.value) : null,
    threshold: event.threshold != null ? String(event.threshold) : null,
    description: event.description || `${event.event_type} from ${event.source}`,
    timestamp: event.timestamp || new Date().toISOString(),
    metadata: event.metadata ? (typeof event.metadata === 'string' ? event.metadata : JSON.stringify(event.metadata)) : null,
  };
}

function checkDuplicate(db, event) {
  if (!event.event_id) return { duplicate: false };

  const existing = db.prepare('SELECT id, incident_id FROM alerts WHERE event_id = ? AND is_duplicate = 0').get(event.event_id);
  if (existing) {
    return { duplicate: true, existingAlertId: existing.id, existingIncidentId: existing.incident_id };
  }
  return { duplicate: false };
}

function storeAlert(db, event, status, incidentId) {
  const alertId = uuidv4();
  db.prepare(`
    INSERT INTO alerts (id, organization_id, event_id, source, event_type, service_id, environment, severity, metric, value, threshold, description, timestamp, metadata, processing_status, incident_id, is_duplicate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    alertId, ORG_ID, event.event_id, event.source, event.event_type,
    event.service_id, event.environment, event.severity, event.metric,
    event.value, event.threshold, event.description, event.timestamp,
    event.metadata, status, incidentId, status === 'duplicate' ? 1 : 0
  );
  return alertId;
}

function getAlertById(db, id) {
  return db.prepare(`
    SELECT a.*, s.name as service_name
    FROM alerts a
    LEFT JOIN services s ON a.service_id = s.id
    WHERE a.id = ?
  `).get(id);
}

function generateIncidentTitle(event, serviceName) {
  const metric = event.metric ? ` ${event.metric}` : '';
  const eventType = event.event_type || 'Alert';

  if (event.event_type?.toLowerCase().includes('cpu')) return `${serviceName}${metric} CPU Saturation`;
  if (event.event_type?.toLowerCase().includes('memory')) return `${serviceName} Memory Pressure`;
  if (event.event_type?.toLowerCase().includes('disk')) return `${serviceName} Disk Space Critical`;
  if (event.event_type?.toLowerCase().includes('connection')) return `${serviceName} Connection Pool Exhaustion`;
  if (event.event_type?.toLowerCase().includes('latency')) return `${serviceName} High Latency`;
  if (event.event_type?.toLowerCase().includes('error')) return `${serviceName} Error Rate Elevated`;
  if (event.event_type?.toLowerCase().includes('down')) return `${serviceName} Service Down`;
  if (event.event_type?.toLowerCase().includes('deploy')) return `${serviceName} Deployment Failure`;

  return event.description || `${serviceName} — ${eventType}`;
}

function findTeamForService(db, serviceId) {
  if (!serviceId) return null;
  const svc = db.prepare('SELECT team_id FROM services WHERE id = ?').get(serviceId);
  return svc?.team_id || null;
}

export function addTimelineEvent(db, incidentId, type, message, userId = null, metadata = null) {
  const id = uuidv4();
  db.prepare('INSERT INTO incident_events (id, incident_id, type, message, user_id, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, incidentId, type, message, userId, new Date().toISOString(), metadata ? JSON.stringify(metadata) : null);
  return id;
}

export function addAuditLog(db, action, objectType, objectId, objectName, details, userId = null, userName = null) {
  const id = uuidv4();
  db.prepare('INSERT INTO audit_logs (id, organization_id, user_id, user_name, action, object_type, object_id, object_name, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, ORG_ID, userId, userName || 'System', action, objectType, objectId, objectName, details, new Date().toISOString());
}

export function addAppNotification(db, type, title, message, severity = 'info', link = null) {
  const id = uuidv4();
  db.prepare('INSERT INTO app_notifications (id, organization_id, type, title, message, severity, link) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, ORG_ID, type, title, message, severity, link);
  broadcast({ type: 'notification', notification: { id, type, title, message, severity, link, read: 0, created_at: new Date().toISOString() } });
}
