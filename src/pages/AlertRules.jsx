import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useToast } from '../App';
import { Shield, Plus, Trash2, Edit, AlertTriangle, XCircle } from 'lucide-react';

export default function AlertRules() {
  const addToast = useToast();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState(null);

  const load = async () => {
    try { const data = await api.getRules(); setRules(data); } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleRule = async (rule) => {
    try {
      await api.updateRule(rule.id, { enabled: !rule.enabled });
      addToast(`Rule ${rule.enabled ? 'disabled' : 'enabled'}`);
      load();
    } catch (e) { addToast(e.message, 'error'); }
  };

  const deleteRule = async (id) => {
    if (!confirm('Delete this rule?')) return;
    try { await api.deleteRule(id); addToast('Rule deleted'); load(); } catch (e) { addToast(e.message, 'error'); }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Alert Rules</h1>
            <p>Configure how events are classified, prioritized, and routed.</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditRule(null); setShowModal(true); }}>
            <Plus size={16} /> New Rule
          </button>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon-container"><Shield size={28} /></div>
            <h3>No alert rules configured</h3>
            <p>Create rules to classify and route incoming events.</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Create Rule</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr><th>Priority</th><th>Name</th><th>Conditions</th><th>Actions</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rules.map(rule => {
                const conditions = JSON.parse(rule.conditions || '{}');
                const actions = JSON.parse(rule.actions || '{}');
                return (
                  <tr key={rule.id}>
                    <td><span className="badge brand">#{rule.priority}</span></td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{rule.name}</div>
                      <div className="text-xs text-muted">{rule.description}</div>
                    </td>
                    <td>
                      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                        {(conditions.all || []).map((c, i) => (
                          <span key={i} className="badge neutral" style={{ fontSize: 10 }}>{c.field} {c.operator} {Array.isArray(c.value) ? c.value.join(', ') : c.value}</span>
                        ))}
                        {(!conditions.all || conditions.all.length === 0) && <span className="text-muted text-xs">Catch-all</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                        {actions.severity && <span className={`badge ${actions.severity}`}>{actions.severity}</span>}
                        {actions.priority && <span className="badge brand">{actions.priority}</span>}
                        {actions.create_incident && <span className="badge info">Create Incident</span>}
                        {actions.notify && <span className="badge success">Notify</span>}
                      </div>
                    </td>
                    <td>
                      <button className={`btn btn-sm ${rule.enabled ? 'btn-success' : 'btn-secondary'}`} onClick={() => toggleRule(rule)}>
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditRule(rule); setShowModal(true); }}><Edit size={14} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteRule(rule.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <RuleModal rule={editRule} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); addToast('Rule saved'); }} />}
    </div>
  );
}

function RuleModal({ rule, onClose, onSave }) {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [priority, setPriority] = useState(rule?.priority || 50);
  const [conditions, setConditions] = useState(rule ? JSON.parse(rule.conditions || '{}').all || [] : []);
  const [severity, setSeverity] = useState(rule ? JSON.parse(rule.actions || '{}').severity || '' : 'critical');
  const [actionPriority, setActionPriority] = useState(rule ? JSON.parse(rule.actions || '{}').priority || 'P1' : 'P1');
  const [createIncident, setCreateIncident] = useState(rule ? JSON.parse(rule.actions || '{}').create_incident !== false : true);
  const [notify, setNotify] = useState(rule ? JSON.parse(rule.actions || '{}').notify !== false : true);
  const [routeTeam, setRouteTeam] = useState(rule ? JSON.parse(rule.actions || '{}').route_team || '' : '');
  const [escalationPolicy, setEscalationPolicy] = useState(rule ? JSON.parse(rule.actions || '{}').escalation_policy || '' : '');
  const [teams, setTeams] = useState([]);
  const [escPolicies, setEscPolicies] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getTeams().then(setTeams).catch(() => {});
    api.getEscalationPolicies().then(setEscPolicies).catch(() => {});
  }, []);

  const addCondition = () => setConditions([...conditions, { field: 'environment', operator: 'equals', value: 'production' }]);
  const removeCondition = (i) => setConditions(conditions.filter((_, idx) => idx !== i));
  const updateCondition = (i, key, val) => setConditions(conditions.map((c, idx) => idx === i ? { ...c, [key]: val } : c));

  const save = async () => {
    setSaving(true);
    const data = {
      name, description, priority: Number(priority),
      conditions: { all: conditions },
      actions: {
        severity, priority: actionPriority, create_incident: createIncident,
        notify, route_team: routeTeam || undefined, escalation_policy: escalationPolicy || undefined,
      },
    };
    try {
      if (rule) { await api.updateRule(rule.id, data); }
      else { await api.createRule(data); }
      onSave();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{rule ? 'Edit Rule' : 'New Alert Rule'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><XCircle size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Priority (lower = higher)</label>
              <input className="form-input" type="number" value={priority} onChange={e => setPriority(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-input" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div style={{ marginTop: 16, marginBottom: 8 }}>
            <div className="flex items-center justify-between">
              <div className="form-label" style={{ margin: 0 }}>WHEN — Conditions</div>
              <button className="btn btn-ghost btn-sm" onClick={addCondition}><Plus size={14} /> Add</button>
            </div>
          </div>
          {conditions.map((c, i) => (
            <div key={i} className="flex gap-2 items-center" style={{ marginBottom: 8 }}>
              <select className="form-select" value={c.field} onChange={e => updateCondition(i, 'field', e.target.value)} style={{ width: 140 }}>
                <option value="environment">Environment</option>
                <option value="service">Service</option>
                <option value="severity">Severity</option>
                <option value="source">Source</option>
                <option value="event_type">Event Type</option>
                <option value="metric">Metric</option>
              </select>
              <select className="form-select" value={c.operator} onChange={e => updateCondition(i, 'operator', e.target.value)} style={{ width: 120 }}>
                <option value="equals">equals</option>
                <option value="not_equals">not equals</option>
                <option value="contains">contains</option>
                <option value=">">{'>'}</option>
                <option value=">=">{'≥'}</option>
                <option value="<">{'<'}</option>
              </select>
              <input className="form-input" value={c.value} onChange={e => updateCondition(i, 'value', e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={() => removeCondition(i)}><Trash2 size={14} /></button>
            </div>
          ))}

          <div style={{ marginTop: 16 }}><div className="form-label">THEN — Actions</div></div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Set Severity</label>
              <select className="form-select" value={severity} onChange={e => setSeverity(e.target.value)}>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Set Priority</label>
              <select className="form-select" value={actionPriority} onChange={e => setActionPriority(e.target.value)}>
                <option value="P1">P1 — Critical</option>
                <option value="P2">P2 — High</option>
                <option value="P3">P3 — Medium</option>
                <option value="P4">P4 — Low</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Route to Team</label>
              <select className="form-select" value={routeTeam} onChange={e => setRouteTeam(e.target.value)}>
                <option value="">Auto (from service)</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Escalation Policy</label>
              <select className="form-select" value={escalationPolicy} onChange={e => setEscalationPolicy(e.target.value)}>
                <option value="">None</option>
                {escPolicies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-4" style={{ marginTop: 8 }}>
            <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={createIncident} onChange={e => setCreateIncident(e.target.checked)} /> Create Incident
            </label>
            <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Send Notifications
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!name || saving}>{saving ? 'Saving...' : 'Save Rule'}</button>
        </div>
      </div>
    </div>
  );
}
