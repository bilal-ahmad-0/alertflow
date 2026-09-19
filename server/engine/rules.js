import { getDb } from '../db.js';

/**
 * Evaluate alert rules against an incoming event.
 * Rules are ordered by priority (lower number = higher priority).
 * Returns the first matching rule's actions.
 */
export function evaluateRules(db, event) {
  const rules = db.prepare(`
    SELECT * FROM alert_rules 
    WHERE organization_id = 'org-default' AND enabled = 1 
    ORDER BY priority ASC
  `).all();

  const matchedRules = [];

  for (const rule of rules) {
    const conditions = JSON.parse(rule.conditions);
    const actions = JSON.parse(rule.actions);

    if (matchesConditions(conditions, event)) {
      matchedRules.push({ rule, actions });
    }
  }

  if (matchedRules.length === 0) {
    return { matched: false, actions: { create_incident: true, priority: 'P3', notify: true } };
  }

  // Check for conflicts
  if (matchedRules.length > 1) {
    // Log conflict but use highest priority rule
    console.log(`[Rules] ${matchedRules.length} rules matched for event. Using highest priority.`);
  }

  const best = matchedRules[0];
  return { matched: true, rule: best.rule, actions: best.actions, conflictCount: matchedRules.length };
}

function matchesConditions(conditions, event) {
  if (!conditions || !conditions.all || conditions.all.length === 0) {
    return true; // Empty conditions = catch-all
  }

  return conditions.all.every(cond => evaluateCondition(cond, event));
}

function evaluateCondition(condition, event) {
  const { field, operator, value } = condition;
  const eventValue = getEventField(event, field);

  if (eventValue === null || eventValue === undefined) return false;

  switch (operator) {
    case 'equals':
      return String(eventValue).toLowerCase() === String(value).toLowerCase();
    case 'not_equals':
      return String(eventValue).toLowerCase() !== String(value).toLowerCase();
    case 'contains':
      return String(eventValue).toLowerCase().includes(String(value).toLowerCase());
    case 'in':
      return Array.isArray(value) && value.some(v => String(v).toLowerCase() === String(eventValue).toLowerCase());
    case 'gt':
    case '>':
      return parseFloat(eventValue) > parseFloat(value);
    case 'gte':
    case '>=':
      return parseFloat(eventValue) >= parseFloat(value);
    case 'lt':
    case '<':
      return parseFloat(eventValue) < parseFloat(value);
    case 'lte':
    case '<=':
      return parseFloat(eventValue) <= parseFloat(value);
    default:
      return false;
  }
}

function getEventField(event, field) {
  // Map rule field names to event properties
  const fieldMap = {
    'environment': event.environment,
    'service': event.service || (event.service_id ? getServiceName(event.service_id) : null),
    'severity': event.severity,
    'source': event.source,
    'event_type': event.event_type,
    'metric': event.metric,
    'value': event.value,
    'threshold': event.threshold,
  };

  return fieldMap[field] !== undefined ? fieldMap[field] : event[field];
}

function getServiceName(serviceId) {
  const db = getDb();
  const svc = db.prepare('SELECT name FROM services WHERE id = ?').get(serviceId);
  return svc?.name || null;
}

/**
 * Check if multiple rules conflict for the same event type.
 */
export function checkRuleConflicts(db, ruleId) {
  const rule = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(ruleId);
  if (!rule) return [];

  const conditions = JSON.parse(rule.conditions);
  const allRules = db.prepare(`
    SELECT * FROM alert_rules WHERE organization_id = 'org-default' AND enabled = 1 AND id != ?
    ORDER BY priority ASC
  `).all(ruleId);

  const conflicts = [];
  for (const other of allRules) {
    const otherConditions = JSON.parse(other.conditions);
    if (conditionsOverlap(conditions, otherConditions)) {
      conflicts.push(other);
    }
  }

  return conflicts;
}

function conditionsOverlap(condA, condB) {
  if (!condA.all || condA.all.length === 0) return true;
  if (!condB.all || condB.all.length === 0) return true;

  // Simple heuristic: check if they share the same field values
  const fieldsA = new Map(condA.all.map(c => [c.field, c.value]));
  const fieldsB = new Map(condB.all.map(c => [c.field, c.value]));

  let sharedFields = 0;
  for (const [field, value] of fieldsA) {
    if (fieldsB.has(field)) {
      const bVal = fieldsB.get(field);
      if (String(value).toLowerCase() === String(bVal).toLowerCase()) {
        sharedFields++;
      }
    }
  }

  return sharedFields >= 2;
}
