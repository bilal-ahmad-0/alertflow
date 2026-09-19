import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { FileText, Search } from 'lucide-react';

const ACTION_LABELS = {
  incident_created: 'Incident Created',
  incident_acknowledged: 'Incident Acknowledged',
  incident_resolved: 'Incident Resolved',
  destination_connected: 'Destination Connected',
  destination_disconnected: 'Destination Disconnected',
  rule_created: 'Rule Created',
  rule_updated: 'Rule Updated',
  rule_deleted: 'Rule Deleted',
  escalation_policy_created: 'Escalation Policy Created',
  maintenance_created: 'Maintenance Window Created',
};

const ACTION_COLORS = {
  incident_created: 'critical',
  incident_acknowledged: 'info',
  incident_resolved: 'success',
  destination_connected: 'success',
  destination_disconnected: 'warning',
  rule_created: 'brand',
  rule_updated: 'brand',
  rule_deleted: 'warning',
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const params = {};
    if (filter) params.action = filter;
    api.getAuditLog(params).then(setLogs).catch(console.error).finally(() => setLoading(false));
  }, [filter]);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Audit Log</h1>
        <p>Complete record of administrative and operational actions.</p>
      </div>

      <div className="filter-bar">
        <button className={`filter-chip ${filter === '' ? 'active' : ''}`} onClick={() => setFilter('')}>All</button>
        {Object.entries(ACTION_LABELS).map(([key, label]) => (
          <button key={key} className={`filter-chip ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon-container"><FileText size={28} /></div>
            <h3>No audit log entries</h3>
            <p>Actions will appear here as you use AlertOps.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr><th>Timestamp</th><th>User</th><th>Action</th><th>Object</th><th>Details</th></tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                  <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{log.user_name || 'System'}</td>
                  <td><span className={`badge ${ACTION_COLORS[log.action] || 'neutral'}`}>{ACTION_LABELS[log.action] || log.action}</span></td>
                  <td style={{ color: 'var(--text-primary)' }}>{log.object_name || log.object_type}</td>
                  <td className="text-muted">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
