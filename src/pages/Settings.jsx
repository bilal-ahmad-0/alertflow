import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from '../App';
import { Settings as SettingsIcon, Plus, Trash2, XCircle, Clock } from 'lucide-react';

export default function SettingsPage() {
  const addToast = useToast();
  const [tab, setTab] = useState('maintenance');
  const [maintenance, setMaintenance] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [services, setServices] = useState([]);
  const [showMaintModal, setShowMaintModal] = useState(false);

  useEffect(() => {
    api.getMaintenance().then(setMaintenance).catch(() => {});
    api.getNotificationPolicies().then(setPolicies).catch(() => {});
    api.getServices().then(setServices).catch(() => {});
  }, []);

  const deleteMaint = async (id) => {
    try { await api.deleteMaintenance(id); addToast('Maintenance window deleted'); setMaintenance(m => m.filter(w => w.id !== id)); } catch (e) { addToast(e.message, 'error'); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>System configuration, maintenance windows, and notification policies.</p>
      </div>

      <div className="filter-bar" style={{ marginBottom: 24 }}>
        <button className={`filter-chip ${tab === 'maintenance' ? 'active' : ''}`} onClick={() => setTab('maintenance')}>Maintenance Windows</button>
        <button className={`filter-chip ${tab === 'notification' ? 'active' : ''}`} onClick={() => setTab('notification')}>Notification Policies</button>
        <button className={`filter-chip ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>General</button>
      </div>

      {tab === 'maintenance' && (
        <div>
          <div className="page-header-row" style={{ marginBottom: 16 }}>
            <div className="card-title">Maintenance Windows</div>
            <button className="btn btn-primary" onClick={() => setShowMaintModal(true)}><Plus size={16} /> Create Window</button>
          </div>

          {maintenance.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="icon-container"><Clock size={28} /></div>
                <h3>No maintenance windows</h3>
                <p>Create maintenance windows to suppress alerts during planned work.</p>
              </div>
            </div>
          ) : (
            <div className="grid-auto">
              {maintenance.map(mw => (
                <div key={mw.id} className="card">
                  <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{mw.name}</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteMaint(mw.id)}><Trash2 size={14} /></button>
                  </div>
                  <div className="flex gap-4" style={{ fontSize: 13, marginBottom: 8 }}>
                    <div><span className="text-muted">Start:</span> {new Date(mw.start_time).toLocaleString()}</div>
                    <div><span className="text-muted">End:</span> {new Date(mw.end_time).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    <span className="badge neutral">{mw.suppression_policy}</span>
                    {mw.active ? <span className="badge success">Active</span> : <span className="badge neutral">Inactive</span>}
                  </div>
                  {mw.services && JSON.parse(mw.services).length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span className="text-xs text-muted">Services: </span>
                      {JSON.parse(mw.services).map((s, i) => <span key={i} className="badge neutral" style={{ marginRight: 4 }}>{s}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showMaintModal && (
            <div className="modal-overlay" onClick={() => setShowMaintModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Create Maintenance Window</h2>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowMaintModal(false)}><XCircle size={18} /></button>
                </div>
                <div className="modal-body">
                  <MaintForm services={services} onSave={(mw) => {
                    setShowMaintModal(false);
                    api.getMaintenance().then(setMaintenance);
                    addToast('Maintenance window created');
                  }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'notification' && (
        <div>
          <div className="card-title" style={{ marginBottom: 16 }}>Notification Policies</div>
          <div className="grid-auto">
            {policies.map(p => {
              const channels = JSON.parse(p.channels || '{}');
              return (
                <div key={p.id} className="card">
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{p.name}</div>
                  <span className={`badge ${p.severity}`} style={{ marginBottom: 12, display: 'inline-flex' }}>{p.severity}</span>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div className="flex items-center justify-between">
                      <span className="text-muted text-sm">Slack</span>
                      <span className={`badge ${channels.slack ? 'success' : 'neutral'}`}>{channels.slack ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted text-sm">Email</span>
                      <span className={`badge ${channels.email ? 'success' : 'neutral'}`}>{channels.email ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted text-sm">In-App</span>
                      <span className={`badge ${channels.in_app ? 'success' : 'neutral'}`}>{channels.in_app ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'general' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Organization</div>
          <div style={{ display: 'grid', gap: 12, maxWidth: 400 }}>
            <div className="form-group">
              <label className="form-label">Organization Name</label>
              <input className="form-input" defaultValue="Acme Engineering" />
            </div>
            <div className="form-group">
              <label className="form-label">Timezone</label>
              <select className="form-select" defaultValue="UTC">
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="Europe/London">London</option>
                <option value="Asia/Karachi">Karachi</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Correlation Window (minutes)</label>
              <input className="form-input" type="number" defaultValue={30} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MaintForm({ services, onSave }) {
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedServices, setSelectedServices] = useState([]);
  const [policy, setPolicy] = useState('all');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.createMaintenance({
        name, start_time: new Date(startTime).toISOString(), end_time: new Date(endTime).toISOString(),
        services: selectedServices, environments: ['production'],
        suppression_policy: policy,
      });
      onSave();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Name</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Database Migration" />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Start Time</label>
          <input className="form-input" type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">End Time</label>
          <input className="form-input" type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Affected Services</label>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {services.map(s => (
            <label key={s.id} className="flex items-center gap-2" style={{ fontSize: 13, padding: '4px 8px', background: selectedServices.includes(s.id) ? 'var(--brand-bg)' : 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: `1px solid ${selectedServices.includes(s.id) ? 'var(--brand-border)' : 'var(--border-secondary)'}` }}>
              <input type="checkbox" checked={selectedServices.includes(s.id)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedServices([...selectedServices, s.id]);
                  else setSelectedServices(selectedServices.filter(id => id !== s.id));
                }} />
              {s.name}
            </label>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Suppression Policy</label>
        <select className="form-select" value={policy} onChange={e => setPolicy(e.target.value)}>
          <option value="all">Suppress all (except critical)</option>
          <option value="non_critical">Suppress non-critical only</option>
        </select>
      </div>
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={save} disabled={!name || !startTime || !endTime || saving}>
        {saving ? 'Creating...' : 'Create Maintenance Window'}
      </button>
    </div>
  );
}
