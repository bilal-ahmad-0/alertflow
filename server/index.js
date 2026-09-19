import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import { getDb, waitForDb } from './db.js';
import { processEvent, addTimelineEvent, addAuditLog, addAppNotification, cancelEscalation } from './engine/pipeline.js';
import { checkRuleConflicts } from './engine/rules.js';
import { dispatchNotifications } from './notifications/dispatcher.js';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

const PORT = 3001;
const ORG_ID = 'org-default';

// WebSocket connections
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

export function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

// ==========================================
// EVENTS / PIPELINE
// ==========================================

// Event simulator / webhook ingestion
app.post('/api/events', async (req, res) => {
  try {
    const result = await processEvent(req.body);
    res.json(result);
  } catch (err) {
    console.error('[API] Event processing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// External webhook endpoint (same pipeline)
app.post('/api/webhook/ingest', async (req, res) => {
  try {
    const result = await processEvent(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// DASHBOARD
// ==========================================

app.get('/api/dashboard', (req, res) => {
  const db = getDb();

  const openIncidents = db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE status NOT IN ('resolved') AND organization_id = ?`).get(ORG_ID).c;
  const criticalIncidents = db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE severity = 'critical' AND status NOT IN ('resolved') AND organization_id = ?`).get(ORG_ID).c;

  const today = new Date().toISOString().split('T')[0];
  const alertsToday = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE date(created_at) = ? AND organization_id = ?`).get(today, ORG_ID).c;

  const totalDeliveries = db.prepare(`SELECT COUNT(*) as c FROM deliveries`).get().c;
  const successDeliveries = db.prepare(`SELECT COUNT(*) as c FROM deliveries WHERE status = 'delivered'`).get().c;
  const deliverySuccessRate = totalDeliveries > 0 ? Math.round((successDeliveries / totalDeliveries) * 100) : 100;

  // MTTA
  const mttaRow = db.prepare(`
    SELECT AVG((julianday(acknowledged_at) - julianday(started_at)) * 86400) as avg_seconds 
    FROM incidents WHERE acknowledged_at IS NOT NULL AND organization_id = ?
  `).get(ORG_ID);
  const mtta = mttaRow?.avg_seconds ? Math.round(mttaRow.avg_seconds) : null;

  // MTTR
  const mttrRow = db.prepare(`
    SELECT AVG((julianday(resolved_at) - julianday(started_at)) * 86400) as avg_seconds 
    FROM incidents WHERE resolved_at IS NOT NULL AND organization_id = ?
  `).get(ORG_ID);
  const mttr = mttrRow?.avg_seconds ? Math.round(mttrRow.avg_seconds) : null;

  // Alert noise
  const totalAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE organization_id = ?`).get(ORG_ID).c;
  const duplicateAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE is_duplicate = 1 AND organization_id = ?`).get(ORG_ID).c;
  const suppressedAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE is_suppressed = 1 AND organization_id = ?`).get(ORG_ID).c;
  const noiseAlerts = duplicateAlerts + suppressedAlerts;
  const alertNoise = totalAlerts > 0 ? Math.round((noiseAlerts / totalAlerts) * 100) : 0;

  // Escalations
  const escalations = db.prepare(`SELECT COUNT(*) as c FROM incident_events WHERE type = 'escalation'`).get().c;

  // Active incidents
  const activeIncidents = db.prepare(`
    SELECT i.*, s.name as service_name, t.name as team_name, u.name as assignee_name
    FROM incidents i
    LEFT JOIN services s ON i.service_id = s.id
    LEFT JOIN teams t ON i.team_id = t.id
    LEFT JOIN users u ON i.assignee_id = u.id
    WHERE i.status NOT IN ('resolved') AND i.organization_id = ?
    ORDER BY
      CASE i.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      i.started_at DESC
    LIMIT 20
  `).all(ORG_ID);

  // Service health
  const serviceHealth = db.prepare(`
    SELECT s.*, t.name as team_name,
      (SELECT COUNT(*) FROM incidents WHERE service_id = s.id AND status NOT IN ('resolved')) as open_incidents,
      (SELECT COUNT(*) FROM alerts WHERE service_id = s.id AND date(created_at) = ?) as alerts_today,
      (SELECT MAX(timestamp) FROM alerts WHERE service_id = s.id) as last_event
    FROM services s
    LEFT JOIN teams t ON s.team_id = t.id
    WHERE s.organization_id = ?
    ORDER BY
      CASE s.status WHEN 'down' THEN 1 WHEN 'degraded' THEN 2 WHEN 'unknown' THEN 3 ELSE 4 END,
      s.name
  `).all(today, ORG_ID);

  // Recent activity
  const recentActivity = db.prepare(`
    SELECT ie.*, i.incident_number, i.title as incident_title
    FROM incident_events ie
    JOIN incidents i ON ie.incident_id = i.id
    ORDER BY ie.timestamp DESC
    LIMIT 20
  `).all();

  res.json({
    kpis: {
      openIncidents, criticalIncidents, alertsToday, deliverySuccessRate,
      mtta, mttr, alertNoise, escalations,
    },
    activeIncidents,
    serviceHealth,
    recentActivity,
  });
});

// ==========================================
// INCIDENTS
// ==========================================

app.get('/api/incidents', (req, res) => {
  const db = getDb();
  const { status, severity, priority, team, service, environment, search, limit = 50 } = req.query;

  let where = ['i.organization_id = ?'];
  let params = [ORG_ID];

  if (status && status !== 'all') {
    where.push('i.status = ?');
    params.push(status);
  }
  if (severity) { where.push('i.severity = ?'); params.push(severity); }
  if (priority) { where.push('i.priority = ?'); params.push(priority); }
  if (team) { where.push('i.team_id = ?'); params.push(team); }
  if (service) { where.push('i.service_id = ?'); params.push(service); }
  if (environment) { where.push('i.environment = ?'); params.push(environment); }
  if (search) { where.push(`(i.title LIKE ? OR CAST(i.incident_number AS TEXT) LIKE ?)`); params.push(`%${search}%`, `%${search}%`); }

  const incidents = db.prepare(`
    SELECT i.*, s.name as service_name, t.name as team_name, u.name as assignee_name
    FROM incidents i
    LEFT JOIN services s ON i.service_id = s.id
    LEFT JOIN teams t ON i.team_id = t.id
    LEFT JOIN users u ON i.assignee_id = u.id
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE i.status WHEN 'triggered' THEN 1 WHEN 'investigating' THEN 2 WHEN 'acknowledged' THEN 3 WHEN 'mitigating' THEN 4 ELSE 5 END,
      CASE i.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      i.started_at DESC
    LIMIT ?
  `).all(...params, Number(limit));

  res.json(incidents);
});

app.get('/api/incidents/:id', (req, res) => {
  const db = getDb();
  const incident = db.prepare(`
    SELECT i.*, s.name as service_name, t.name as team_name, u.name as assignee_name
    FROM incidents i
    LEFT JOIN services s ON i.service_id = s.id
    LEFT JOIN teams t ON i.team_id = t.id
    LEFT JOIN users u ON i.assignee_id = u.id
    WHERE i.id = ?
  `).get(req.params.id);

  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  // Timeline
  const timeline = db.prepare(`
    SELECT ie.*, u.name as user_name
    FROM incident_events ie
    LEFT JOIN users u ON ie.user_id = u.id
    WHERE ie.incident_id = ?
    ORDER BY ie.timestamp ASC
  `).all(req.params.id);

  // Related alerts
  const alerts = db.prepare(`
    SELECT a.*, s.name as service_name
    FROM alerts a
    LEFT JOIN services s ON a.service_id = s.id
    WHERE a.incident_id = ?
    ORDER BY a.timestamp DESC
  `).all(req.params.id);

  // Deliveries
  const deliveries = db.prepare(`
    SELECT d.*, dest.name as destination_name
    FROM deliveries d
    LEFT JOIN destinations dest ON d.destination_id = dest.id
    WHERE d.incident_id = ?
    ORDER BY d.created_at DESC
  `).all(req.params.id);

  res.json({ ...incident, timeline, alerts, deliveries });
});

// Incident actions
app.post('/api/incidents/:id/acknowledge', (req, res) => {
  const db = getDb();
  const { user_id = 'user-ahmed' } = req.body;
  const now = new Date().toISOString();

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  db.prepare('UPDATE incidents SET status = ?, acknowledged_at = ?, updated_at = ? WHERE id = ?')
    .run('acknowledged', now, now, req.params.id);

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(user_id);
  const userName = user?.name || 'Unknown';

  addTimelineEvent(db, req.params.id, 'acknowledged', `Acknowledged by ${userName}`);
  cancelEscalation(req.params.id);
  addAuditLog(db, 'incident_acknowledged', 'incident', req.params.id, `INC-${incident.incident_number}`, `Acknowledged by ${userName}`, user_id, userName);
  addAppNotification(db, 'incident_acknowledged', 'Incident Acknowledged', `INC-${incident.incident_number} acknowledged by ${userName}`, 'info', `/incidents/${req.params.id}`);

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  broadcast({ type: 'incident_updated', incident: updated });
  broadcast({ type: 'activity', activity: { type: 'incident_acknowledged', message: `${userName} acknowledged INC-${incident.incident_number}`, timestamp: now } });

  res.json({ success: true, incident: updated });
});

app.post('/api/incidents/:id/resolve', async (req, res) => {
  const db = getDb();
  const { user_id = 'user-ahmed', root_cause, impact, resolution, followup } = req.body;
  const now = new Date().toISOString();

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  db.prepare('UPDATE incidents SET status = ?, resolved_at = ?, updated_at = ?, root_cause = ?, impact = ?, resolution = ?, followup = ? WHERE id = ?')
    .run('resolved', now, now, root_cause || null, impact || null, resolution || null, followup || null, req.params.id);

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(user_id);
  const userName = user?.name || 'Unknown';

  addTimelineEvent(db, req.params.id, 'resolved', `Resolved by ${userName}`);
  cancelEscalation(req.params.id);

  // Update service status
  if (incident.service_id) {
    const otherOpen = db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE service_id = ? AND status NOT IN ('resolved') AND id != ?`).get(incident.service_id, req.params.id);
    if (otherOpen.c === 0) {
      db.prepare('UPDATE services SET status = ? WHERE id = ?').run('healthy', incident.service_id);
    }
  }

  addAuditLog(db, 'incident_resolved', 'incident', req.params.id, `INC-${incident.incident_number}`, `Resolved by ${userName}`, user_id, userName);
  addAppNotification(db, 'incident_resolved', 'Incident Resolved', `INC-${incident.incident_number} resolved by ${userName}`, 'success', `/incidents/${req.params.id}`);

  // Send recovery notifications
  const updatedIncident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  await dispatchNotifications(db, updatedIncident, null, { notify: true }, 'recovery');

  broadcast({ type: 'incident_updated', incident: updatedIncident });
  broadcast({ type: 'activity', activity: { type: 'incident_resolved', message: `${userName} resolved INC-${incident.incident_number}`, timestamp: now } });

  res.json({ success: true, incident: updatedIncident });
});

app.post('/api/incidents/:id/assign', (req, res) => {
  const db = getDb();
  const { team_id, assignee_id, user_id = 'user-ahmed' } = req.body;
  const now = new Date().toISOString();

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const updates = [];
  const params = [];

  if (team_id) { updates.push('team_id = ?'); params.push(team_id); }
  if (assignee_id) { updates.push('assignee_id = ?'); params.push(assignee_id); }
  updates.push('updated_at = ?'); params.push(now);
  params.push(req.params.id);

  db.prepare(`UPDATE incidents SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  if (assignee_id) {
    const assignee = db.prepare('SELECT name FROM users WHERE id = ?').get(assignee_id);
    addTimelineEvent(db, req.params.id, 'assigned', `Assigned to ${assignee?.name || 'Unknown'}`, user_id);
  }
  if (team_id) {
    const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(team_id);
    addTimelineEvent(db, req.params.id, 'team_assigned', `Reassigned to ${team?.name || 'Unknown'} team`, user_id);
  }

  const updated = db.prepare(`SELECT i.*, s.name as service_name, t.name as team_name, u.name as assignee_name FROM incidents i LEFT JOIN services s ON i.service_id = s.id LEFT JOIN teams t ON i.team_id = t.id LEFT JOIN users u ON i.assignee_id = u.id WHERE i.id = ?`).get(req.params.id);
  broadcast({ type: 'incident_updated', incident: updated });

  res.json({ success: true, incident: updated });
});

app.post('/api/incidents/:id/escalate', async (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  addTimelineEvent(db, req.params.id, 'escalation', 'Manually escalated');
  addAppNotification(db, 'escalation', 'Incident Escalated', `INC-${incident.incident_number} manually escalated`, 'warning', `/incidents/${req.params.id}`);
  await dispatchNotifications(db, incident, null, { notify: true }, 'escalation');

  broadcast({ type: 'activity', activity: { type: 'escalation', message: `INC-${incident.incident_number} manually escalated`, timestamp: now } });
  res.json({ success: true });
});

app.post('/api/incidents/:id/reopen', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare('UPDATE incidents SET status = ?, resolved_at = NULL, updated_at = ? WHERE id = ?')
    .run('investigating', now, req.params.id);

  addTimelineEvent(db, req.params.id, 'reopened', 'Incident reopened');
  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  broadcast({ type: 'incident_updated', incident: updated });

  res.json({ success: true, incident: updated });
});

app.post('/api/incidents/:id/status', (req, res) => {
  const db = getDb();
  const { status, user_id = 'user-ahmed' } = req.body;
  const now = new Date().toISOString();

  db.prepare('UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(user_id);
  addTimelineEvent(db, req.params.id, 'status_changed', `Status changed to ${status} by ${user?.name || 'Unknown'}`, user_id);

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  broadcast({ type: 'incident_updated', incident: updated });
  res.json({ success: true, incident: updated });
});

app.post('/api/incidents/:id/notes', (req, res) => {
  const db = getDb();
  const { message, user_id = 'user-ahmed' } = req.body;

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(user_id);
  addTimelineEvent(db, req.params.id, 'note', `${user?.name || 'Unknown'}: ${message}`, user_id);

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  broadcast({ type: 'incident_updated', incident: updated });
  res.json({ success: true });
});

app.post('/api/incidents/:id/postmortem', (req, res) => {
  const db = getDb();
  const { root_cause, impact, resolution, followup } = req.body;
  const now = new Date().toISOString();

  db.prepare('UPDATE incidents SET root_cause = ?, impact = ?, resolution = ?, followup = ?, updated_at = ? WHERE id = ?')
    .run(root_cause || null, impact || null, resolution || null, followup || null, now, req.params.id);

  res.json({ success: true });
});

// ==========================================
// ALERTS
// ==========================================

app.get('/api/alerts', (req, res) => {
  const db = getDb();
  const { source, severity, service, environment, status, search, limit = 100 } = req.query;

  let where = ['a.organization_id = ?'];
  let params = [ORG_ID];

  if (source) { where.push('a.source = ?'); params.push(source); }
  if (severity) { where.push('a.severity = ?'); params.push(severity); }
  if (service) { where.push('a.service_id = ?'); params.push(service); }
  if (environment) { where.push('a.environment = ?'); params.push(environment); }
  if (status) { where.push('a.processing_status = ?'); params.push(status); }
  if (search) { where.push('(a.description LIKE ? OR a.event_type LIKE ? OR a.event_id LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  const alerts = db.prepare(`
    SELECT a.*, s.name as service_name, i.incident_number
    FROM alerts a
    LEFT JOIN services s ON a.service_id = s.id
    LEFT JOIN incidents i ON a.incident_id = i.id
    WHERE ${where.join(' AND ')}
    ORDER BY a.timestamp DESC
    LIMIT ?
  `).all(...params, Number(limit));

  res.json(alerts);
});

// ==========================================
// SERVICES
// ==========================================

app.get('/api/services', (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const services = db.prepare(`
    SELECT s.*, t.name as team_name,
      (SELECT COUNT(*) FROM incidents WHERE service_id = s.id AND status NOT IN ('resolved')) as open_incidents,
      (SELECT COUNT(*) FROM alerts WHERE service_id = s.id AND date(created_at) = ?) as alerts_today
    FROM services s
    LEFT JOIN teams t ON s.team_id = t.id
    WHERE s.organization_id = ?
    ORDER BY s.name
  `).all(today, ORG_ID);

  res.json(services);
});

app.get('/api/services/:id', (req, res) => {
  const db = getDb();
  const service = db.prepare(`
    SELECT s.*, t.name as team_name
    FROM services s LEFT JOIN teams t ON s.team_id = t.id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!service) return res.status(404).json({ error: 'Service not found' });

  const incidents = db.prepare(`SELECT * FROM incidents WHERE service_id = ? ORDER BY started_at DESC LIMIT 20`).all(req.params.id);
  const alerts = db.prepare(`SELECT * FROM alerts WHERE service_id = ? ORDER BY timestamp DESC LIMIT 50`).all(req.params.id);
  const dependencies = db.prepare(`
    SELECT s.* FROM service_dependencies sd
    JOIN services s ON sd.depends_on_id = s.id
    WHERE sd.service_id = ?
  `).all(req.params.id);
  const dependents = db.prepare(`
    SELECT s.* FROM service_dependencies sd
    JOIN services s ON sd.service_id = s.id
    WHERE sd.depends_on_id = ?
  `).all(req.params.id);

  res.json({ ...service, incidents, alerts, dependencies, dependents });
});

// ==========================================
// TEAMS
// ==========================================

app.get('/api/teams', (req, res) => {
  const db = getDb();
  const teams = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count,
      (SELECT COUNT(*) FROM incidents WHERE team_id = t.id AND status NOT IN ('resolved')) as open_incidents
    FROM teams t WHERE t.organization_id = ?
    ORDER BY t.name
  `).all(ORG_ID);

  // Get members and on-call for each team
  for (const team of teams) {
    team.members = db.prepare(`
      SELECT u.*, tm.role as team_role
      FROM team_members tm JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ?
    `).all(team.id);

    const oncall = db.prepare(`SELECT * FROM oncall_schedules WHERE team_id = ?`).get(team.id);
    if (oncall) {
      const members = JSON.parse(oncall.members || '[]');
      const currentIdx = oncall.current_index || 0;
      if (members.length > 0) {
        const primaryUser = db.prepare('SELECT * FROM users WHERE id = ?').get(members[currentIdx % members.length]);
        const secondaryUser = members.length > 1 ? db.prepare('SELECT * FROM users WHERE id = ?').get(members[(currentIdx + 1) % members.length]) : null;
        team.oncall = { primary: primaryUser, secondary: secondaryUser, schedule: oncall };
      }
    }
  }

  res.json(teams);
});

// ==========================================
// DESTINATIONS
// ==========================================

app.get('/api/destinations', (req, res) => {
  const db = getDb();
  const destinations = db.prepare(`SELECT * FROM destinations WHERE organization_id = ? ORDER BY created_at DESC`).all(ORG_ID);

  // Mask sensitive config
  const masked = destinations.map(d => {
    const config = d.configuration ? JSON.parse(d.configuration) : {};
    const safeConfig = { ...config };
    if (safeConfig.webhook_url) safeConfig.webhook_url = maskUrl(safeConfig.webhook_url);
    if (safeConfig.app_password) safeConfig.app_password = '••••••••';
    if (safeConfig.smtp_pass) safeConfig.smtp_pass = '••••••••';
    return { ...d, configuration: JSON.stringify(safeConfig) };
  });

  res.json(masked);
});

app.post('/api/destinations', (req, res) => {
  const db = getDb();
  const { type, name, configuration } = req.body;
  const id = uuidv4();

  db.prepare(`INSERT INTO destinations (id, organization_id, type, name, status, enabled, configuration) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, ORG_ID, type, name, 'connected', 1, JSON.stringify(configuration));

  addAuditLog(db, 'destination_connected', 'destination', id, name, `${type} destination connected`);
  addAppNotification(db, 'destination_connected', 'Destination Connected', `${name} (${type}) connected successfully`, 'success');

  res.json({ success: true, id });
});

app.put('/api/destinations/:id', (req, res) => {
  const db = getDb();
  const { name, configuration, enabled } = req.body;

  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (configuration !== undefined) { updates.push('configuration = ?'); params.push(JSON.stringify(configuration)); }
  if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
  params.push(req.params.id);

  db.prepare(`UPDATE destinations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

app.delete('/api/destinations/:id', (req, res) => {
  const db = getDb();
  const dest = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);

  db.prepare('DELETE FROM destinations WHERE id = ?').run(req.params.id);
  addAuditLog(db, 'destination_disconnected', 'destination', req.params.id, dest?.name, `${dest?.type} destination disconnected`);

  res.json({ success: true });
});

app.post('/api/destinations/:id/test', async (req, res) => {
  const db = getDb();
  const dest = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
  if (!dest) return res.status(404).json({ error: 'Destination not found' });

  const config = JSON.parse(dest.configuration || '{}');
  const template = {
    subject: '🔔 AlertOps Test Notification',
    service: 'AlertOps',
    environment: 'Test',
    description: 'This is a test notification from AlertOps to verify your destination configuration.',
    severity: 'info',
    priority: 'P4',
    incident_id: 'TEST',
  };

  const testIncident = {
    incident_number: 'TEST',
    title: 'Test Notification',
    severity: 'info',
    priority: 'P4',
    environment: 'Test',
  };

  try {
    let result;
    if (dest.type === 'slack') {
      const { sendSlackNotification } = await import('./notifications/slack.js');
      result = await sendSlackNotification(config, template, testIncident, 'alert');
    } else if (dest.type === 'email') {
      const { sendEmailNotification } = await import('./notifications/email.js');
      result = await sendEmailNotification(config, template, testIncident, 'alert');
    }

    if (result?.success) {
      db.prepare('UPDATE destinations SET last_success_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
      res.json({ success: true, message: 'Test notification sent successfully' });
    } else {
      res.json({ success: false, error: result?.error || 'Test failed' });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

function maskUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = u.pathname;
    return `${u.origin}/${path.substring(1, 12)}...`;
  } catch {
    return url.substring(0, 30) + '...';
  }
}

// ==========================================
// ALERT RULES
// ==========================================

app.get('/api/rules', (req, res) => {
  const db = getDb();
  const rules = db.prepare(`SELECT * FROM alert_rules WHERE organization_id = ? ORDER BY priority ASC`).all(ORG_ID);
  res.json(rules);
});

app.post('/api/rules', (req, res) => {
  const db = getDb();
  const { name, description, priority, conditions, actions, enabled = true } = req.body;
  const id = uuidv4();

  db.prepare(`INSERT INTO alert_rules (id, organization_id, name, description, priority, conditions, actions, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, ORG_ID, name, description, priority || 50, JSON.stringify(conditions), JSON.stringify(actions), enabled ? 1 : 0);

  addAuditLog(db, 'rule_created', 'alert_rule', id, name, `Rule created: ${name}`);
  res.json({ success: true, id });
});

app.put('/api/rules/:id', (req, res) => {
  const db = getDb();
  const { name, description, priority, conditions, actions, enabled } = req.body;
  const now = new Date().toISOString();

  const updates = ['updated_at = ?'];
  const params = [now];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
  if (conditions !== undefined) { updates.push('conditions = ?'); params.push(JSON.stringify(conditions)); }
  if (actions !== undefined) { updates.push('actions = ?'); params.push(JSON.stringify(actions)); }
  if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
  params.push(req.params.id);

  db.prepare(`UPDATE alert_rules SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  addAuditLog(db, 'rule_updated', 'alert_rule', req.params.id, name, `Rule updated`);
  res.json({ success: true });
});

app.delete('/api/rules/:id', (req, res) => {
  const db = getDb();
  const rule = db.prepare('SELECT name FROM alert_rules WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM alert_rules WHERE id = ?').run(req.params.id);
  addAuditLog(db, 'rule_deleted', 'alert_rule', req.params.id, rule?.name, `Rule deleted`);
  res.json({ success: true });
});

app.get('/api/rules/:id/conflicts', (req, res) => {
  const db = getDb();
  const conflicts = checkRuleConflicts(db, req.params.id);
  res.json(conflicts);
});

// ==========================================
// ESCALATION POLICIES
// ==========================================

app.get('/api/escalation-policies', (req, res) => {
  const db = getDb();
  const policies = db.prepare(`SELECT * FROM escalation_policies WHERE organization_id = ? ORDER BY name`).all(ORG_ID);
  res.json(policies);
});

app.post('/api/escalation-policies', (req, res) => {
  const db = getDb();
  const { name, description, steps, enabled = true } = req.body;
  const id = uuidv4();

  db.prepare(`INSERT INTO escalation_policies (id, organization_id, name, description, steps, enabled) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, ORG_ID, name, description, JSON.stringify(steps), enabled ? 1 : 0);

  addAuditLog(db, 'escalation_policy_created', 'escalation_policy', id, name, `Escalation policy created`);
  res.json({ success: true, id });
});

app.put('/api/escalation-policies/:id', (req, res) => {
  const db = getDb();
  const { name, description, steps, enabled } = req.body;

  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (steps !== undefined) { updates.push('steps = ?'); params.push(JSON.stringify(steps)); }
  if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
  params.push(req.params.id);

  db.prepare(`UPDATE escalation_policies SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// ==========================================
// ON-CALL
// ==========================================

app.get('/api/oncall', (req, res) => {
  const db = getDb();
  const schedules = db.prepare(`
    SELECT oc.*, t.name as team_name
    FROM oncall_schedules oc
    JOIN teams t ON oc.team_id = t.id
    ORDER BY t.name
  `).all();

  const result = schedules.map(oc => {
    const members = JSON.parse(oc.members || '[]');
    const currentIdx = oc.current_index || 0;

    const resolvedMembers = members.map(uid => db.prepare('SELECT * FROM users WHERE id = ?').get(uid)).filter(Boolean);

    const primary = resolvedMembers[currentIdx % resolvedMembers.length] || null;
    const secondary = resolvedMembers.length > 1 ? resolvedMembers[(currentIdx + 1) % resolvedMembers.length] : null;

    return {
      ...oc,
      resolved_members: resolvedMembers,
      primary,
      secondary,
    };
  });

  res.json(result);
});

// ==========================================
// MAINTENANCE WINDOWS
// ==========================================

app.get('/api/maintenance', (req, res) => {
  const db = getDb();
  const windows = db.prepare(`SELECT * FROM maintenance_windows WHERE organization_id = ? ORDER BY start_time DESC`).all(ORG_ID);
  res.json(windows);
});

app.post('/api/maintenance', (req, res) => {
  const db = getDb();
  const { name, start_time, end_time, services, environments, suppression_policy = 'all' } = req.body;
  const id = uuidv4();

  db.prepare(`INSERT INTO maintenance_windows (id, organization_id, name, start_time, end_time, services, environments, suppression_policy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, ORG_ID, name, start_time, end_time, JSON.stringify(services || []), JSON.stringify(environments || []), suppression_policy);

  addAuditLog(db, 'maintenance_created', 'maintenance_window', id, name, `Maintenance window created: ${name}`);
  res.json({ success: true, id });
});

app.delete('/api/maintenance/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM maintenance_windows WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==========================================
// ANALYTICS
// ==========================================

app.get('/api/analytics', (req, res) => {
  const db = getDb();

  const totalAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE organization_id = ?`).get(ORG_ID).c;
  const criticalAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE severity = 'critical' AND organization_id = ?`).get(ORG_ID).c;
  const warningAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE severity = 'warning' AND organization_id = ?`).get(ORG_ID).c;
  const infoAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE severity = 'info' AND organization_id = ?`).get(ORG_ID).c;

  const totalIncidents = db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE organization_id = ?`).get(ORG_ID).c;
  const resolvedIncidents = db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE status = 'resolved' AND organization_id = ?`).get(ORG_ID).c;
  const escalations = db.prepare(`SELECT COUNT(*) as c FROM incident_events WHERE type = 'escalation'`).get().c;

  const duplicateAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE is_duplicate = 1 AND organization_id = ?`).get(ORG_ID).c;
  const suppressedAlerts = db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE is_suppressed = 1 AND organization_id = ?`).get(ORG_ID).c;

  const failedDeliveries = db.prepare(`SELECT COUNT(*) as c FROM deliveries WHERE status = 'failed'`).get().c;
  const totalDeliveries = db.prepare(`SELECT COUNT(*) as c FROM deliveries`).get().c;
  const successDeliveries = db.prepare(`SELECT COUNT(*) as c FROM deliveries WHERE status = 'delivered'`).get().c;

  // MTTA
  const mttaRow = db.prepare(`SELECT AVG((julianday(acknowledged_at) - julianday(started_at)) * 86400) as avg_seconds FROM incidents WHERE acknowledged_at IS NOT NULL AND organization_id = ?`).get(ORG_ID);
  const mtta = mttaRow?.avg_seconds ? Math.round(mttaRow.avg_seconds) : null;

  // MTTR
  const mttrRow = db.prepare(`SELECT AVG((julianday(resolved_at) - julianday(started_at)) * 86400) as avg_seconds FROM incidents WHERE resolved_at IS NOT NULL AND organization_id = ?`).get(ORG_ID);
  const mttr = mttrRow?.avg_seconds ? Math.round(mttrRow.avg_seconds) : null;

  // Incidents by service
  const incidentsByService = db.prepare(`
    SELECT s.name, COUNT(i.id) as count
    FROM incidents i JOIN services s ON i.service_id = s.id
    WHERE i.organization_id = ?
    GROUP BY s.name ORDER BY count DESC
  `).all(ORG_ID);

  // Incidents by severity
  const incidentsBySeverity = db.prepare(`
    SELECT severity, COUNT(*) as count FROM incidents WHERE organization_id = ? GROUP BY severity
  `).all(ORG_ID);

  // Incidents by team
  const incidentsByTeam = db.prepare(`
    SELECT t.name, COUNT(i.id) as count
    FROM incidents i JOIN teams t ON i.team_id = t.id
    WHERE i.organization_id = ?
    GROUP BY t.name ORDER BY count DESC
  `).all(ORG_ID);

  // Alerts by day (last 7 days)
  const alertsByDay = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM alerts WHERE organization_id = ? AND created_at > datetime('now', '-7 days')
    GROUP BY date(created_at) ORDER BY day
  `).all(ORG_ID);

  const alertNoise = totalAlerts > 0 ? Math.round(((duplicateAlerts + suppressedAlerts) / totalAlerts) * 100) : 0;

  res.json({
    totalAlerts, criticalAlerts, warningAlerts, infoAlerts,
    totalIncidents, resolvedIncidents, escalations,
    duplicateAlerts, suppressedAlerts, failedDeliveries,
    totalDeliveries, successDeliveries,
    mtta, mttr, alertNoise,
    incidentsByService, incidentsBySeverity, incidentsByTeam, alertsByDay,
    resolutionRate: totalIncidents > 0 ? Math.round((resolvedIncidents / totalIncidents) * 100) : 0,
    escalationRate: totalIncidents > 0 ? Math.round((escalations / totalIncidents) * 100) : 0,
    deliverySuccessRate: totalDeliveries > 0 ? Math.round((successDeliveries / totalDeliveries) * 100) : 100,
  });
});

// ==========================================
// AUDIT LOG
// ==========================================

app.get('/api/audit-log', (req, res) => {
  const db = getDb();
  const { action, object_type, limit = 100 } = req.query;

  let where = ['organization_id = ?'];
  let params = [ORG_ID];

  if (action) { where.push('action = ?'); params.push(action); }
  if (object_type) { where.push('object_type = ?'); params.push(object_type); }

  const logs = db.prepare(`
    SELECT * FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY timestamp DESC LIMIT ?
  `).all(...params, Number(limit));

  res.json(logs);
});

// ==========================================
// SEARCH
// ==========================================

app.get('/api/search', (req, res) => {
  const db = getDb();
  const { q } = req.query;
  if (!q) return res.json({ incidents: [], alerts: [], services: [], teams: [], rules: [] });

  const term = `%${q}%`;

  const incidents = db.prepare(`
    SELECT i.*, s.name as service_name FROM incidents i LEFT JOIN services s ON i.service_id = s.id
    WHERE i.title LIKE ? OR CAST(i.incident_number AS TEXT) LIKE ? LIMIT 10
  `).all(term, term);

  const alerts = db.prepare(`
    SELECT a.*, s.name as service_name FROM alerts a LEFT JOIN services s ON a.service_id = s.id
    WHERE a.description LIKE ? OR a.event_id LIKE ? LIMIT 10
  `).all(term, term);

  const services = db.prepare(`SELECT * FROM services WHERE name LIKE ? LIMIT 10`).all(term);
  const teams = db.prepare(`SELECT * FROM teams WHERE name LIKE ? LIMIT 10`).all(term);
  const rules = db.prepare(`SELECT * FROM alert_rules WHERE name LIKE ? LIMIT 10`).all(term);

  res.json({ incidents, alerts, services, teams, rules });
});

// ==========================================
// NOTIFICATIONS (in-app)
// ==========================================

app.get('/api/notifications', (req, res) => {
  const db = getDb();
  const notifications = db.prepare(`
    SELECT * FROM app_notifications WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(ORG_ID);
  const unreadCount = db.prepare(`
    SELECT COUNT(*) as c FROM app_notifications WHERE organization_id = ? AND read = 0
  `).get(ORG_ID).c;

  res.json({ notifications, unreadCount });
});

app.post('/api/notifications/read-all', (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE app_notifications SET read = 1 WHERE organization_id = ?`).run(ORG_ID);
  res.json({ success: true });
});

// ==========================================
// USERS
// ==========================================

app.get('/api/users', (req, res) => {
  const db = getDb();
  const users = db.prepare(`SELECT * FROM users WHERE organization_id = ?`).all(ORG_ID);
  res.json(users);
});

// ==========================================
// NOTIFICATION POLICIES
// ==========================================

app.get('/api/notification-policies', (req, res) => {
  const db = getDb();
  const policies = db.prepare(`SELECT * FROM notification_policies WHERE organization_id = ?`).all(ORG_ID);
  res.json(policies);
});

// ==========================================
// Start server
// ==========================================

async function start() {
  await waitForDb();
  console.log('[Server] Database initialized');
  server.listen(PORT, () => {
    console.log(`\n  🚨 AlertOps Server running on http://localhost:${PORT}`);
    console.log(`  📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);
    console.log(`  🔗 Webhook endpoint: http://localhost:${PORT}/api/webhook/ingest\n`);
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
