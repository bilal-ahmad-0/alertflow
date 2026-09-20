/**
 * Slack notification sender using Incoming Webhooks.
 */
export async function sendSlackNotification(config, template, incident, eventOrType = 'alert', maybeType) {
  const notificationType = typeof eventOrType === 'string' ? eventOrType : (maybeType || 'alert');
  const event = typeof eventOrType === 'object' ? eventOrType : null;

  let webhookUrl = config.webhook_url;
  if (!webhookUrl) {
    return { success: false, error: 'No Slack webhook URL configured' };
  }

  // Determine if we should simulate failure (for demo purposes)
  if (config.simulate_failure) {
    return { success: false, error: 'Simulated Slack delivery failure' };
  }

  let authHeader = config.auth_header 
    || (config.api_key ? `Bearer ${config.api_key}` : null)
    || (process.env.ALERTOPS_SLACK_CONNECTOR_API_KEY ? `Bearer ${process.env.ALERTOPS_SLACK_CONNECTOR_API_KEY}` : null);
  let extraHeaders = {};

  // Check if user pasted a full curl command into webhook_url
  if (typeof webhookUrl === 'string' && webhookUrl.trim().startsWith('curl')) {
    const urlMatch = webhookUrl.match(/https?:\/\/[^\s"'\\]+/);
    const authMatch = webhookUrl.match(/-H\s+["']Authorization:\s*([^"']+)["']/i);
    const testModeMatch = webhookUrl.match(/-H\s+["'](X-fastn-Test-Mode:\s*[^"']+)["']/i);
    const envMatch = webhookUrl.match(/-H\s+["'](x-fastn-env:\s*[^"']+)["']/i);

    if (urlMatch) webhookUrl = urlMatch[0];
    if (authMatch) authHeader = authMatch[1];
    if (testModeMatch) extraHeaders['X-fastn-Test-Mode'] = 'true';
    if (envMatch) extraHeaders['x-fastn-env'] = 'test';
  }

  const severityEmoji = {
    critical: '🚨',
    warning: '⚠️',
    info: 'ℹ️',
    success: '✅',
  };

  const severityColor = {
    critical: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    success: '#10b981',
  };

  let blocks;

  if (notificationType === 'recovery') {
    blocks = buildRecoverySlackBlocks(incident, template);
  } else if (notificationType === 'escalation') {
    blocks = buildEscalationSlackBlocks(incident, template);
  } else {
    blocks = buildAlertSlackBlocks(incident, template, severityEmoji, severityColor);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (authHeader) {
    const cleanAuth = authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`;
    headers['Authorization'] = cleanAuth;
    if (cleanAuth.includes('test') || (typeof webhookUrl === 'string' && webhookUrl.includes('fastn'))) {
      headers['X-fastn-Test-Mode'] = 'true';
      headers['x-fastn-env'] = 'test';
    }
  }

  const service = event?.service || template?.service || incident?.service_name || 'System';
  const environment = event?.environment || incident?.environment || template?.environment || 'production';
  const severity = (incident?.severity || event?.severity || template?.severity || 'critical');
  const priority = incident?.priority || event?.priority || template?.priority || 'P1';
  const metric = event?.metric || event?.metric_name || 'System Alert';
  const value = event?.value !== undefined ? String(event.value) : 'triggered';
  const threshold = event?.threshold !== undefined ? String(event.threshold) : 'threshold_exceeded';
  const source = event?.source || 'Infrastructure Monitor';
  const event_type = event?.event_type || 'cpu_threshold';
  const description = event?.description || template?.description || incident?.title || 'Incident notification';
  const incidentNumber = incident?.incident_number ? `INC-${incident.incident_number}` : 'INC-NEW';
  const incidentId = incident?.id || `inc_${Date.now()}`;
  const eventId = event?.event_id || incidentId;

  // Payload structure supporting both standard Slack webhooks (blocks, text) and Fastn workflows (input)
  const body = {
    blocks,
    text: template?.subject || incident?.title || `${service} — ${description}`,
    input: {
      value,
      metric,
      source,
      service,
      event_id: eventId,
      incident_id: incidentId,
      incident_number: incidentNumber,
      severity,
      threshold,
      event_type,
      description,
      environment,
      priority,
      status: incident?.status || 'triggered',
    },
    value,
    metric,
    source,
    service,
    event_id: eventId,
    incident_id: incidentId,
    incident_number: incidentNumber,
    severity,
    threshold,
    event_type,
    description,
    environment,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return { success: true };
    } else {
      const text = await response.text();
      return { success: false, error: `Slack/Fastn API error: ${response.status} - ${text}` };
    }
  } catch (err) {
    return { success: false, error: `Slack delivery error: ${err.message}` };
  }
}

function buildAlertSlackBlocks(incident, template, severityEmoji, severityColor) {
  const emoji = severityEmoji[incident?.severity] || '🔔';
  const color = severityColor[incident?.severity] || '#6366f1';

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} ${template.subject}`, emoji: true }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Service:*\n${template.service || 'N/A'}` },
        { type: 'mrkdwn', text: `*Environment:*\n${template.environment || 'N/A'}` },
        { type: 'mrkdwn', text: `*Severity:*\n${(incident?.severity || 'info').toUpperCase()}` },
        { type: 'mrkdwn', text: `*Priority:*\n${incident?.priority || 'P3'}` },
      ]
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Description:*\n${template.description || 'No description available.'}` }
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `📋 Incident: *INC-${incident?.incident_number || '?'}* | 🕐 ${new Date().toLocaleTimeString()} | AlertOps` }
      ]
    },
    { type: 'divider' },
  ];
}

function buildRecoverySlackBlocks(incident, template) {
  const duration = incident?.started_at && incident?.resolved_at
    ? formatDuration(new Date(incident.started_at), new Date(incident.resolved_at))
    : 'N/A';

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `✅ RESOLVED — ${incident?.title || 'Incident'}`, emoji: true }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Service:*\n${template.service || 'N/A'}` },
        { type: 'mrkdwn', text: `*Environment:*\n${template.environment || 'N/A'}` },
        { type: 'mrkdwn', text: `*Duration:*\n${duration}` },
        { type: 'mrkdwn', text: `*Incident:*\nINC-${incident?.incident_number || '?'}` },
      ]
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `✅ Resolved at ${new Date().toLocaleTimeString()} | AlertOps` }
      ]
    },
    { type: 'divider' },
  ];
}

function buildEscalationSlackBlocks(incident, template) {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🔺 ESCALATION — ${incident?.title || 'Incident'}`, emoji: true }
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `Incident *INC-${incident?.incident_number || '?'}* has been escalated because it was not acknowledged within the required time.` }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Severity:*\n${(incident?.severity || 'info').toUpperCase()}` },
        { type: 'mrkdwn', text: `*Priority:*\n${incident?.priority || 'P3'}` },
      ]
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `🔺 Escalated at ${new Date().toLocaleTimeString()} | AlertOps` }
      ]
    },
    { type: 'divider' },
  ];
}

function formatDuration(start, end) {
  const diffMs = end - start;
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
