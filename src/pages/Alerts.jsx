import React, { useState, useEffect } from 'react';
import { api, onWsMessage } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { Zap, Search } from 'lucide-react';

export default function Alerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const load = async () => {
    try {
      const params = {};
      if (severityFilter) params.severity = severityFilter;
      if (search) params.search = search;
      const data = await api.getAlerts(params);
      setAlerts(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [severityFilter, search]);
  useEffect(() => {
    return onWsMessage((msg) => {
      if (msg.type === 'alert_created') setTimeout(load, 200);
    });
  }, [severityFilter, search]);

  return (
    <div>
      <div className="page-header">
        <h1>Alerts</h1>
        <p>Raw operational signals and event stream.</p>
      </div>

      <div className="filter-bar">
        {['', 'critical', 'warning', 'info'].map(s => (
          <button key={s || 'all'} className={`filter-chip ${severityFilter === s ? 'active' : ''}`}
            onClick={() => setSeverityFilter(s)}>
            {s || 'All'}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 16, position: 'relative', maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Search alerts..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : alerts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon-container"><Zap size={28} /></div>
            <h3>No alerts received yet</h3>
            <p>Send events through the Event Simulator to see alerts here.</p>
            <button className="btn btn-primary" onClick={() => navigate('/monitoring')}>Open Event Simulator</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Service</th>
                  <th>Environment</th>
                  <th>Severity</th>
                  <th>Metric</th>
                  <th>Status</th>
                  <th>Incident</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map(alert => (
                  <tr key={alert.id}>
                    <td className="font-mono text-xs">{(alert.event_id || '').substring(0, 8)}...</td>
                    <td>{alert.source}</td>
                    <td>{alert.event_type}</td>
                    <td style={{ color: 'var(--text-primary)' }}>{alert.service_name || '—'}</td>
                    <td><span className="badge neutral">{alert.environment}</span></td>
                    <td><span className={`badge ${alert.severity}`}>{alert.severity}</span></td>
                    <td className="font-mono text-sm">
                      {alert.metric ? `${alert.metric}: ${alert.value}${alert.threshold ? ` / ${alert.threshold}` : ''}` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${
                        alert.processing_status === 'processed' ? 'success'
                        : alert.processing_status === 'duplicate' ? 'neutral'
                        : alert.processing_status === 'suppressed' ? 'warning'
                        : 'info'
                      }`}>
                        {alert.is_duplicate ? 'duplicate' : alert.is_suppressed ? 'suppressed' : alert.processing_status}
                      </span>
                    </td>
                    <td>
                      {alert.incident_number ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/incidents/${alert.incident_id}`)}>
                          INC-{alert.incident_number}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="font-mono text-xs">{new Date(alert.timestamp).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
