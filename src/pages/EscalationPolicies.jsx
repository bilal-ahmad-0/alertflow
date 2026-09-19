import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from '../App';
import { Clock, Plus, XCircle } from 'lucide-react';

export default function EscalationPolicies() {
  const addToast = useToast();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    api.getEscalationPolicies().then(setPolicies).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Escalation Policies</h1>
            <p>Define multi-step escalation workflows for unacknowledged incidents.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Policy</button>
        </div>
      </div>

      {policies.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon-container"><Clock size={28} /></div>
            <h3>No escalation policies</h3>
            <p>Create policies to automatically escalate unacknowledged incidents.</p>
          </div>
        </div>
      ) : (
        <div className="grid-auto">
          {policies.map(policy => {
            const steps = JSON.parse(policy.steps || '[]');
            return (
              <div key={policy.id} className="card">
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>{policy.name}</div>
                <div className="text-xs text-muted" style={{ marginBottom: 12 }}>{policy.description}</div>

                <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                  <span className={`badge ${policy.enabled ? 'success' : 'neutral'}`}>{policy.enabled ? 'Active' : 'Disabled'}</span>
                  <span className="badge brand">{steps.length} steps</span>
                </div>

                <div className="timeline" style={{ paddingLeft: 20 }}>
                  {steps.map((step, i) => (
                    <div key={i} className="timeline-item" style={{ paddingBottom: 10 }}>
                      <div className="timeline-dot" style={{ borderColor: 'var(--warning)' }} />
                      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary)' }}>Step {step.step}: {step.label}</div>
                      <div className="text-xs text-muted">Wait {step.wait_minutes} minutes if unacknowledged</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Escalation Policy</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><XCircle size={18} /></button>
            </div>
            <div className="modal-body">
              <EscalationForm onSave={() => {
                setShowModal(false);
                api.getEscalationPolicies().then(setPolicies);
                addToast('Escalation policy created');
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EscalationForm({ onSave }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState([{ step: 1, action: 'notify_oncall_primary', wait_minutes: 5, label: 'Notify primary on-call' }]);
  const [saving, setSaving] = useState(false);

  const addStep = () => setSteps([...steps, {
    step: steps.length + 1,
    action: 'notify_oncall_secondary',
    wait_minutes: 5,
    label: 'Notify secondary on-call',
  }]);

  const save = async () => {
    setSaving(true);
    try {
      await api.createEscalationPolicy({ name, description, steps });
      onSave();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Name</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Production Critical" />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <input className="form-input" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="form-label">Steps</div>
      {steps.map((step, i) => (
        <div key={i} className="card" style={{ marginBottom: 8, padding: 12 }}>
          <div className="grid-2">
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Label</label>
              <input className="form-input" value={step.label} onChange={e => {
                const s = [...steps]; s[i].label = e.target.value; setSteps(s);
              }} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Wait (minutes)</label>
              <input className="form-input" type="number" value={step.wait_minutes} onChange={e => {
                const s = [...steps]; s[i].wait_minutes = Number(e.target.value); setSteps(s);
              }} />
            </div>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={addStep} style={{ marginBottom: 16 }}><Plus size={14} /> Add Step</button>

      <button className="btn btn-primary" style={{ width: '100%' }} onClick={save} disabled={!name || saving}>
        {saving ? 'Creating...' : 'Create Policy'}
      </button>
    </div>
  );
}
