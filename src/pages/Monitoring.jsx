import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from '../App';
import {
  Activity, Send, Copy, RefreshCw, Zap, Terminal, AlertTriangle, CheckCircle2
} from 'lucide-react';

const EVENT_PRESETS = [
  { label: 'CPU Threshold', event_type: 'cpu_threshold', metric: 'CPU', severity: 'critical' },
  { label: 'Memory Pressure', event_type: 'memory_threshold', metric: 'Memory', severity: 'warning' },
  { label: 'Disk Space Critical', event_type: 'disk_threshold', metric: 'Disk', severity: 'critical' },
  { label: 'Connection Pool', event_type: 'connection_threshold', metric: 'Connections', severity: 'warning' },
  { label: 'API Latency High', event_type: 'latency_threshold', metric: 'Latency', severity: 'warning' },
  { label: 'Error Rate Elevated', event_type: 'error_rate', metric: 'Error Rate', severity: 'critical' },
  { label: 'Service Down', event_type: 'service_down', metric: 'Availability', severity: 'critical' },
  { label: 'Deployment Failure', event_type: 'deploy_failed', metric: 'Deploy', severity: 'critical' },
  { label: 'Recovery', event_type: 'recovery', metric: 'Recovery', severity: 'info' },
];

export default function Monitoring() {
  const addToast = useToast();
  const [services, setServices] = useState([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    source: 'Infrastructure Monitor',
    event_type: 'cpu_threshold',
    service: 'PostgreSQL',
    environment: 'production',
    severity: 'critical',
    metric: 'CPU',
    value: '96',
    threshold: '90',
    description: '',
    event_id: '',
  });

  const [webhookSecret] = useState(() => 'aops_' + Math.random().toString(36).substring(2, 18));

  useEffect(() => {
    api.getServices().then(setServices).catch(() => {});
  }, []);

  const updateForm = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const applyPreset = (preset) => {
    setForm(f => ({
      ...f,
      event_type: preset.event_type,
      metric: preset.metric,
      severity: preset.severity,
    }));
  };

  const sendEvent = async () => {
    setSending(true);
    setResult(null);

    const event = {
      ...form,
      value: form.value + '%',
      threshold: form.threshold + '%',
      description: form.description || `${form.metric} ${form.event_type === 'recovery' ? 'recovered' : 'exceeded threshold'}: ${form.value}% (threshold: ${form.threshold}%)`,
    };

    if (form.event_id) event.event_id = form.event_id;

    try {
      const res = await api.sendEvent(event);
      setResult(res);
      if (res.success) {
        if (res.duplicate) {
          addToast('Duplicate event detected — associated with existing incident', 'warning');
        } else if (res.suppressed) {
          addToast(`Alert suppressed: ${res.reason}`, 'warning');
        } else if (res.recovery) {
          addToast(res.no_match ? 'Recovery event processed — no matching incident found' : `Recovery: Incident INC-${res.incident_number} auto-resolved`, 'success');
        } else if (res.is_new_incident) {
          addToast(`Incident INC-${res.incident_number} created`, 'success');
        } else {
          addToast('Event processed and correlated with existing incident', 'success');
        }
      } else {
        addToast(`Error: ${res.error}`, 'error');
      }
    } catch (err) {
      addToast(`Failed: ${err.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const webhookUrl = `${window.location.protocol}//${window.location.hostname}:3001/api/webhook/ingest`;
  const examplePayload = JSON.stringify({
    source: "your-monitoring-tool",
    event_type: "cpu_threshold",
    service: "PostgreSQL",
    environment: "production",
    severity: "critical",
    metric: "CPU",
    value: "96%",
    threshold: "90%",
    description: "Database CPU exceeded threshold"
  }, null, 2);

  return (
    <div>
      <div className="page-header">
        <h1>Monitoring</h1>
        <p>Event simulator and webhook ingestion configuration.</p>
      </div>

      <div className="grid-2">
        {/* Event Simulator */}
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title flex items-center gap-2">
                <Zap size={16} /> Event Simulator
              </div>
            </div>

            {/* Quick presets */}
            <div style={{ marginBottom: 16 }}>
              <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Quick presets:</div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {EVENT_PRESETS.map(p => (
                  <button key={p.label} className="btn btn-secondary btn-sm" onClick={() => applyPreset(p)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Source</label>
              <input className="form-input" value={form.source} onChange={e => updateForm('source', e.target.value)} />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Event Type</label>
                <select className="form-select" value={form.event_type} onChange={e => updateForm('event_type', e.target.value)}>
                  {EVENT_PRESETS.map(p => <option key={p.event_type} value={p.event_type}>{p.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Service</label>
                <select className="form-select" value={form.service} onChange={e => updateForm('service', e.target.value)}>
                  {services.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Environment</label>
                <select className="form-select" value={form.environment} onChange={e => updateForm('environment', e.target.value)}>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Severity</label>
                <select className="form-select" value={form.severity} onChange={e => updateForm('severity', e.target.value)}>
                  <option value="critical">Critical</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Metric</label>
                <input className="form-input" value={form.metric} onChange={e => updateForm('metric', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Value (%)</label>
                <input className="form-input" type="number" value={form.value} onChange={e => updateForm('value', e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Threshold (%)</label>
              <input className="form-input" type="number" value={form.threshold} onChange={e => updateForm('threshold', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <input className="form-input" value={form.description} onChange={e => updateForm('description', e.target.value)}
                placeholder="Auto-generated if empty" />
            </div>

            <div className="form-group">
              <label className="form-label">Event ID (optional — set to test deduplication)</label>
              <input className="form-input" value={form.event_id} onChange={e => updateForm('event_id', e.target.value)}
                placeholder="Leave empty for auto-generated" />
            </div>

            <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }}
              onClick={sendEvent} disabled={sending}>
              {sending ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <Send size={18} />}
              {sending ? 'Processing...' : 'Send Event'}
            </button>
          </div>

          {/* Pipeline result */}
          {result && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-title flex items-center gap-2" style={{ marginBottom: 12 }}>
                {result.success ? <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> : <AlertTriangle size={16} style={{ color: 'var(--critical)' }} />}
                Pipeline Result
              </div>
              <div style={{ fontSize: 13 }}>
                {result.duplicate && <div className="badge warning" style={{ marginBottom: 8 }}>Duplicate event detected</div>}
                {result.suppressed && <div className="badge warning" style={{ marginBottom: 8 }}>Event suppressed: {result.reason}</div>}
                {result.recovery && !result.no_match && <div className="badge success" style={{ marginBottom: 8 }}>Recovery: Auto-resolved INC-{result.incident_number}</div>}
                {result.is_new_incident && <div className="badge success" style={{ marginBottom: 8 }}>New incident: INC-{result.incident_number}</div>}
                {!result.success && <div className="badge critical" style={{ marginBottom: 8 }}>Error: {result.error}</div>}
              </div>
              {result.pipeline && (
                <div style={{ marginTop: 12 }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Pipeline Steps:</div>
                  <div className="timeline" style={{ paddingLeft: 20 }}>
                    {result.pipeline.map((step, i) => (
                      <div key={i} className="timeline-item" style={{ paddingBottom: 8 }}>
                        <div className="timeline-dot" style={{ borderColor: 'var(--brand-primary)' }} />
                        <div className="timeline-time">{new Date(step.time).toLocaleTimeString()}</div>
                        <div className="timeline-message">{step.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Webhook Configuration */}
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title flex items-center gap-2">
                <Terminal size={16} /> Webhook Ingestion
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Webhook URL</label>
              <div className="flex gap-2">
                <input className="form-input" value={webhookUrl} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(webhookUrl); addToast('URL copied'); }}>
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Secret</label>
              <div className="flex gap-2">
                <input className="form-input" value={webhookSecret} readOnly style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(webhookSecret); addToast('Secret copied'); }}>
                  <Copy size={14} />
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>Example JSON payload:</div>
              <pre style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                overflow: 'auto',
                color: 'var(--text-secondary)',
              }}>
                {examplePayload}
              </pre>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="text-xs text-muted" style={{ marginBottom: 8 }}>cURL example:</div>
              <pre style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                overflow: 'auto',
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>
{`curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ source: "monitor", event_type: "cpu_threshold", service: "PostgreSQL", environment: "production", severity: "critical", metric: "CPU", value: "96%", threshold: "90%" })}'`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
