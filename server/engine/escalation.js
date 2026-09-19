import { getDb } from '../db.js';
import { addTimelineEvent, addAppNotification, escalationTimers, cancelEscalation } from './pipeline.js';
import { dispatchNotifications } from '../notifications/dispatcher.js';
import { broadcast } from '../index.js';

/**
 * Schedule escalation for an incident based on the escalation policy.
 * Uses in-process timers (setTimeout).
 */
export function scheduleEscalation(db, incident, policyId) {
  const policy = db.prepare('SELECT * FROM escalation_policies WHERE id = ? AND enabled = 1').get(policyId);
  if (!policy) return;

  const steps = JSON.parse(policy.steps);
  if (!steps || steps.length === 0) return;

  // Start with step 1
  executeEscalationStep(db, incident, policy, steps, 0);
}

function executeEscalationStep(db, incident, policy, steps, stepIndex) {
  if (stepIndex >= steps.length) return;

  const step = steps[stepIndex];
  const waitMs = (step.wait_minutes || 5) * 60 * 1000;

  const timer = setTimeout(async () => {
    const freshDb = getDb();

    // Check if incident is still unacknowledged
    const currentIncident = freshDb.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
    if (!currentIncident || currentIncident.status === 'resolved' || currentIncident.status === 'acknowledged' || currentIncident.status === 'mitigating') {
      // Incident has been acknowledged or resolved, stop escalation
      escalationTimers.delete(incident.id);
      return;
    }

    // Execute this step
    console.log(`[Escalation] Step ${step.step} for INC-${incident.incident_number}: ${step.label}`);

    addTimelineEvent(freshDb, incident.id, 'escalation', `Escalation Step ${step.step}: ${step.label}`);
    addAppNotification(freshDb, 'escalation', 'Incident Escalated',
      `INC-${incident.incident_number} escalated — ${step.label}`, 'warning', `/incidents/${incident.id}`);

    // Send notification to the escalation target
    await dispatchNotifications(freshDb, currentIncident, null, { notify: true }, 'escalation');

    broadcast({
      type: 'activity',
      activity: {
        type: 'escalation',
        message: `INC-${incident.incident_number} escalated — ${step.label}`,
        timestamp: new Date().toISOString()
      }
    });

    // Schedule next step
    if (stepIndex + 1 < steps.length) {
      executeEscalationStep(freshDb, incident, policy, steps, stepIndex + 1);
    } else {
      escalationTimers.delete(incident.id);
    }

  }, waitMs);

  escalationTimers.set(incident.id, timer);
}

export { scheduleEscalation as default };
