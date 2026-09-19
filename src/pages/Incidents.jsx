import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, onWsMessage } from '../api/client';
import { AlertTriangle, Search, Filter, CheckCircle2 } from 'lucide-react';

function formatDuration(startStr) {
  if (!startStr) return '—';
  const diff = Date.now() - new Date(startStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function Incidents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [severityFilter, setSeverityFilter] = useState(searchParams.get('severity') || '');

  const load = async () => {
    try {
      const params = {};
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      if (severityFilter) params.severity = severityFilter;
      if (search) params.search = search;
      const data = await api.getIncidents(params);
      setIncidents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, severityFilter, search]);

  useEffect(() => {
    return onWsMessage((msg) => {
      if (msg.type === 'incident_created' || msg.type === 'incident_updated') {
        setTimeout(load, 200);
      }
    });
  }, [statusFilter, severityFilter, search]);

  const statusFilters = ['all', 'triggered', 'investigating', 'acknowledged', 'mitigating', 'resolved'];
  const severityFilters = ['', 'critical', 'warning', 'info'];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Incidents</h1>
            <p>Manage and respond to operational incidents.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        {statusFilters.map(s => (
          <button key={s} className={`filter-chip ${statusFilter === s ? 'active' : ''}`}
            onClick={() => setStatusFilter(s)}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span style={{ color: 'var(--border-primary)' }}>|</span>
        {severityFilters.map(s => (
          <button key={s || 'all-sev'} className={`filter-chip ${severityFilter === s ? 'active' : ''}`}
            onClick={() => setSeverityFilter(s)}>
            {s || 'All Severities'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16, position: 'relative', maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input className="form-input" style={{ paddingLeft: 36 }}
          placeholder="Search incidents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : incidents.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon-container"><CheckCircle2 size={28} /></div>
            <h3>No incidents found</h3>
            <p>{statusFilter !== 'all' ? `No ${statusFilter} incidents.` : 'No incidents match your filters.'}</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Severity</th>
                  <th>Priority</th>
                  <th>Service</th>
                  <th>Environment</th>
                  <th>Team</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map(inc => (
                  <tr key={inc.id} onClick={() => navigate(`/incidents/${inc.id}`)}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>INC-{inc.incident_number}</div>
                      <div className="text-xs text-muted truncate" style={{ maxWidth: 220 }}>{inc.title}</div>
                    </td>
                    <td><span className={`badge ${inc.severity}`}>{inc.severity}</span></td>
                    <td><span className="badge brand">{inc.priority}</span></td>
                    <td style={{ color: 'var(--text-primary)' }}>{inc.service_name || '—'}</td>
                    <td><span className="badge neutral">{inc.environment}</span></td>
                    <td>{inc.team_name || '—'}</td>
                    <td>{inc.assignee_name || '—'}</td>
                    <td>
                      <span className={`badge ${
                        inc.status === 'triggered' ? 'critical'
                        : inc.status === 'resolved' ? 'success'
                        : inc.status === 'acknowledged' ? 'info'
                        : 'warning'
                      }`}>{inc.status}</span>
                    </td>
                    <td className="font-mono text-sm">
                      {inc.status === 'resolved' && inc.resolved_at && inc.started_at
                        ? formatDuration(inc.started_at).replace(/s$/, 's')
                        : formatDuration(inc.started_at)}
                    </td>
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
