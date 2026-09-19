/**
 * Slack notification sender using Incoming Webhooks.
 */
export async function sendSlackNotification(config, template, incident, notificationType = 'alert') {
  const webhookUrl = config.webhook_url;
  if (!webhookUrl) {
    return { success: false, error: 'No Slack webhook URL configured' };
  }

  // Determine if we should simulate failure (for demo purposes)
  if (config.simulate_failure) {
    return { success: false, error: 'Simulated Slack delivery failure' };
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

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks, text: template.subject }),
    });

    if (response.ok) {
      return { success: true };
    } else {
      const text = await response.text();
      return { success: false, error: `Slack API error: ${response.status} - ${text}` };
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
