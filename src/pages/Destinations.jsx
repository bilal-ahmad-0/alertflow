import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from '../App';
import { Radio, Plus, Trash2, Send, AlertTriangle, CheckCircle2, XCircle, Mail, Hash } from 'lucide-react';

export default function Destinations() {
  const addToast = useToast();
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newType, setNewType] = useState('slack');
  const [testing, setTesting] = useState(null);

  const load = async () => {
    try { const data = await api.getDestinations(); setDestinations(data); } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const testDest = async (id) => {
    setTesting(id);
    try {
      const result = await api.testDestination(id);
      if (result.success) addToast('Test notification sent successfully!');
      else addToast(`Test failed: ${result.error}`, 'error');
    } catch (e) { addToast(e.message, 'error'); }
    setTesting(null);
  };

  const deleteDest = async (id) => {
    if (!confirm('Disconnect this destination?')) return;
    try { await api.deleteDestination(id); addToast('Destination disconnected'); load(); } catch (e) { addToast(e.message, 'error'); }
  };

  const toggleDest = async (dest) => {
    try {
      await api.updateDestination(dest.id, { enabled: !dest.enabled });
      addToast(dest.enabled ? 'Destination disabled' : 'Destination enabled');
      load();
    } catch (e) { addToast(e.message, 'error'); }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Destinations</h1>
            <p>Configure notification channels for incident alerts and updates.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Destination
          </button>
        </div>
      </div>

      {destinations.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon-container"><Radio size={28} /></div>
            <h3>No destinations connected</h3>
            <p>Connect Slack or Email to receive incident notifications.</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Add Destination</button>
          </div>
        </div>
      ) : (
        <div className="grid-auto">
          {destinations.map(dest => (
            <div key={dest.id} className="card">
              <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: dest.type === 'slack' ? '#4A154B' : '#EA4335', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {dest.type === 'slack' ? <Hash size={20} color="white" /> : <Mail size={20} color="white" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{dest.name}</div>
                  <div className="text-xs text-muted" style={{ textTransform: 'capitalize' }}>{dest.type}</div>
                </div>
                <span className={`badge ${dest.status === 'connected' ? 'success' : 'neutral'}`}>{dest.status}</span>
              </div>

              <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Enabled</span>
                  <button className={`btn btn-sm ${dest.enabled ? 'btn-success' : 'btn-secondary'}`} onClick={() => toggleDest(dest)}>
                    {dest.enabled ? 'Yes' : 'No'}
                  </button>
                </div>
                {dest.last_success_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Last Success</span>
                    <span className="text-xs" style={{ color: 'var(--success)' }}>{new Date(dest.last_success_at).toLocaleString()}</span>
                  </div>
                )}
                {dest.last_failure_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Last Failure</span>
                    <span className="text-xs" style={{ color: 'var(--critical)' }}>{new Date(dest.last_failure_at).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => testDest(dest.id)}
                  disabled={testing === dest.id}>
                  {testing === dest.id ? 'Sending...' : <><Send size={14} /> Test</>}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => deleteDest(dest.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Destination</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><XCircle size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="flex gap-2" style={{ marginBottom: 16 }}>
                <button className={`btn ${newType === 'slack' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setNewType('slack')}>
                  <Hash size={16} /> Slack
                </button>
                <button className={`btn ${newType === 'email' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setNewType('email')}>
                  <Mail size={16} /> Email
                </button>
              </div>

              {newType === 'slack' ? <SlackForm onSave={() => { setShowModal(false); load(); addToast('Slack connected!'); }} /> :
                <EmailForm onSave={() => { setShowModal(false); load(); addToast('Email connected!'); }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlackForm({ onSave }) {
  const [name, setName] = useState('Slack — Production Alerts');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.createDestination({ type: 'slack', name, configuration: { webhook_url: webhookUrl } });
      onSave();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Name</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Slack Incoming Webhook URL</label>
        <input className="form-input" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/T.../B.../..." />
        <div className="text-xs text-muted" style={{ marginTop: 4 }}>
          Create an incoming webhook at <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">api.slack.com</a>
        </div>
      </div>
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={save} disabled={!webhookUrl || saving}>
        {saving ? 'Connecting...' : 'Connect Slack'}
      </button>
    </div>
  );
}

function EmailForm({ onSave }) {
  const [name, setName] = useState('Email — DevOps');
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.createDestination({
        type: 'email', name,
        configuration: { service: 'gmail', email, app_password: appPassword, to_email: toEmail || email },
      });
      onSave();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Name</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Gmail Address</label>
        <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="alerts@yourcompany.com" />
      </div>
      <div className="form-group">
        <label className="form-label">Gmail App Password</label>
        <input className="form-input" type="password" value={appPassword} onChange={e => setAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
        <div className="text-xs text-muted" style={{ marginTop: 4 }}>
          Generate at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Google App Passwords</a>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Recipient Email (optional)</label>
        <input className="form-input" type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="Same as sender if empty" />
      </div>
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={save} disabled={!email || !appPassword || saving}>
        {saving ? 'Connecting...' : 'Connect Email'}
      </button>
    </div>
  );
}
